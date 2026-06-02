import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { deleteR2Urls } from "@/lib/integrations/r2-cleanup"
import { prepareMutation, logAdminMutation, safeRevalidate } from "@/lib/api-helpers"

const TABLE = "moving_posts"

// 이사 포스트 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  let q: any = supabase
    .from(TABLE)
    .select("*, profiles(nickname, avatar_url)")
    .eq("id", id)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data: post, error } = await q.maybeSingle()

  if (error) {
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }
  if (!post) {
    return NextResponse.json({ error: "게시물을 찾을 수 없습니다" }, { status: 404 })
  }

  return NextResponse.json({ post })
}

// 이사 포스트 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const m = await prepareMutation(request, { table: TABLE, id })
  if (m.error) return m.error

  const body = await request.json()

  const allowedFields = [
    "title", "content", "category", "service_region", "service_district",
    "service_dong", "contact_phone", "min_price", "max_price", "price_unit",
    "images", "sub_region"
  ]

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      updateData[key] = body[key]
    }
  }
  // status 는 소유자가 변경 가능한 값만 화이트리스트 (모더레이션 hidden 우회 방지)
  const OWNER_STATUS_ALLOWED = ['active', 'closed', 'paused']
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
  const { error } = await updQ

  if (error) {
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  if (!m.isOwner && m.isAdmin) {
    void logAdminMutation(m.user.id, "update", TABLE, id, m.resource)
  }

  await safeRevalidate(`/moving/${id}`)
  return NextResponse.json({ success: true })
}

// 이사 포스트 삭제
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

  let delQ: any = m.writer
    .from(TABLE)
    .delete()
    .eq("id", id)
  if (m.plaza) delQ = delQ.eq("plaza_id", m.plaza)
  const { error } = await delQ

  if (error) {
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  void deleteR2Urls(m.resource.images as string[] | null)

  if (!m.isOwner && m.isAdmin) {
    void logAdminMutation(m.user.id, "delete", TABLE, id, m.resource)
  }

  await safeRevalidate(`/moving/${id}`)
  return NextResponse.json({ success: true })
}
