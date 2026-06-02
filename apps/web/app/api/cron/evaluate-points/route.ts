/**
 * GET /api/cron/evaluate-points
 *
 * Vercel Cron 매시간 실행. evaluation_at 도래한 pending 거래 평가.
 * - 신고/삭제됐으면 revert (회수 + reputation -10)
 * - 그 외 confirm (잔액 반영)
 */
import { NextResponse } from 'next/server'
import { evaluatePending, isFeatureEnabled } from '@/lib/services/billing'
import { verifyCronAuth } from '@/lib/security/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  if (!verifyCronAuth(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const enabled = await isFeatureEnabled('monetization.points')
  if (!enabled) {
    return NextResponse.json({ skipped: true, reason: 'feature OFF' })
  }

  const result = await evaluatePending()
  return NextResponse.json({ ok: true, ...result })
}
