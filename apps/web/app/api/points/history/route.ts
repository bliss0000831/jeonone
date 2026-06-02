/**
 * GET /api/points/history?cursor=N&limit=30
 *   본인 포인트 거래 내역 조회 — 적립/사용/회수 시간순.
 *
 * 응답: { items: [...], nextCursor: number | null, balance: number }
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserPoints } from '@/lib/services/billing/points'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = request.nextUrl.searchParams
  const cursor = parseInt(sp.get('cursor') || '0', 10) || 0
  const limit = Math.min(parseInt(sp.get('limit') || '30', 10) || 30, 100)

  // 거래 내역 — 광장 격리 해제, 모든 광장 통합
  const admin = createAdminClient()
  const { data: items, error } = await admin
    .from('point_transactions')
    .select(
      'id, type, amount, source, source_id, status, evaluation_at, confirmed_at, reverted_at, reverted_reason, metadata, created_at',
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(cursor, cursor + limit - 1)
  if (error) {
    console.error('[points/history]', error.message)
    return NextResponse.json({ error: 'fetch_failed' }, { status: 500 })
  }

  // 잔액 (통합)
  const points = await getUserPoints(user.id)

  return NextResponse.json({
    items: items ?? [],
    nextCursor: (items?.length ?? 0) < limit ? null : cursor + limit,
    balance: {
      available: points.available,
      pending: points.pending,
      lifetime_earned: points.lifetime_earned,
      lifetime_spent: points.lifetime_spent,
      reputation_score: points.reputation_score,
    },
  })
}
