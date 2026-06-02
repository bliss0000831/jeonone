import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { deleteR2Urls } from "@/lib/integrations/r2-cleanup"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import {
  prepareMutation,
  logAdminMutation,
  safeRevalidate,
} from "@/lib/api-helpers"

const TABLE = "local_food"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  // 상세조회 — 🅲 cross-plaza national 글 허용
  let q: any = supabase.from("local_food").select("*").eq("id", id)
  if (plaza) q = q.or(`plaza_id.eq.${plaza},visibility.eq.national`)
  const { data: post, error } = await q.single()

  if (error || !post) {
    return NextResponse.json(
      { error: "게시글을 찾을 수 없습니다" },
      { status: 404 },
    )
  }

  // 조회수 +1 — atomic RPC (race-free)
  void supabase.rpc('increment_view_count', { p_table: 'local_food', p_id: id, p_column: 'views' })

  // Get author profile separately
  if (post.user_id) {
    const { data: author } = await supabase
      .from("profiles")
      .select("id, nickname, avatar_url, account_type")
      .eq("id", post.user_id)
      .maybeSingle()

    post.author = author || null
  }

  // Check if user liked
  const { user } = await getAuthedUser(supabase, request)
  if (user) {
    const { data: like } = await supabase
      .from("local_food_likes")
      .select("id")
      .eq("user_id", user.id)
      .eq("local_food_id", id)
      .maybeSingle()

    post.user_liked = !!like
  }

  return NextResponse.json({ post })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const m = await prepareMutation(request, { table: TABLE, id })
  if (m.error) return m.error

  const { writer, user, resource, isOwner, isAdmin, plaza } = m

  if (!isOwner && isAdmin) {
    void logAdminMutation(user.id, "update", TABLE, id, resource)
  }

  const body = await request.json()

  const allowedFields = [
    'title', 'description', 'content', 'price', 'original_price',
    'unit', 'category', 'images', 'location', 'district',
    'farm_name', 'shipping_fee', 'free_shipping', 'status', 'visibility', 'sub_region',
  ]
  const filtered: Record<string, any> = {}
  for (const key of allowedFields) {
    if (key in body) filtered[key] = body[key]
  }

  const baseUpdate: Record<string, any> = {
    title: body.title,
    description: body.description,
    content: body.content,
    price: body.price,
    original_price: body.original_price,
    unit: body.unit,
    category: body.category,
    images: body.images,
    location: body.location,
    district: body.district,
    farm_name:
      typeof body.farm_name === "string" && body.farm_name.trim()
        ? body.farm_name.trim().slice(0, 60)
        : body.farm_name === null
        ? null
        : undefined,
    shipping_fee:
      body.free_shipping === true
        ? 0
        : typeof body.shipping_fee !== "undefined"
        ? Math.max(0, Math.floor(Number(body.shipping_fee) || 0))
        : undefined,
    free_shipping:
      typeof body.free_shipping === "boolean" ? body.free_shipping : undefined,
    // 소유자가 변경 가능한 status 화이트리스트 (모더레이션 hidden 우회 방지)
    status: ['active', 'sold_out', 'paused'].includes(body.status) ? body.status : undefined,
    updated_at: new Date().toISOString(),
  }
  const visibilityValue =
    body.visibility === "national" || body.visibility === "plaza" ? body.visibility : undefined

  // 1차 시도: visibility 포함
  let updQ: any = writer
    .from(TABLE)
    .update({ ...baseUpdate, visibility: visibilityValue })
    .eq("id", id)
  if (plaza) updQ = updQ.eq("plaza_id", plaza)
  let { data, error } = await updQ.select().single()

  // 2차 fallback: visibility 컬럼 없으면 visibility 빼고 재시도
  if (error && /visibility/i.test(error.message || "")) {
    console.warn("[local-food PUT] visibility 컬럼 없음 — fallback UPDATE")
    let retryQ: any = writer.from(TABLE).update(baseUpdate).eq("id", id)
    if (plaza) retryQ = retryQ.eq("plaza_id", plaza)
    const retry = await retryQ.select().single()
    data = retry.data
    error = retry.error
  }

  if (error) {
    console.error("[local-food PUT]", error)
    return NextResponse.json(
      { error: "수정에 실패했습니다" },
      { status: 500 },
    )
  }

  await safeRevalidate(`/local-food/${id}`)
  return NextResponse.json({ post: data })
}

// 모바일 클라이언트는 PATCH 로 보내고 웹은 PUT 으로 보냄 — 둘 다 동일 핸들러로
export { PUT as PATCH }

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const m = await prepareMutation(request, {
    table: TABLE,
    id,
    selectCols: "user_id, plaza_id, images",
  })
  if (m.error) return m.error

  const { writer, supabase, user, resource, isOwner, isAdmin, plaza } = m

  if (!isOwner && isAdmin) {
    void logAdminMutation(user.id, "delete", TABLE, id, resource)
  }

  // force=true 면 child 테이블 cascade 삭제 (admin/owner 가 명시적 확인 후)
  // child 테이블 RLS 우회를 위해 service_role 항상 사용
  const { searchParams } = new URL(request.url)
  const force = searchParams.get("force") === "true"
  let deleteWriter: any = writer
  if (force) {
    let cascadeWriter: any = writer
    if (writer === supabase) {
      const { getAdminWriteClient } = await import("@/lib/services/admin-auth")
      const wc = await getAdminWriteClient()
      if (wc) {
        cascadeWriter = wc
        deleteWriter = wc
      }
    }
    // local_food_order_items 먼저 삭제 (FK 자식)
    await cascadeWriter
      .from("local_food_order_items")
      .delete()
      .eq("local_food_id", id)
    // local_food_likes 등 다른 자식도 함께 정리
    await cascadeWriter
      .from("local_food_likes")
      .delete()
      .eq("local_food_id", id)
  }

  let delQ: any = deleteWriter.from(TABLE).delete().eq("id", id)
  if (plaza) delQ = delQ.eq("plaza_id", plaza)
  const { data: deleted, error } = await delQ.select("id")

  // FK 제약 (주문 이력 존재) → 숨김 처리 fallback (force=false 일 때만)
  // 주문 보존 + 카드/검색 노출 차단 = 사용자에겐 "삭제됨" 과 동일한 효과
  if (!force && error && (error as any)?.code === "23503") {
    console.warn("[local-food DELETE] FK conflict — falling back to status=hidden", { id })
    let updQ: any = deleteWriter
      .from(TABLE)
      .update({ status: "hidden", updated_at: new Date().toISOString() })
      .eq("id", id)
    if (plaza) updQ = updQ.eq("plaza_id", plaza)
    const { data: hidden, error: updErr } = await updQ.select("id")
    if (updErr) {
      return NextResponse.json(
        { error: `${updErr.message ?? "숨김 처리 실패"} (code: ${(updErr as any)?.code ?? "?"})` },
        { status: 500 },
      )
    }
    if (!hidden || hidden.length === 0) {
      return NextResponse.json({ error: "숨김 처리에 실패했습니다 (0 rows)" }, { status: 500 })
    }
    await safeRevalidate(`/local-food/${id}`)
    return NextResponse.json({ success: true, hidden: true, reason: "주문 이력이 있어 숨김 처리됨" })
  }

  if (error) {
    console.error("[local-food DELETE] error:", error)
    return NextResponse.json(
      { error: "삭제에 실패했습니다" },
      { status: 500 },
    )
  }
  if (!deleted || deleted.length === 0) {
    // RLS 가 막아서 0 rows 인 케이스 → 명시적 에러
    console.error("[local-food DELETE] 0 rows affected — likely RLS block", { id, userId: user.id, isAdmin, isOwnerDelete: isOwner })
    return NextResponse.json(
      { error: "삭제에 실패했습니다 (RLS 차단)" },
      { status: 500 },
    )
  }

  void deleteR2Urls(resource.images as string[] | null)

  await safeRevalidate(`/local-food/${id}`)
  return NextResponse.json({ success: true, deletedCount: deleted.length })
}
