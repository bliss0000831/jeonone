import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { deleteR2Urls } from "@/lib/integrations/r2-cleanup"
import { prepareMutation, logAdminMutation, safeRevalidate } from "@/lib/api-helpers"

const TABLE = "secondhand_posts"

// 상세 조회 (+ 조회수 증가)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  let q = supabase.from(TABLE).select("*").eq("id", id)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data: post, error } = await q.single()
  if (error || !post) {
    return NextResponse.json({ error: "찾을 수 없습니다" }, { status: 404 })
  }

  // 조회수 +1 — atomic RPC (race-free)
  void supabase.rpc('increment_view_count', { p_table: TABLE, p_id: id, p_column: 'views' })

  // 작성자 프로필
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, nickname, avatar_url")
    .eq("id", (post as Record<string, unknown>).user_id as string)
    .maybeSingle()

  return NextResponse.json({ post: { ...post, profiles: profile || null } })
}

// 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const m = await prepareMutation(request, { table: TABLE, id })
  if (m.error) return m.error
  const { writer, isAdmin, plaza } = m

  const body = await request.json()
  const allowed = [
    "title", "description", "category", "price",
    "is_price_negotiable", "images", "location", "condition", "status", "sub_region",
  ]
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  for (const k of allowed) {
    if (body[k] !== undefined) updateData[k] = body[k]
  }
  // condition 은 trim + 20자 cap (정상 운영 입력 보호)
  if (typeof updateData.condition === "string") {
    const v = (updateData.condition as string).trim()
    updateData.condition = v ? v.slice(0, 20) : null
  }

  let updQ = writer.from(TABLE).update(updateData).eq("id", id)
  if (plaza) updQ = updQ.eq("plaza_id", plaza)
  const { data: updated, error } = await updQ.select("id")
  if (error) {
    console.error("[secondhand PATCH] error:", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }
  if (!updated || (updated as unknown[]).length === 0) {
    console.error("[secondhand PATCH] 0 rows — RLS block?", { id, userId: m.user.id, isAdmin })
    return NextResponse.json({ error: "수정에 실패했습니다 (RLS 차단)" }, { status: 500 })
  }
  await safeRevalidate(`/secondhand/${id}`)
  return NextResponse.json({ success: true })
}

// 삭제
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

  let delQ = writer.from(TABLE).delete().eq("id", id)
  if (plaza) delQ = delQ.eq("plaza_id", plaza)
  const { data: deleted, error } = await delQ.select("id")
  if (!error && (!deleted || (deleted as unknown[]).length === 0)) {
    console.error("[secondhand DELETE] 0 rows — RLS block?", { id, userId: m.user.id, isAdmin })
    return NextResponse.json({ error: "삭제에 실패했습니다 (RLS 차단)" }, { status: 500 })
  }
  if (error) {
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }
  // admin 이 타인 글 삭제한 경우 audit log
  if (!isOwner && isAdmin) {
    void logAdminMutation(m.user.id, "delete", TABLE, id, resource)
  }
  void deleteR2Urls(resource.images as string[] | null)
  await safeRevalidate(`/secondhand/${id}`)
  return NextResponse.json({ success: true })
}
