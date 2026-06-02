/**
 * 부스트 (Boost) 서비스 — 매물별 N일 상단 노출 결제.
 *
 * Feature Flag 'monetization.boost' OFF 시:
 *   - 결제 호출 X
 *   - boost_orders 에 free_period=true 로 기록만 (사용자 의향 추적용)
 *   - 즉시 active 상태로 활성화 (혜택)
 */
import { createClient } from '@/lib/supabase/server'
import { isFeatureEnabled } from './feature-flags'

export type BoostTargetType =
  | 'property'
  | 'new_store'
  | 'job'
  | 'group_buying'
  | 'club'

export type BoostTier =
  | 'main_banner_3d'
  | 'main_banner_7d'
  | 'category_top_3d'
  | 'category_top_7d'
  | 'card_news_push'

export interface BoostPricing {
  tier: BoostTier
  display_name: string
  applicable_targets: BoostTargetType[]
  duration_days: number
  price: number
  description: string | null
  is_active: boolean
  sort_order: number
}

export interface BoostOrder {
  id: string
  user_id: string
  plaza_id: string
  target_type: BoostTargetType
  target_id: string
  tier: BoostTier
  amount: number
  starts_at: string
  ends_at: string
  status: 'pending' | 'active' | 'expired' | 'canceled' | 'refunded'
  payment_id: string | null
  free_period: boolean
  created_at: string
  updated_at: string
}

/** 적용 대상 타입에 맞는 부스트 가격 카탈로그 조회. */
export async function listBoostPricing(
  target: BoostTargetType,
): Promise<BoostPricing[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('boost_pricing')
    .select('*')
    .eq('is_active', true)
    .contains('applicable_targets', [target])
    .order('sort_order')
  return (data ?? []) as BoostPricing[]
}

/** 특정 매물의 활성 부스트 조회 (있으면 1건). */
export async function getActiveBoost(
  targetType: BoostTargetType,
  targetId: string,
): Promise<BoostOrder | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('boost_orders')
    .select('*')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('status', 'active')
    .gte('ends_at', new Date().toISOString())
    .order('ends_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data ?? null) as BoostOrder | null
}

export interface CreateBoostInput {
  userId: string
  plazaId: string
  targetType: BoostTargetType
  targetId: string
  tier: BoostTier
}

export interface CreateBoostResult {
  ok: boolean
  order?: BoostOrder
  paymentRequired?: boolean
  freePeriod?: boolean
  error?: string
}

/**
 * 부스트 주문 생성.
 *
 * 무료 기간: 즉시 active + free_period=true 로 기록 (혜택)
 * 활성화 후: pending 으로 생성 → PG 결제 → webhook 으로 active 전환
 */
// targetType → (table, ownerCol) 소유권 검증용
const BOOST_TARGET_TABLES: Record<string, { table: string; ownerCol: string }> = {
  property:    { table: 'properties',       ownerCol: 'user_id' },
  secondhand:  { table: 'secondhand_posts', ownerCol: 'user_id' },
  jobs:        { table: 'jobs_posts',       ownerCol: 'user_id' },
  group_buying:{ table: 'group_buying_posts', ownerCol: 'user_id' },
  local_food:  { table: 'local_food',       ownerCol: 'user_id' },
  new_store:   { table: 'new_store_posts',  ownerCol: 'user_id' },
  sharing:     { table: 'sharing_posts',    ownerCol: 'user_id' },
  club:        { table: 'clubs',            ownerCol: 'creator_id' },
  interior:    { table: 'interior_posts',   ownerCol: 'user_id' },
}

export async function createBoostOrder(
  input: CreateBoostInput,
): Promise<CreateBoostResult> {
  const supabase = await createClient()

  // ── 타겟 소유권 검증 — 경쟁자 게시글에 부스트 강제하는 것 차단
  const tableConfig = BOOST_TARGET_TABLES[input.targetType]
  if (tableConfig) {
    const { data: target } = await (supabase as any)
      .from(tableConfig.table)
      .select(`id, ${tableConfig.ownerCol}, plaza_id`)
      .eq('id', input.targetId)
      .maybeSingle()
    if (!target) {
      return { ok: false, error: '부스트할 대상을 찾을 수 없습니다.' }
    }
    if ((target as any)[tableConfig.ownerCol] !== input.userId) {
      return { ok: false, error: '본인이 등록한 게시글만 부스트할 수 있습니다.' }
    }
    if ((target as any).plaza_id && (target as any).plaza_id !== input.plazaId) {
      return { ok: false, error: '다른 광장의 게시글은 부스트할 수 없습니다.' }
    }
  }

  // 가격 조회
  const { data: pricing } = await supabase
    .from('boost_pricing')
    .select('*')
    .eq('tier', input.tier)
    .eq('is_active', true)
    .maybeSingle()
  if (!pricing) return { ok: false, error: '부스트 상품을 찾을 수 없습니다.' }

  if (!(pricing.applicable_targets as string[]).includes(input.targetType)) {
    return { ok: false, error: '이 카테고리에 적용할 수 없는 상품입니다.' }
  }

  const enabled = await isFeatureEnabled('monetization.boost')
  const now = new Date()
  const endsAt = new Date(now.getTime() + pricing.duration_days * 24 * 60 * 60 * 1000)

  // 무료 기간 — 즉시 활성화 + free_period 표시
  if (!enabled) {
    const { data, error } = await supabase
      .from('boost_orders')
      .insert({
        user_id: input.userId,
        plaza_id: input.plazaId,
        target_type: input.targetType,
        target_id: input.targetId,
        tier: input.tier,
        amount: 0,                 // 무료 기간 0원 처리
        starts_at: now.toISOString(),
        ends_at: endsAt.toISOString(),
        status: 'active',
        free_period: true,
      })
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, order: data as BoostOrder, freePeriod: true, paymentRequired: false }
  }

  // 정상 — pending 으로 생성
  const { data, error } = await supabase
    .from('boost_orders')
    .insert({
      user_id: input.userId,
      plaza_id: input.plazaId,
      target_type: input.targetType,
      target_id: input.targetId,
      tier: input.tier,
      amount: pricing.price,
      starts_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
      status: 'pending',
      free_period: false,
    })
    .select('*')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, order: data as BoostOrder, paymentRequired: true }
}

/** 만료된 부스트 일괄 정리 — cron. */
export async function expireBoostOrders(): Promise<{ updated: number }> {
  const supabase = await createClient()
  const now = new Date().toISOString()
  const { data } = await supabase
    .from('boost_orders')
    .update({ status: 'expired' })
    .eq('status', 'active')
    .lt('ends_at', now)
    .select('id')
  return { updated: (data ?? []).length }
}
