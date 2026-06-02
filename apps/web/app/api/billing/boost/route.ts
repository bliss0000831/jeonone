import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { getCurrentPlaza } from '@/lib/plaza/server'
import {
  listBoostPricing,
  createBoostOrder,
  getActiveBoost,
  type BoostTargetType,
  type BoostTier,
} from '@/lib/services/billing'
import { enforceRateLimit } from '@/lib/services/ratelimit'

export const dynamic = 'force-dynamic'

const VALID_TARGETS: BoostTargetType[] = [
  'property',
  'new_store',
  'job',
  'group_buying',
  'club',
]

/**
 * GET /api/billing/boost?target=property&targetId=...
 *  - 부스트 가격 카탈로그 + 현재 활성 부스트 조회
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const target = searchParams.get('target') as BoostTargetType | null
  const targetId = searchParams.get('targetId')

  if (!target || !VALID_TARGETS.includes(target)) {
    return NextResponse.json({ error: 'invalid target' }, { status: 400 })
  }

  const pricing = await listBoostPricing(target)
  const active = targetId ? await getActiveBoost(target, targetId) : null

  return NextResponse.json({ pricing, active })
}

/**
 * POST /api/billing/boost — 부스트 주문 생성.
 * Body: { target: BoostTargetType, targetId: string, tier: BoostTier }
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
  const target = body?.target as BoostTargetType | undefined
  const targetId = body?.targetId as string | undefined
  const tier = body?.tier as BoostTier | undefined

  if (!target || !VALID_TARGETS.includes(target)) {
    return NextResponse.json({ error: 'invalid target' }, { status: 400 })
  }
  if (!targetId || !tier) {
    return NextResponse.json({ error: 'targetId and tier required' }, { status: 400 })
  }

  // Verify ownership — user must own the target resource
  const TABLE_MAP: Record<string, string> = {
    property: 'properties',
    new_store: 'new_store_posts',
    job: 'job_posts',
    group_buying: 'group_buying_posts',
    club: 'clubs',
  }
  const ownerTable = TABLE_MAP[target]
  if (ownerTable) {
    const { data: targetRow } = await (supabase as any).from(ownerTable).select('user_id, plaza_id').eq('id', targetId).maybeSingle()
    if (!targetRow || targetRow.user_id !== user.id) {
      return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    }
    // 광장 격리 — 다른 광장의 글을 부스트하는 것 차단
    if (targetRow.plaza_id && targetRow.plaza_id !== plaza) {
      return NextResponse.json({ error: '다른 광장의 글입니다' }, { status: 403 })
    }
  }

  const result = await createBoostOrder({
    userId: user.id,
    plazaId: plaza,
    targetType: target,
    targetId,
    tier,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result)
}
