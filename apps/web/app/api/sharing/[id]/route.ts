import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { deleteR2Urls } from "@/lib/integrations/r2-cleanup"
import { prepareMutation, logAdminMutation, safeRevalidate } from "@/lib/api-helpers"

const TABLE = "sharing_posts"

// 나눔 글 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  let q: any = supabase.from("sharing_posts").select("*").eq("id", id)
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

// 나눔 글 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const m = await prepareMutation(request, {
    table: TABLE,
    id,
    selectCols: "user_id, plaza_id, status",
  })
  if (m.error) return m.error
  const { writer, resource, isOwner, isAdmin, plaza } = m

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 })
  }

  // 허용된 필드만 업데이트
  const allowedFields = ["title", "description", "category", "images", "location", "status", "sub_region"]
  // owner 가 가질 수 있는 status (admin 은 제한 없음)
  // 'hidden' 은 admin moderation 자동 숨김 상태 — owner 가 PATCH 로 풀면 신고 처리 우회
  const OWNER_STATUS_ALLOWED = new Set(["active", "completed", "cancelled"])

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      if (key === "status" && !isAdmin) {
        if (resource.status === "hidden") {
          return NextResponse.json(
            { error: "숨김 처리된 글은 상태를 변경할 수 없습니다" },
            { status: 403 },
          )
        }
        if (!OWNER_STATUS_ALLOWED.has(String(body[key]))) {
          return NextResponse.json(
            { error: "허용되지 않은 상태 값입니다" },
            { status: 400 },
          )
        }
      }
      updateData[key] = body[key]
    }
  }

  let updQ = writer.from(TABLE).update(updateData).eq("id", id)
  if (plaza) updQ = updQ.eq("plaza_id", plaza)
  const { data: updated, error } = await updQ.select("id")
  if (error) {
    console.error("[sharing PATCH] error:", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }
  if (!updated || (updated as unknown[]).length === 0) {
    console.error("[sharing PATCH] 0 rows — RLS block?", { id, userId: m.user.id, isAdmin })
    return NextResponse.json({ error: "수정에 실패했습니다 (RLS 차단)" }, { status: 500 })
  }

  // admin 이 타인 글 수정한 경우 audit log
  if (!isOwner && isAdmin) {
    void logAdminMutation(m.user.id, "update", TABLE, id, resource)
  }
  await safeRevalidate(`/sharing/${id}`)
  return NextResponse.json({ success: true })
}

// 나눔 글 삭제
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
  const { writer, resource, isOwner, isAdmin, plaza } = m

  let delQ = writer.from(TABLE).delete().eq("id", id)
  if (plaza) delQ = delQ.eq("plaza_id", plaza)
  const { data: deleted, error } = await delQ.select("id")
  if (!error && (!deleted || (deleted as unknown[]).length === 0)) {
    console.error("[sharing DELETE] 0 rows — RLS block?", { id, userId: m.user.id, isAdmin })
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
  await safeRevalidate(`/sharing/${id}`)
  return NextResponse.json({ success: true })
}
