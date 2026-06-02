// Rate limiting 헬퍼 — Upstash Redis 기반 sliding-window 리밋.
//
// 설계 원칙:
// - 환경변수(UPSTASH_REDIS_REST_URL / TOKEN)가 없으면 no-op 로 동작해서
//   로컬/빌드 환경을 깨뜨리지 않는다 (graceful fallback).
// - 각 API 라우트에서 `checkRateLimit(key, 'comment')` 처럼 호출하고,
//   반환된 `ok` 가 false 면 429 응답.
// - 식별자(identifier)는 로그인 유저면 user.id, 익명이면 IP.

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export type LimitName =
  | 'login'           // 로그인 시도
  | 'signup'          // 회원가입
  | 'comment'         // 댓글 작성
  | 'post'            // 게시글 작성
  | 'upload'          // 파일 업로드
  | 'search'          // 검색
  | 'report'          // 신고
  | 'account_upgrade' // 계정 유형 변경 신청
  | 'admin-notify'    // 어드민 일괄 알림
  | 'geocode'         // 외부 지오코딩 API (Naver/Kakao 비용 방어)
  | 'news'            // 외부 뉴스 API
  | 'mutate'          // 일반 PATCH/DELETE 도배 방어
  | 'invite-expert'   // 전문가 초대 spam 방어
  | 'bump'            // 글 올리기 도배 방어
  | 'r2-cleanup'      // R2 파일 삭제 (도배 + 권한 탈취 시 cross-plaza 폭발 방어)
  | 'account_delete'  // 회원 탈퇴
  | 'default'         // 기타 POST

// 각 액션별 제한 — (요청 수, 윈도우)
const LIMITS: Record<LimitName, { tokens: number; window: `${number} ${'s' | 'm' | 'h'}` }> = {
  login:           { tokens: 5,  window: '1 m' },   // 비번 브루트포스 방어
  signup:          { tokens: 3,  window: '1 h' },   // 대량 계정 생성 방어
  comment:         { tokens: 10, window: '1 m' },   // 댓글 도배 방어
  post:            { tokens: 10, window: '10 m' },  // 글 도배 방어
  upload:          { tokens: 20, window: '5 m' },   // 파일 업로드 남용
  search:          { tokens: 30, window: '1 m' },   // 검색 스크래핑
  report:          { tokens: 10, window: '10 m' },  // 신고 남용
  account_upgrade: { tokens: 5,  window: '1 h' },   // 계정 승격 남용 방어
  'admin-notify':  { tokens: 10, window: '1 h' },   // 어드민이라도 알림 도배 방어
  geocode:         { tokens: 30, window: '1 m' },   // 외부 지오코딩 비용 방어
  news:            { tokens: 30, window: '1 m' },   // 외부 뉴스 API 비용 방어
  mutate:          { tokens: 30, window: '1 m' },   // 일반 PATCH/DELETE 도배 방어
  'invite-expert': { tokens: 20, window: '1 h' },   // 전문가 초대 spam 방어
  bump:            { tokens: 10, window: '5 m' },   // 글 올리기 도배 방어
  'r2-cleanup':    { tokens: 60, window: '1 m' },   // R2 정리 — 일반 사용자 도배 + admin 탈취 폭발 방어
  account_delete:  { tokens: 3,  window: '1 h' },   // 회원 탈퇴 — 분당 1건, 시간당 3건
  default:         { tokens: 30, window: '1 m' },
}

// 싱글톤 Redis & Ratelimit 인스턴스 캐시 (Next.js hot reload 대응)
declare global {
  // eslint-disable-next-line no-var
  var __ratelimitCache: Map<LimitName, Ratelimit> | undefined
}
const cache: Map<LimitName, Ratelimit> =
  globalThis.__ratelimitCache ?? (globalThis.__ratelimitCache = new Map())

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

function getLimiter(name: LimitName): Ratelimit | null {
  if (cache.has(name)) return cache.get(name)!
  const redis = getRedis()
  if (!redis) return null
  const conf = LIMITS[name]
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(conf.tokens, conf.window),
    analytics: false,
    prefix: `rl:${name}`,
  })
  cache.set(name, limiter)
  return limiter
}

/**
 * 식별자 추출 — 우선순위: 주어진 userId > X-Forwarded-For IP > fallback 'anon'.
 */
export function identifierFor(req: NextRequest, userId?: string | null): string {
  if (userId) return `u:${userId}`
  const fwd = req.headers.get('x-forwarded-for')
  const ip = fwd?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'anon'
  return `ip:${ip}`
}

/**
 * Rate limit 체크. env 가 없으면 항상 ok=true 반환 (dev/preview 안전).
 */
export async function checkRateLimit(
  identifier: string,
  name: LimitName = 'default',
): Promise<{ ok: boolean; remaining?: number; reset?: number }> {
  const limiter = getLimiter(name)
  if (!limiter) return { ok: true }
  try {
    const { success, remaining, reset } = await limiter.limit(identifier)
    return { ok: success, remaining, reset }
  } catch (err) {
    // Redis 장애 시 정책별로 다른 처리
    // - login/signup/password 등 인증 시도: fail-closed (브루트포스 방어 우선)
    // - 일반 작업 (post/comment 등): fail-open (서비스 중단 방지)
    const failClosedLimits: LimitName[] = ['login', 'signup', 'upload', 'admin-notify']
    if (failClosedLimits.includes(name)) {
      console.error('[ratelimit] check failed for sensitive limit, fail-closed:', name, err)
      return { ok: false, remaining: 0 }
    }
    console.warn('[ratelimit] check failed, allowing:', err)
    return { ok: true }
  }
}

/**
 * 편의 함수 — 실패 시 NextResponse 를 바로 반환.
 * 사용: `const limited = await enforceRateLimit(req, 'comment', user?.id); if (limited) return limited;`
 */
export async function enforceRateLimit(
  req: NextRequest,
  name: LimitName,
  userId?: string | null,
): Promise<NextResponse | null> {
  const id = identifierFor(req, userId)
  const { ok, reset } = await checkRateLimit(id, name)
  if (ok) return null
  const retryAfter = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 1000)) : 60
  return NextResponse.json(
    {
      error: '요청이 너무 빠릅니다. 잠시 후 다시 시도해주세요.',
      retry_after: retryAfter,
    },
    {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    },
  )
}
