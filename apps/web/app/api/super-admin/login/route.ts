import { NextResponse, type NextRequest } from 'next/server'
import {
  checkSuperAdminCredentials,
  issueSuperAdminToken,
  superAdminCookieOptions,
  SUPER_ADMIN_COOKIE,
} from '@/lib/services/super-admin'
import { enforceRateLimit, identifierFor } from '@/lib/services/ratelimit'

/**
 * 슈퍼관리자 로그인.
 *
 * 무차별 대입 완화:
 *   1) Upstash sliding-window: IP 당 1분 5회 (LIMITS.login)
 *      → lambda 인스턴스 N개여도 분산 카운팅
 *   2) 의도적 400ms 지연으로 timing 차이 줄임
 */
export async function POST(req: NextRequest) {
  // Upstash 기반 rate limit (IP 식별)
  const limited = await enforceRateLimit(req, 'login', null)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const totp = typeof body?.totp === 'string' ? body.totp : undefined

  // 성공/실패 무관 일정 지연 → 응답 시간 차이로 ID 매칭 시그널 차단
  const delay = new Promise((r) => setTimeout(r, 400))
  const ok = await checkSuperAdminCredentials(id, password, totp)
  await delay

  if (!ok) {
    return NextResponse.json(
      { error: '아이디 또는 비밀번호가 올바르지 않습니다' },
      { status: 401 },
    )
  }

  const token = await issueSuperAdminToken()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SUPER_ADMIN_COOKIE, token, superAdminCookieOptions())
  return res
}

// identifierFor / Ratelimit 모듈에서 IP 자동 추출 사용
void identifierFor
