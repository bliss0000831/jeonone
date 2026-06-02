import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPlaza } from '@/lib/plaza/server'
import { enforceRateLimit } from '@/lib/services/ratelimit'

/**
 * 방문자 로깅 API.
 *
 * 이전엔 클라이언트 visitor-tracker 가 매 페이지마다 supabase.auth.getUser() +
 * supabase.from('visitor_logs').insert() 직접 호출 → 동접자 × 페이지 이동마다 부하.
 *
 * 이 라우트로 옮기면:
 * - 클라는 sendBeacon 1회 (fire-and-forget, 페이지 전환 차단 안 함)
 * - 인증은 서버 쿠키로 (extra getUser 호출 제거)
 * - INSERT 1번만 (중복 방지는 클라 sessionStorage 가 1차로 거름)
 *
 * 2026-04 audit, 부하 전수 조사 #3.
 *
 * 2026-05 보안 강화:
 *   INSERT 를 service_role (createAdminClient) 으로 전환.
 *   visitor_logs 의 클라이언트 INSERT RLS 정책을 제거하여
 *   직접 INSERT (악의적 스크립트 등) 를 원천 차단하면서도
 *   비로그인 방문자 기록은 그대로 유지.
 */
export async function POST(request: NextRequest) {
  try {
    // IP 기반 rate limit — 비로그인 사용자도 추적되므로 로그인 user id 우선, 없으면 IP
    // (DoS / 스토리지 비용 방어)
    const ipKey =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'anon'
    const limited = await enforceRateLimit(request, 'default', `visitor:${ipKey}`)
    if (limited) return limited

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    const { session_id, page_url, user_agent, referer, device_type, browser, os } = body
    if (!session_id || !page_url) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }
    // 길이 제한 — DoS / 디스크 폭증 방어 (정상 클라는 모두 100자 미만)
    if (
      typeof session_id !== 'string' || session_id.length > 200 ||
      typeof page_url !== 'string' || page_url.length > 1000 ||
      (user_agent && (typeof user_agent !== 'string' || user_agent.length > 500)) ||
      (referer && (typeof referer !== 'string' || referer.length > 1000))
    ) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    // 컨트롤 문자/HTML 위험 문자 제거 — 어드민 대시보드에서 그대로 렌더해도 안전하도록
    const sanitize = (s: unknown): string | null => {
      if (typeof s !== 'string') return null
      return s.replace(/[\x00-\x1f<>]/g, '').slice(0, 1000) || null
    }
    const cleanReferer = sanitize(referer)
    const cleanUA = sanitize(user_agent)
    const cleanPageUrl = sanitize(page_url)
    if (!cleanPageUrl) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }
    // referer 가 URL 형식이 아니면 폐기 (XSS / 가짜 referer 차단)
    let validReferer: string | null = null
    if (cleanReferer) {
      try {
        const u = new URL(cleanReferer)
        if (u.protocol === 'https:' || u.protocol === 'http:') validReferer = cleanReferer
      } catch {}
    }

    // 유저 컨텍스트는 user_id 조회용으로만 사용
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // INSERT 는 service_role 으로 — RLS 클라이언트 정책 제거 후에도 작동하며,
    // 비로그인 방문자(user=null) 기록도 유지됨.
    const admin = createAdminClient()
    const plaza = await getCurrentPlaza()
    await admin.from('visitor_logs').insert({
      user_id: user?.id || null,
      session_id,
      page_url: cleanPageUrl,
      user_agent: cleanUA,
      referer: validReferer,
      device_type: sanitize(device_type)?.slice(0, 50) || 'unknown',
      browser: sanitize(browser)?.slice(0, 100) || 'unknown',
      os: sanitize(os)?.slice(0, 100) || 'unknown',
      visited_at: new Date().toISOString(),
      ...(plaza ? { plaza_id: plaza } : {}),
    })

    return NextResponse.json({ ok: true })
  } catch {
    // 방문자 로깅 실패는 조용히 무시
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
