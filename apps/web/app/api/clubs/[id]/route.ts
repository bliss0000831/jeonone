import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { prepareMutation, logAdminMutation, safeRevalidate } from "@/lib/api-helpers"
import { deleteR2Urls } from "@/lib/integrations/r2-cleanup"

const TABLE = "clubs"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  let q: any = supabase.from("clubs").select("*").eq("id", id)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data: post, error } = await q.single()

  if (error || !post) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다" }, { status: 404 })
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, nickname, avatar_url")
    .eq("id", post.user_id)
    .single()

  // 조회수 증가 — fire-and-forget atomic RPC
  void supabase.rpc("increment_view_count", {
    p_table: "clubs",
    p_id: id,
    p_column: "view_count",
  })

  return NextResponse.json({ post: { ...post, profiles: profile } })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const m = await prepareMutation(request, { table: TABLE, id, selectCols: "user_id, plaza_id, images" })
  if (m.error) return m.error

  const { writer, resource, isOwner, isAdmin, user, plaza } = m

  // force=true 면 자식 행(멤버/채팅) 먼저 삭제 — 관리자/작성자 강제
  // child 테이블 RLS 우회를 위해 service_role 항상 사용
  const { searchParams } = new URL(request.url)
  const force = searchParams.get("force") === "true"
  if (force) {
    let cascadeWriter: any = writer
    // owner 가 직접 삭제하는 경우 writer 는 일반 supabase → cascade 에는 admin 필요
    if (isOwner && !isAdmin) {
      const { getAdminWriteClient } = await import("@/lib/services/admin-auth")
      const wc = await getAdminWriteClient()
      if (wc) cascadeWriter = wc
    }
    await cascadeWriter.from("club_chat_messages").delete().eq("club_id", id)
    await cascadeWriter.from("club_members").delete().eq("club_id", id)
  }

  let delQ: any = writer.from(TABLE).delete().eq("id", id)
  if (plaza) delQ = delQ.eq("plaza_id", plaza)
  const { data: deleted, error } = await delQ.select("id")
  if (!error && (!deleted || deleted.length === 0)) {
    console.error("[clubs DELETE] 0 rows — RLS block?", { id, userId: user.id, isAdmin })
    return NextResponse.json({ error: "삭제에 실패했습니다 (RLS 차단)" }, { status: 500 })
  }

  if (error) {
    console.error("[clubs DELETE]", error)
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 })
  }

  void deleteR2Urls(resource.images as string[] | null)

  if (!isOwner && isAdmin) {
    void logAdminMutation(user.id, "delete", TABLE, id, resource)
  }

  await safeRevalidate(`/clubs/${id}`)
  return NextResponse.json({ success: true })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const m = await prepareMutation(request, { table: TABLE, id })
  if (m.error) return m.error

  const { writer, user, isAdmin, isOwner, plaza, resource } = m

  const body = await request.json()

  // 화이트리스트 — body 통째 spread 하면 user_id/plaza_id/status 등을 클라이언트가
  // 멋대로 변경 가능. 허용된 필드만 통과시킨다.
  const allowedFields = [
    'title', 'description', 'category', 'sport_type', 'location',
    'meeting_time', 'meeting_place', 'max_members', 'fee', 'fee_type',
    'images', 'tags', 'contact', 'rules', 'sub_region',
  ]
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowedFields) {
    if (body[k] !== undefined) updateData[k] = body[k]
  }

  let updQ: any = writer.from(TABLE).update(updateData).eq("id", id)
  if (plaza) updQ = updQ.eq("plaza_id", plaza)
  const { data: updated, error } = await updQ.select("id")
  if (!error && (!updated || updated.length === 0)) {
    console.error("[clubs PATCH] 0 rows — RLS block?", { id, userId: user.id, isAdmin })
    return NextResponse.json({ error: "수정에 실패했습니다 (RLS 차단)" }, { status: 500 })
  }

  if (error) {
    console.error("[clubs PATCH]", error)
    return NextResponse.json({ error: "수정 실패" }, { status: 500 })
  }

  if (!isOwner && isAdmin) {
    void logAdminMutation(user.id, "update", TABLE, id, resource)
  }

  await safeRevalidate(`/clubs/${id}`)
  return NextResponse.json({ success: true })
}
