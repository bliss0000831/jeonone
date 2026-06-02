import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import {
  listPayoutBatches,
  listPayoutsForPlaza,
  approvePayout,
  markPayoutTransferred,
} from '@/lib/services/billing'
import { checkAdminAuth, canAccessPlaza } from '@/lib/services/admin-auth'
import { enforceRateLimit } from '@/lib/services/ratelimit'

export const dynamic = 'force-dynamic'

/**
 * GET /api/billing/payouts?plazaId=... — 정산 내역 조회.
 * - plazaId 있으면 해당 광장 정산 (광장 운영자용)
 * - 없으면 전체 배치 목록 (슈퍼 어드민용)
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const plazaId = searchParams.get('plazaId')

  // 통합 관리자 권한 체크 (plaza_admins 기반)
  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (plazaId) {
    // 광장 격리: 해당 광장에 접근 권한이 있는지 확인
    if (!auth.isGodMode && !canAccessPlaza(auth, plazaId)) {
      return NextResponse.json({ error: '해당 광장의 정산 내역에 접근할 수 없습니다' }, { status: 403 })
    }
    const payouts = await listPayoutsForPlaza(plazaId)
    return NextResponse.json({ payouts })
  }

  // 전체 배치 목록은 god-mode 만 허용
  if (!auth.isGodMode) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const batches = await listPayoutBatches()
  return NextResponse.json({ batches })
}

/**
 * PATCH /api/billing/payouts — 정산 승인 / 송금 완료 처리.
 * Body: { payoutId: string, action: 'approve' | 'transferred', transferReference?: string }
 */
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  const body = await request.json().catch(() => ({}))
  const payoutId = body?.payoutId as string | undefined
  const action = body?.action as 'approve' | 'transferred' | undefined
  if (!payoutId || !action) {
    return NextResponse.json({ error: 'payoutId/action required' }, { status: 400 })
  }

  let result: { ok: boolean; error?: string }
  if (action === 'approve') {
    result = await approvePayout(payoutId, user.id)
  } else {
    result = await markPayoutTransferred(payoutId, body?.transferReference)
  }
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
