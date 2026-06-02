import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { checkAdminAuth, canAccessPlaza, getAdminWriteClient } from "@/lib/services/admin-auth"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { Resend } from "resend"

export const dynamic = "force-dynamic"

// HTML 이스케이프 — 제목/본문의 <, &, " 등이 메일 레이아웃을 깨거나 주입되지 않도록.
// (white-space: pre-wrap 이라 개행은 그대로 유지됨)
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// lazy init — 빌드 시점에 env 없어도 에러 안 나도록
let _resend: Resend | null = null
function getResend() {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error("RESEND_API_KEY 환경변수가 설정되지 않았습니다")
    _resend = new Resend(key)
  }
  return _resend
}

/**
 * POST /api/admin/email
 *
 * 관리자 이메일 일괄 발송.
 * Resend API 사용, 발신: no-reply@gwangjang.app
 *
 * 이메일은 auth.users 에 있으므로 admin.auth.admin.listUsers 또는
 * admin.auth.admin.getUserById 로 조회.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 })

  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) return NextResponse.json({ error: "권한 없음" }, { status: 403 })

  const limited = await enforceRateLimit(request as any, "admin-notify", user.id)
  if (limited) return limited

  const plaza = await getCurrentPlaza()
  if (!auth.isLegacySuper && !canAccessPlaza(auth, plaza)) {
    return NextResponse.json({ error: "이 광장의 권한이 없습니다" }, { status: 403 })
  }

  const body = await request.json()
  const { subject, message, targetType, targetValue } = body

  if (!subject || !message) {
    return NextResponse.json({ error: "제목과 내용이 필요합니다" }, { status: 400 })
  }

  const admin = await getAdminWriteClient()
  if (!admin) return NextResponse.json({ error: "Service role key 미설정" }, { status: 500 })

  // 1. 광장 회원 목록
  let userIds: string[] = []
  if (plaza) {
    const { data: plazaMembers } = await admin
      .from("plaza_profiles")
      .select("user_id")
      .eq("plaza_id", plaza)
    userIds = (plazaMembers || []).map((p: any) => p.user_id)
  }

  if (userIds.length === 0) {
    return NextResponse.json({ error: "발송 대상이 없습니다" }, { status: 400 })
  }

  // 2. 역할/계정유형 필터
  if (targetType === "role" && targetValue) {
    const { data } = await admin.from("profiles").select("id").in("id", userIds).eq("role", targetValue)
    userIds = (data || []).map((p: any) => p.id)
  }
  if (targetType === "account_type" && targetValue) {
    const { data } = await admin.from("profiles").select("id").in("id", userIds).eq("account_type", targetValue)
    userIds = (data || []).map((p: any) => p.id)
  }

  if (userIds.length === 0) {
    return NextResponse.json({ error: "필터 조건에 맞는 대상이 없습니다" }, { status: 400 })
  }

  // 3. auth.users 에서 이메일 조회 (service role)
  const emailMap = new Map<string, string>()
  const CHUNK = 50
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const chunk = userIds.slice(i, i + CHUNK)
    const results = await Promise.all(
      chunk.map(uid => admin.auth.admin.getUserById(uid).then(r => r.data?.user).catch(() => null))
    )
    for (const u of results) {
      if (u?.email) emailMap.set(u.id, u.email)
    }
  }

  const recipients = Array.from(emailMap.entries()).map(([id, email]) => ({ id, email }))

  if (recipients.length === 0) {
    return NextResponse.json({ error: "이메일이 있는 대상이 없습니다" }, { status: 400 })
  }

  // 4. Resend 일괄 발송 (최대 100건씩)
  let success = 0
  let failed = 0
  let lastError = ""
  const BATCH = 100

  for (let i = 0; i < recipients.length; i += BATCH) {
    const batch = recipients.slice(i, i + BATCH)

    const emails = batch.map((r) => ({
      from: "광장 <no-reply@gwangjang.app>",
      to: [r.email],
      subject,
      html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #3b82f6, #2563eb); padding: 24px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">광장</h1>
        </div>
        <div style="border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
          <h2 style="margin: 0 0 16px; font-size: 18px; color: #111827;">${escapeHtml(subject)}</h2>
          <div style="color: #374151; line-height: 1.7; white-space: pre-wrap;">${escapeHtml(message)}</div>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            본 메일은 광장에서 발송된 안내 메일입니다.
          </p>
        </div>
      </div>`,
    }))

    try {
      const result = await getResend().batch.send(emails)
      if (result.error) {
        console.error("[admin/email] batch error:", result.error)
        lastError = result.error.message || JSON.stringify(result.error)
        failed += batch.length
      } else {
        success += batch.length
      }
    } catch (e: any) {
      console.error("[admin/email] send error:", e)
      lastError = e.message || String(e)
      failed += batch.length
    }
  }

  return NextResponse.json({
    success: true,
    sent: success,
    failed,
    total: recipients.length,
    ...(lastError && { error: lastError }),
  })
}
