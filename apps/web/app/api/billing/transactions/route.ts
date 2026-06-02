import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { getCurrentPlaza } from '@/lib/plaza/server'
import { recordTransaction, type TransactionKind } from '@/lib/services/billing'
import { enforceRateLimit } from '@/lib/services/ratelimit'

export const dynamic = 'force-dynamic'

const VALID_KINDS: TransactionKind[] = [
  'group_buying',
  'local_food',
  'service_match',
  'secondhand_safe',
]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const VALID_REFERENCE_TYPES = new Set([
  'subscription',
  'property_boost',
  'group_buying',
  'local_food',
  'service_match',
  'secondhand_safe',
])

/**
 * POST /api/billing/transactions — 거래 기록.
 * 공동구매/로컬푸드/서비스 매칭 등에서 거래 발생 시 호출.
 *
 * Body: {
 *   kind: 'group_buying' | 'local_food' | 'service_match' | 'secondhand_safe'
 *   buyerId?: string
 *   sellerId?: string
 *   referenceType?: string
 *   referenceId?: string
 *   grossAmount: number
 * }
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  const plaza = await getCurrentPlaza()
  if (!plaza) return NextResponse.json({ error: '광장 미선택' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const kind = body?.kind as TransactionKind | undefined
  const grossAmount = Number(body?.grossAmount ?? 0)

  if (!kind || !VALID_KINDS.includes(kind)) {
    return NextResponse.json({ error: 'invalid kind' }, { status: 400 })
  }
  if (!grossAmount || grossAmount < 0) {
    return NextResponse.json({ error: 'invalid grossAmount' }, { status: 400 })
  }

  const sellerId = body?.sellerId
  if (sellerId != null && (typeof sellerId !== 'string' || !UUID_RE.test(sellerId))) {
    return NextResponse.json({ error: 'invalid sellerId' }, { status: 400 })
  }

  const referenceType = body?.referenceType
  if (referenceType != null && !VALID_REFERENCE_TYPES.has(referenceType)) {
    return NextResponse.json({ error: 'invalid referenceType' }, { status: 400 })
  }

  const result = await recordTransaction({
    plazaId: plaza,
    kind,
    buyerId: user.id,
    sellerId,
    referenceType,
    referenceId: body?.referenceId,
    grossAmount,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ transaction: result.transaction })
}
