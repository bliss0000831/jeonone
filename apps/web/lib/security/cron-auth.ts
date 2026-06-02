/**
 * Cron / Webhook 인증 헬퍼 — timing-safe 비교.
 *
 * `===` 직접 비교는 길이/문자 단위로 빠른 실패하기 때문에
 * 충분한 횟수의 요청을 통한 타이밍 측정 공격에 취약.
 */
import crypto from 'node:crypto'

/**
 * Authorization 헤더 (Bearer xxx) 가 CRON_SECRET 과 일치하는지 timing-safe 검증.
 *
 * @returns true = 인증 통과 / false = 거부
 */
export function verifyCronAuth(authHeader: string | null): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    // 비어 있으면 cron 호출만 허용된다고 보고 통과 시키지 않음
    return false
  }
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false
  const token = authHeader.slice('Bearer '.length)
  const a = Buffer.from(token)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}
