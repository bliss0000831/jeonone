import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { deleteR2Urls } from "@/lib/integrations/r2-cleanup"
import { prepareMutation, logAdminMutation, safeRevalidate } from "@/lib/api-helpers"

const TABLE = "jobs_posts"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  let q: any = supabase.from("jobs_posts").select("*").eq("id", id)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data: post, error } = await q.maybeSingle()
  if (error) {
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }
  if (!post) {
    return NextResponse.json({ error: "찾을 수 없습니다" }, { status: 404 })
  }

  // atomic RPC (race-free)
  void supabase.rpc('increment_view_count', { p_table: 'jobs_posts', p_id: id, p_column: 'views' })

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, nickname, avatar_url")
    .eq("id", post.user_id)
    .maybeSingle()

  return NextResponse.json({ post: { ...post, profiles: profile || null } })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const m = await prepareMutation(request, { table: TABLE, id })
  if (m.error) return m.error

  const { writer, isOwner, isAdmin, plaza } = m

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 })
  }
  const allowed = [
    "kind",
    "title",
    "description",
    "category",
    "work_type",
    "hourly_wage",
    "work_days",
    "work_hours",
    "location",
    "contact",
    "images",
    "sub_region",
  ]
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  for (const k of allowed) {
    if (body[k] !== undefined) updateData[k] = body[k]
  }
  // status 는 소유자가 변경 가능한 값만 화이트리스트 (모더레이션 hidden 우회 방지)
  const OWNER_STATUS_ALLOWED = ['active', 'closed', 'completed']
  if (body.status !== undefined) {
    if (m.isAdmin || OWNER_STATUS_ALLOWED.includes(body.status)) {
      updateData.status = body.status
    }
  }

  let updQ: any = writer
    .from(TABLE)
    .update(updateData)
    .eq("id", id)
  if (plaza) updQ = updQ.eq("plaza_id", plaza)
  const { data: updated, error } = await updQ.select("id")
  if (!error && (!updated || updated.length === 0)) {
    console.error("[jobs PATCH] 0 rows — RLS block?", { id, userId: m.user.id, isAdmin })
    return NextResponse.json({ error: "수정에 실패했습니다 (RLS 차단)" }, { status: 500 })
  }
  if (error) {
    console.error("[jobs PATCH] error:", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  if (!isOwner && isAdmin) {
    void logAdminMutation(m.user.id, "update", TABLE, id, m.resource)
  }

  await safeRevalidate(`/jobs/${id}`)
  return NextResponse.json({ success: true })
}

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

  let delQ: any = writer.from(TABLE).delete().eq("id", id)
  if (plaza) delQ = delQ.eq("plaza_id", plaza)
  const { data: deleted, error } = await delQ.select("id")
  if (!error && (!deleted || deleted.length === 0)) {
    console.error("[jobs DELETE] 0 rows — RLS block?", { id, userId: m.user.id, isAdmin })
    return NextResponse.json({ error: "삭제에 실패했습니다 (RLS 차단)" }, { status: 500 })
  }
  if (error) {
    console.error("[jobs DELETE] error:", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  if (!isOwner && isAdmin) {
    void logAdminMutation(m.user.id, "delete", TABLE, id, resource)
  }
  void deleteR2Urls(resource.images as string[] | null)

  await safeRevalidate(`/jobs/${id}`)
  return NextResponse.json({ success: true })
}
