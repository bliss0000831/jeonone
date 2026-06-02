import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { getCurrentPlaza } from '@/lib/plaza/server'
import {
  createSubscription,
  cancelSubscription,
  getCurrentSubscription,
} from '@/lib/services/billing'
import { enforceRateLimit } from "@/lib/services/ratelimit"

export const dynamic = 'force-dynamic'

/** GET /api/billing/subscriptions — 내 현재 구독 조회. */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const limited = await enforceRateLimit(request as any, 'search', user.id)
  if (limited) return limited

  const plaza = await getCurrentPlaza()
  if (!plaza) return NextResponse.json({ subscription: null })

  const sub = await getCurrentSubscription(user.id, plaza)
  return NextResponse.json({ subscription: sub })
}

/** POST /api/billing/subscriptions — 구독 신청. */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  const plaza = await getCurrentPlaza()
  if (!plaza) return NextResponse.json({ error: '광장이 선택되지 않았습니다.' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const planId: string | undefined = body?.planId
  if (!planId) return NextResponse.json({ error: 'planId required' }, { status: 400 })

  const result = await createSubscription({
    userId: user.id,
    plazaId: plaza,
    planId,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  return NextResponse.json(result)
}

/** DELETE /api/billing/subscriptions?id=... — 구독 취소. */
export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const reason = searchParams.get('reason') ?? undefined
  const result = await cancelSubscription(id, user.id, reason)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
