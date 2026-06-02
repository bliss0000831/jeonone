/**
 * GET /api/bump/tickets
 *   응답: { balance, packs: [...] }
 *   잔액 + 구매 가능한 팩 목록.
 *
 * POST /api/bump/tickets
 *   Body: { packId, payment: 'points' | 'cash', paymentId? }
 *   응답: { ok: true, balance, added }
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/supabase/auth-helpers'
import { getCurrentPlaza } from '@/lib/plaza/server'
import {
  getTicketBalance,
  listTicketPacks,
  purchaseTicketPack,
} from '@/lib/services/bump'
import { enforceRateLimit } from '@/lib/services/ratelimit'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const plaza = await getCurrentPlaza()
  if (!plaza) return NextResponse.json({ error: 'plaza_required' }, { status: 400 })

  const [balance, packs] = await Promise.all([
    getTicketBalance(user.id, plaza),
    listTicketPacks(),
  ])

  return NextResponse.json({ balance, packs })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const plaza = await getCurrentPlaza()
  if (!plaza) return NextResponse.json({ error: 'plaza_required' }, { status: 400 })

  const limited = await enforceRateLimit(request, 'bump', user.id)
  if (limited) return limited

  const body = (await request.json().catch(() => ({}))) as {
    packId?: string
    payment?: 'points' | 'cash'
    paymentId?: string
  }
  if (!body.packId || !body.payment) {
    return NextResponse.json({ error: 'packId/payment required' }, { status: 400 })
  }
  if (!['points', 'cash'].includes(body.payment)) {
    return NextResponse.json({ error: 'invalid payment' }, { status: 400 })
  }

  const result = await purchaseTicketPack({
    userId: user.id,
    plazaId: plaza,
    packId: body.packId,
    payment: body.payment,
    paymentId: body.paymentId,
  })

  if (!result.ok) {
    if ((result as any).error) {
      console.error('[bump/tickets] purchase failed:', result.reason, (result as any).error)
    }
    return NextResponse.json({ error: result.reason }, { status: 400 })
  }
  return NextResponse.json({ ok: true, balance: result.balance, added: result.added })
}
