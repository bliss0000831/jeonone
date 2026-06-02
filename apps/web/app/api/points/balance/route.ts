/**
 * GET /api/points/balance — 본인 포인트 잔액 + Reputation 조회.
 *
 * 결제 페이지에서 "사용 가능한 포인트" 표시용.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/supabase/auth-helpers'
import { getUserPoints } from '@/lib/services/billing/points'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 광장 격리 해제 — 통합 잔액 조회
  const points = await getUserPoints(user.id)
  return NextResponse.json({
    available: points.available,
    pending: points.pending,
    lifetime_earned: points.lifetime_earned,
    lifetime_spent: points.lifetime_spent,
    reputation_score: points.reputation_score,
    is_suspended: points.is_suspended,
  })
}
