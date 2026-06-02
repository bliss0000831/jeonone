import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkAdminAuth } from "@/lib/services/admin-auth"
import { getCurrentPlaza } from "@/lib/plaza/server"

export const dynamic = "force-dynamic"

/**
 * POST /api/admin/broadcast-cancel
 *
 * 관리자 발송(알림/쪽지) 취소 — 사용자 측 데이터도 삭제
 * body: { logId: string }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  }

  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const logId = body.logId as string
  if (!logId) {
    return NextResponse.json({ error: "logId가 필요합니다" }, { status: 400 })
  }

  // 광장 격리 — 삭제는 현재 광장 데이터로만 한정 (타 광장 알림/쪽지 동시 삭제 방지)
  const plaza = await getCurrentPlaza()

  const admin = createAdminClient()

  // 1. 발송 로그 조회
  const { data: log, error: logErr } = await admin
    .from("admin_mail_log")
    .select("*")
    .eq("id", logId)
    .single()

  if (logErr || !log) {
    return NextResponse.json({ error: "발송 이력을 찾을 수 없습니다" }, { status: 404 })
  }

  let deleted = 0

  // 2. 채널별 삭제 처리
  if (log.channel === "notification") {
    // 알림 삭제: type='admin_notice', title=subject, actor_id=admin_id, 발송 시각 ±2분
    const createdAt = new Date(log.created_at)
    const from = new Date(createdAt.getTime() - 2 * 60 * 1000).toISOString()
    const to = new Date(createdAt.getTime() + 2 * 60 * 1000).toISOString()

    let q = admin
      .from("notifications")
      .delete()
      .eq("type", "admin_notice")
      .gte("created_at", from)
      .lte("created_at", to)
    if (log.subject) q = q.eq("title", log.subject)
    if (log.admin_id) q = q.eq("actor_id", log.admin_id)
    if (plaza) q = q.eq("plaza_id", plaza)
    const { data: targets, error: delErr } = await q.select("id")

    if (delErr) {
      console.error("[broadcast-cancel] notification delete error:", delErr)
      return NextResponse.json({ error: "알림 삭제에 실패했습니다" }, { status: 500 })
    }
    deleted = targets?.length ?? 0
  } else if (log.channel === "message" || log.channel === "mail") {
    // 쪽지 삭제: admin_notice 채팅방에서 해당 관리자가 보낸 메시지
    const content = log.subject ? `[${log.subject}]\n${log.body}` : log.body
    const createdAt = new Date(log.created_at)
    const from = new Date(createdAt.getTime() - 2 * 60 * 1000).toISOString()
    const to = new Date(createdAt.getTime() + 5 * 60 * 1000).toISOString()

    // admin_notice 채팅방에서 관리자가 보낸 해당 내용의 메시지 삭제
    let mq = admin
      .from("messages")
      .delete()
      .eq("content", content)
      .gte("created_at", from)
      .lte("created_at", to)
    if (log.admin_id) mq = mq.eq("sender_id", log.admin_id)
    if (plaza) mq = mq.eq("plaza_id", plaza)
    const { data: msgs, error: msgErr } = await mq.select("id")

    if (msgErr) {
      console.error("[broadcast-cancel] message delete error:", msgErr)
      return NextResponse.json({ error: "쪽지 삭제에 실패했습니다" }, { status: 500 })
    }
    deleted = msgs?.length ?? 0
  } else if (log.channel === "email") {
    // 이메일은 회수 불가 — 로그만 삭제
    deleted = 0
  }

  // 3. 발송 로그 삭제
  await admin.from("admin_mail_log").delete().eq("id", logId)

  return NextResponse.json({
    ok: true,
    channel: log.channel,
    deleted,
    message:
      log.channel === "email"
        ? "발송 이력이 삭제되었습니다. (이메일은 회수 불가)"
        : `${deleted}건 삭제 완료`,
  })
}
