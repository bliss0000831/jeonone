import { NextResponse } from 'next/server'
import { generateMonthlyBatch, isFeatureEnabled } from '@/lib/services/billing'
import { verifyCronAuth } from '@/lib/security/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 300  // 5분 — 광장 많아질 경우 대비

/**
 * GET /api/cron/billing-monthly-payout
 *
 * Vercel Cron 매월 1일 01:00 UTC 실행 (한국시간 10:00 AM).
 * 지난 달 정산 배치 자동 생성.
 *
 * Feature Flag 'monetization.payouts' OFF 면 즉시 종료.
 */
export async function GET(request: Request) {
  // Vercel Cron 검증 (timing-safe)
  if (!verifyCronAuth(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const enabled = await isFeatureEnabled('monetization.payouts')
  if (!enabled) {
    return NextResponse.json({
      skipped: true,
      reason: 'monetization.payouts feature flag is OFF',
    })
  }

  // 지난 달 첫째 날 ~ 이번 달 첫째 날
  const now = new Date()
  const firstOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const firstOfLastMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  )
  const periodStart = firstOfLastMonth.toISOString().slice(0, 10)
  const periodEnd = firstOfThisMonth.toISOString().slice(0, 10)

  const result = await generateMonthlyBatch(periodStart, periodEnd)
  return NextResponse.json({
    ok: result.ok,
    error: result.error,
    period: { start: periodStart, end: periodEnd },
    payoutCount: result.payouts?.length ?? 0,
    batchId: result.batch?.id,
  })
}
