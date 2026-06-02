/**
 * POST /api/bump/use
 *
 * Body: { targetType: 'property' | 'secondhand', targetId: string,
 *         payment: 'free' | 'points' | 'cash', paymentId?: string }
 *
 * 응답: { ok, bumpedAt } | { ok: false, reason }
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/supabase/auth-helpers'
import { getCurrentPlaza } from '@/lib/plaza/server'
import { bump, type BumpTargetType } from '@/lib/services/bump'
import { enforceRateLimit } from '@/lib/services/ratelimit'
import { banGuardResponse } from '@/lib/services/user-ban-guard'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  const plaza = await getCurrentPlaza()
  if (!plaza) return NextResponse.json({ error: 'plaza_required' }, { status: 400 })

  // 어뷰징 방어 — 5분 10회
  const limited = await enforceRateLimit(request, 'bump', user.id)
  if (limited) return limited

  const body = (await request.json().catch(() => ({}))) as {
    targetType?: BumpTargetType
    targetId?: string
    payment?: 'free' | 'points' | 'ticket'
  }

  if (!body.targetType || !body.targetId || !body.payment) {
    return NextResponse.json({ error: 'targetType/targetId/payment required' }, { status: 400 })
  }
  const VALID_TYPES: BumpTargetType[] = [
    'property', 'secondhand', 'interior', 'moving', 'cleaning', 'repair',
    'group_buying', 'local_food', 'jobs', 'new_store',
  ]
  if (!VALID_TYPES.includes(body.targetType)) {
    return NextResponse.json({ error: 'invalid targetType' }, { status: 400 })
  }
  if (!['free', 'points', 'ticket'].includes(body.payment)) {
    return NextResponse.json({ error: 'invalid payment' }, { status: 400 })
  }

  const result = await bump({
    userId: user.id,
    plazaId: plaza,
    targetType: body.targetType,
    targetId: body.targetId,
    payment: body.payment,
  })

  if (!result.ok) {
    // DB error.message 등 내부 정보 노출 방지 — 서버 로그만 남기고 reason 만 응답
    if ((result as any).error) {
      console.error('[bump/use] failed:', result.reason, (result as any).error)
    }
    return NextResponse.json({ error: result.reason }, { status: 400 })
  }
  return NextResponse.json({ ok: true, bumpedAt: result.bumpedAt })
}
