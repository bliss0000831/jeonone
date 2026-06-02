import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { deleteR2Urls } from "@/lib/integrations/r2-cleanup"
import { prepareMutation, logAdminMutation, safeRevalidate } from "@/lib/api-helpers"

const TABLE = "group_buying_posts"

// 공동구매 글 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  // 🅲 cross-plaza — national 글은 타광장에서도 조회 가능
  let q: any = supabase.from("group_buying_posts").select("*").eq("id", id)
  if (plaza) q = q.or(`plaza_id.eq.${plaza},visibility.eq.national`)
  const { data: post, error } = await q.maybeSingle()

  if (error) {
    console.error("[group-buying GET] error:", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }
  if (!post) {
    return NextResponse.json({ error: "게시물을 찾을 수 없습니다" }, { status: 404 })
  }

  return NextResponse.json({ post })
}

// 공동구매 글 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const m = await prepareMutation(request, {
    table: TABLE,
    id,
    selectCols: "user_id, plaza_id, images",
  })
  if (m.error) return m.error

  const { writer, isOwner, isAdmin, plaza } = m

  // 관리자가 아닌 경우 business 계정 검증
  if (!isAdmin) {
    const { data: profile } = await m.supabase
      .from("profiles")
      .select("account_type")
      .eq("id", m.user.id)
      .single()
    if (profile?.account_type !== "business") {
      return NextResponse.json({ error: "사장님 계정만 수정할 수 있습니다" }, { status: 403 })
    }
  }

  const body = await request.json()

  // 허용된 필드만 업데이트
  const allowedFields = [
    "title", "description", "product_name", "original_price", "group_price",
    "min_participants", "max_participants", "deadline", "images", "location",
    "visibility", "sub_region",
  ]

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      updateData[key] = body[key]
    }
  }

  let updQ: any = writer
    .from(TABLE)
    .update(updateData)
    .eq("id", id)
  if (plaza) updQ = updQ.eq("plaza_id", plaza)
  const { data: updated, error } = await updQ.select("id")
  if (!error && (!updated || updated.length === 0)) {
    console.error("[group-buying PATCH] 0 rows — RLS block?", { id, userId: m.user.id, isAdmin })
    return NextResponse.json({ error: "수정에 실패했습니다 (RLS 차단)" }, { status: 500 })
  }
  if (error) {
    console.error("[group-buying PATCH]", error)
    return NextResponse.json({ error: "수정 실패" }, { status: 500 })
  }

  if (!isOwner && isAdmin) {
    void logAdminMutation(m.user.id, "update", TABLE, id, m.resource)
  }

  await safeRevalidate(`/group-buying/${id}`)
  return NextResponse.json({ success: true })
}

// 공동구매 글 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const m = await prepareMutation(request, {
    table: TABLE,
    id,
    selectCols: "user_id, plaza_id, images",
  })
  if (m.error) return m.error

  const { writer, resource, isOwner, isAdmin, plaza } = m

  // 관리자가 아닌 경우 business 계정 검증
  if (!isAdmin) {
    const { data: profile } = await m.supabase
      .from("profiles")
      .select("account_type")
      .eq("id", m.user.id)
      .single()
    if (profile?.account_type !== "business") {
      return NextResponse.json({ error: "사장님 계정만 삭제할 수 있습니다" }, { status: 403 })
    }
  }

  // force=true 면 자식 행(참여자/메시지/주문) 먼저 삭제 — 관리자/작성자 강제
  // child 테이블 RLS 우회를 위해 service_role 항상 사용
  const { searchParams } = new URL(request.url)
  const force = searchParams.get("force") === "true"
  let effectiveWriter: any = writer
  if (force) {
    let cascadeWriter: any = writer
    // owner 가 직접 삭제하는 경우 writer 는 일반 supabase → cascade 에는 admin 필요
    if (isOwner && !isAdmin) {
      const { getAdminWriteClient } = await import("@/lib/services/admin-auth")
      const wc = await getAdminWriteClient()
      if (wc) {
        cascadeWriter = wc
        effectiveWriter = wc
      }
    }
    await cascadeWriter.from("group_buying_chat_messages").delete().eq("post_id", id)
    await cascadeWriter.from("group_buying_participants").delete().eq("post_id", id)
    await cascadeWriter.from("group_buying_orders").delete().eq("post_id", id)
  }

  let delQ: any = effectiveWriter
    .from(TABLE)
    .delete()
    .eq("id", id)
  if (plaza) delQ = delQ.eq("plaza_id", plaza)
  const { data: deleted, error } = await delQ.select("id")
  if (!error && (!deleted || deleted.length === 0)) {
    console.error("[group-buying DELETE] 0 rows — RLS block?", { id, userId: m.user.id, isAdmin })
    return NextResponse.json({ error: "삭제에 실패했습니다 (RLS 차단)" }, { status: 500 })
  }
  if (error) {
    console.error("[group-buying DELETE]", error)
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 })
  }

  if (!isOwner && isAdmin) {
    void logAdminMutation(m.user.id, "delete", TABLE, id, resource)
  }
  void deleteR2Urls(resource.images as string[] | null)

  await safeRevalidate(`/group-buying/${id}`)
  return NextResponse.json({ success: true })
}
