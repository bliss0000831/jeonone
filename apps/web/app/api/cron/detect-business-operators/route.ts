import { NextResponse } from 'next/server'
import { runHighVolumeDetection } from '@/lib/services/business-detection'
import { expireBoostOrders } from '@/lib/services/billing'
import { verifyCronAuth } from '@/lib/security/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * GET /api/cron/detect-business-operators
 *
 * 매일 03:00 UTC 실행:
 *   1. 30일 내 20건 이상 중고거래 등록자 → user_flags 자동 생성
 *   2. 만료된 boost_orders → expired 처리
 *
 * Feature Flag 체크 없음 — 탐지/만료 정리는 항상 작동 (탐지는 무료 기간에도 의미 있음).
 */
export async function GET(request: Request) {
  if (!verifyCronAuth(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [detection, boostExpire] = await Promise.all([
    runHighVolumeDetection({ threshold: 20, daysBack: 30 }),
    expireBoostOrders(),
  ])

  return NextResponse.json({
    ok: true,
    flagged: detection.flagged,
    boostExpired: boostExpire.updated,
  })
}
