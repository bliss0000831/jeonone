import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { prepareMutation, logAdminMutation, safeRevalidate } from "@/lib/api-helpers"

const TABLE = "property_requests"

// GET: 특정 요청 상세 조회 (+응답 포함)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  let q: any = supabase.from("property_requests").select("*").eq("id", id)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data: req, error } = await q.maybeSingle()

  if (error || !req) {
    return NextResponse.json({ error: "요청을 찾을 수 없습니다" }, { status: 404 })
  }

  // 조회수 증가 — atomic RPC (race condition 방지)
  void supabase.rpc('increment_view_count', { p_table: 'property_requests', p_id: id, p_column: 'views' })

  const { data: author } = await supabase
    .from("profiles")
    .select("id, nickname, full_name, avatar_url, account_type")
    .eq("id", req.user_id)
    .maybeSingle()

  const { data: responses } = await supabase
    .from("property_request_responses")
    .select("id, user_id, request_id, content, property_id, created_at")
    .eq("request_id", id)
    .order("created_at", { ascending: true })

  const responderIds = [...new Set((responses ?? []).map((r) => r.user_id))]
  const respProfiles: Record<string, { id: string; nickname: string | null; full_name: string | null; avatar_url: string | null; account_type: string | null }> = {}
  if (responderIds.length > 0) {
    const { data: rp } = await supabase
      .from("profiles")
      .select("id, nickname, full_name, avatar_url, account_type")
      .in("id", responderIds)
    rp?.forEach((p) => { respProfiles[p.id] = p })
  }

  const responsesWithAuthor = (responses ?? []).map((r) => ({
    ...r,
    author: respProfiles[r.user_id] ?? null,
  }))

  return NextResponse.json({
    request: { ...req, author },
    responses: responsesWithAuthor,
  })
}

// PATCH: 상태 변경 / 내용 수정 (본인 또는 관리자)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const m = await prepareMutation(request, { table: TABLE, id })
  if (m.error) return m.error

  const { writer, user, resource, isOwner, isAdmin, plaza } = m

  const body = await request.json()
  const allowed: Record<string, unknown> = {}
  // title/content 길이 캡 (DoS 방어)
  const lenCap = (v: any, max: number) =>
    typeof v === "string" ? v.slice(0, max) : v
  const safeBody: any = {
    ...body,
    title: lenCap(body.title, 200),
    content: lenCap(body.content, 5000),
  }
  const keys = ["title", "content", "region", "district", "dong", "property_type", "transaction_type", "budget_min", "budget_max", "move_in_date", "sub_region"] as const
  for (const k of keys) {
    if (k in safeBody) allowed[k] = safeBody[k]
  }
  // status 는 소유자가 변경 가능한 값만 화이트리스트 (모더레이션 hidden 우회 방지)
  const OWNER_STATUS_ALLOWED = ['open', 'matched', 'closed']
  if (body.status !== undefined) {
    if (isAdmin || OWNER_STATUS_ALLOWED.includes(body.status)) {
      allowed.status = body.status
    }
  }

  let updateQ: any = writer
    .from(TABLE)
    .update(allowed)
    .eq("id", id)
  if (plaza) updateQ = updateQ.eq("plaza_id", plaza)
  const { data, error } = await updateQ.select().maybeSingle()

  if (error) return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  if (!data) return NextResponse.json({ error: "권한 없음" }, { status: 403 })

  if (!isOwner && isAdmin) {
    void logAdminMutation(user.id, "update", TABLE, id, resource)
  }

  await safeRevalidate(`/property-requests/${id}`)

  return NextResponse.json({ request: data })
}

// DELETE: 삭제 (본인 또는 관리자)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const m = await prepareMutation(request, { table: TABLE, id })
  if (m.error) return m.error

  const { writer, user, resource, isOwner, isAdmin, plaza } = m

  let deleteQ: any = writer
    .from(TABLE)
    .delete()
    .eq("id", id)
  if (plaza) deleteQ = deleteQ.eq("plaza_id", plaza)
  const { error } = await deleteQ

  if (error) return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })

  if (!isOwner && isAdmin) {
    void logAdminMutation(user.id, "delete", TABLE, id, resource)
  }

  await safeRevalidate(`/property-requests/${id}`)

  return NextResponse.json({ success: true })
}
