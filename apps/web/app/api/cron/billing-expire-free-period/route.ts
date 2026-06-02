import { NextResponse } from 'next/server'
import { expireFreePeriodSubscriptions } from '@/lib/services/billing'
import { verifyCronAuth } from '@/lib/security/cron-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/billing-expire-free-period
 *
 * 매일 02:00 UTC 실행. 6개월 무료 기간이 끝난 free_period 구독을
 * past_due 로 전환 (사용자가 결제 등록을 안 한 경우 만료 처리).
 */
export async function GET(request: Request) {
  if (!verifyCronAuth(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await expireFreePeriodSubscriptions()
  return NextResponse.json({ ok: true, expired: result.updated })
}
