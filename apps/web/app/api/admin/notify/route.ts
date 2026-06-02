import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { notifyMany } from "@/lib/services/notifications"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { checkAdminAuth } from "@/lib/services/admin-auth"

export const dynamic = 'force-dynamic'

// 현재 광장의 사용자 ID 만 추출 (plaza_profiles 기반)
async function filterUsersByPlaza(
  admin: any,
  userIds: string[],
  plaza: string,
): Promise<string[]> {
  if (userIds.length === 0) return []
  const { data } = await admin
    .from('plaza_profiles')
    .select('user_id')
    .eq('plaza_id', plaza)
    .in('user_id', userIds)
  const allowed = new Set((data || []).map((r: any) => r.user_id))
  return userIds.filter((id) => allowed.has(id))
}

// 권한: shared checkAdminAuth (lib/services/admin-auth.ts) 사용

/**
 * 관리자 → 유저 일괄 알림(notifications 테이블) 발송
 *
 * body:
 *   - targetType: 'all' | 'role' | 'account_type' | 'users'
 *   - targetValue?: string                (role/account_type 일 때)
 *   - userIds?: string[]                  (targetType='users' 일 때)
 *   - title: string
 *   - message: string
 *   - link?: string                       (클릭 시 이동할 내부 경로)
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  }

  // 관리자 권한 확인 (legacy + plaza_admins 둘 다)
  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다" }, { status: 403 })
  }

  // 어드민이라도 일괄 알림 도배 방어 — 어드민당 1시간 10건
  const limited = await enforceRateLimit(request, 'admin-notify', user.id)
  if (limited) return limited

  const body = await request.json().catch(() => ({}))
  const {
    targetType,
    targetValue,
    userIds: rawUserIds,
    title,
    message,
    link,
    thumbnailUrl,
  } = body as {
    targetType?: "all" | "role" | "account_type" | "users"
    targetValue?: string
    userIds?: string[]
    title?: string
    message?: string
    link?: string
    thumbnailUrl?: string
  }

  if (!title?.trim() || !message?.trim()) {
    return NextResponse.json({ error: "제목과 내용을 입력해주세요" }, { status: 400 })
  }

  const admin = createAdminClient()

  // 수신자 결정
  let userIds: string[] = []
  if (targetType === "users") {
    // UUID 형식만 허용 + 최대 1000명
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    userIds = Array.isArray(rawUserIds)
      ? rawUserIds.filter((s): s is string => typeof s === 'string' && UUID_RE.test(s)).slice(0, 1000)
      : []
  } else {
    let q = admin.from("profiles").select("id")
    if (targetType === "role" && targetValue) q = q.eq("role", targetValue)
    if (targetType === "account_type" && targetValue) q = q.eq("account_type", targetValue)
    const { data, error } = await q
    if (error) {
      return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
    }
    userIds = (data || []).map((r: any) => r.id).filter(Boolean)
  }

  // 광장 격리: 광장 도메인에서 호출 시 → 그 광장 멤버만 추림
  // (super 가 hub 에서 호출하면 plaza=null 이므로 그대로 전체 발송)
  if (plaza) {
    userIds = await filterUsersByPlaza(admin, userIds, plaza)
  }

  if (userIds.length === 0) {
    return NextResponse.json({ error: "수신자가 없습니다" }, { status: 400 })
  }

  // link 보안 — same-origin path (`/` 시작) 만 허용. javascript:/data: URL 및 외부 도메인 차단.
  // 관리자 계정 탈취 시 모든 사용자에게 악성 링크 발송되는 것 방지.
  const rawLink = (link || "/notifications").trim()
  const safeLink = /^\/[^\\/]/.test(rawLink) || rawLink === "/" ? rawLink : "/notifications"

  const { success, failed } = await notifyMany(
    admin,
    userIds,
    {
      type: "admin_notice",
      title: title.trim(),
      message: message.trim(),
      link: safeLink,
      thumbnail_url: thumbnailUrl || "https://www.gwangjang.app/app-logo.png",
      actor_id: user.id,
    },
    user.id,
  )

  // 로그 기록 (admin_mail_log 재사용 — channel=notification)
  try {
    await admin.from("admin_mail_log").insert({
      admin_id: user.id,
      channel: "notification",
      target_type: targetType || "all",
      target_value: targetValue || null,
      subject: title.trim(),
      body: message.trim(),
      recipients: userIds.length,
      success,
      failed,
    })
  } catch (logErr) {
    console.error("[admin/notify] log insert error:", logErr)
  }

  return NextResponse.json({
    ok: true,
    recipients: userIds.length,
    success,
    failed,
  })
}

/**
 * 수신자 수 미리보기 (GET)
 * query: targetType, targetValue
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })

  // GET 도 rate limit (총 회원수 probing 방지)
  const limited = await enforceRateLimit(request, 'admin-notify', user.id)
  if (limited) return limited

  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다" }, { status: 403 })
  }

  const url = new URL(request.url)
  const targetType = url.searchParams.get("targetType") || "all"
  const targetValue = url.searchParams.get("targetValue") || ""

  // targetType === "users" 일 때는 콤마 구분 ID 목록의 갯수만 반환 (POST 와 동일 분기)
  if (targetType === "users") {
    const ids = targetValue
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    return NextResponse.json({ count: ids.length })
  }

  const admin = createAdminClient()
  let q = admin.from("profiles").select("id")
  if (targetType === "role" && targetValue) q = q.eq("role", targetValue)
  if (targetType === "account_type" && targetValue) q = q.eq("account_type", targetValue)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })

  let ids = (data || []).map((r: any) => r.id).filter(Boolean)
  if (plaza) {
    ids = await filterUsersByPlaza(admin, ids, plaza)
  }
  return NextResponse.json({ count: ids.length })
}
