import { createClient } from "@/lib/supabase/server"
import { prepareMutation, logAdminMutation, safeRevalidate } from "@/lib/api-helpers"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { deleteR2Urls } from "@/lib/integrations/r2-cleanup"

const TABLE = "new_store_posts"

// 신장개업 글 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  let q: any = supabase.from("new_store_posts").select("*").eq("id", id)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data: post, error } = await q.maybeSingle()

  if (error) {
    console.error("[new-store GET] error:", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }
  if (!post) {
    return NextResponse.json({ error: "게시물을 찾을 수 없습니다" }, { status: 404 })
  }

  return NextResponse.json({ post })
}

// 신장개업 글 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const m = await prepareMutation(request, { table: TABLE, id })
  if (m.error) return m.error

  // 비관리자: business 계정만 수정 가능
  if (!m.isAdmin) {
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
    "store_name", "description", "category", "address", "phone",
    "opening_date", "opening_event", "images", "sub_region"
  ]

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      updateData[key] = body[key]
    }
  }
  // status 는 소유자가 변경 가능한 값만 화이트리스트 (모더레이션 hidden 우회 방지)
  const OWNER_STATUS_ALLOWED = ['active', 'closed']
  if (body.status !== undefined) {
    if (m.isAdmin || OWNER_STATUS_ALLOWED.includes(body.status)) {
      updateData.status = body.status
    }
  }

  let updQ: any = m.writer
    .from(TABLE)
    .update(updateData)
    .eq("id", id)
  if (m.plaza) updQ = updQ.eq("plaza_id", m.plaza)
  const { data: updated, error } = await updQ.select("id")
  if (!error && (!updated || updated.length === 0)) {
    console.error("[new-store PATCH] 0 rows — RLS block?", { id, userId: m.user.id, isAdmin: m.isAdmin })
    return NextResponse.json({ error: "수정에 실패했습니다 (RLS 차단)" }, { status: 500 })
  }

  if (error) {
    console.error("[new-store PATCH]", error)
    return NextResponse.json({ error: "수정 실패" }, { status: 500 })
  }

  if (m.isAdmin && !m.isOwner) {
    void logAdminMutation(m.user.id, "update", TABLE, id, m.resource)
  }

  await safeRevalidate(`/new-store/${id}`)
  return NextResponse.json({ success: true })
}

// 신장개업 글 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const m = await prepareMutation(request, { table: TABLE, id, selectCols: "user_id, plaza_id, images" })
  if (m.error) return m.error

  // 비관리자: business 계정만 삭제 가능
  if (!m.isAdmin) {
    const { data: profile } = await m.supabase
      .from("profiles")
      .select("account_type")
      .eq("id", m.user.id)
      .single()
    if (profile?.account_type !== "business") {
      return NextResponse.json({ error: "사장님 계정만 삭제할 수 있습니다" }, { status: 403 })
    }
  }

  let delQ: any = m.writer
    .from(TABLE)
    .delete()
    .eq("id", id)
  if (m.plaza) delQ = delQ.eq("plaza_id", m.plaza)
  const { data: deleted, error } = await delQ.select("id")
  if (!error && (!deleted || deleted.length === 0)) {
    console.error("[new-store DELETE] 0 rows — RLS block?", { id, userId: m.user.id, isAdmin: m.isAdmin })
    return NextResponse.json({ error: "삭제에 실패했습니다 (RLS 차단)" }, { status: 500 })
  }

  if (error) {
    console.error("[new-store DELETE]", error)
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 })
  }

  void deleteR2Urls(m.resource?.images as string[] | null)

  if (m.isAdmin && !m.isOwner) {
    void logAdminMutation(m.user.id, "delete", TABLE, id, m.resource)
  }

  await safeRevalidate(`/new-store/${id}`)
  return NextResponse.json({ success: true })
}
