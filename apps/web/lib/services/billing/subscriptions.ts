/**
 * 구독 서비스 — 공인중개사 / 서비스 업종 월정액 관리.
 *
 * 6개월 무료 운영 기간 동안에는:
 *   - 가입 요청 시 status='free_period' 로 즉시 활성화
 *   - 결제 호출 X (PG 미연동)
 *   - is_early_bird = true → 이후 정상가 전환 시 평생 50% 할인 적용
 *
 * 활성화 후:
 *   - status='pending' 으로 생성 후 PG 결제 → 'active'
 *   - billing_key 저장 → 매월 자동 갱신 (cron)
 */
import { createClient } from '@/lib/supabase/server'
import { isFeatureEnabled } from './feature-flags'
import type { Subscription, SubscriptionPlan } from './types'

export const FREE_PERIOD_END_DATE = '2026-10-29'  // 6개월 무료 종료일 (출시 가정)

/** 활성 플랜 목록. */
export async function listActivePlans(): Promise<SubscriptionPlan[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('monthly_price')
  return (data ?? []) as SubscriptionPlan[]
}

/** 플랜 1건 조회. */
export async function getPlan(planId: string): Promise<SubscriptionPlan | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('id', planId)
    .maybeSingle()
  return (data ?? null) as SubscriptionPlan | null
}

/** 사용자의 현재 활성 구독 (광장별). */
export async function getCurrentSubscription(
  userId: string,
  plazaId: string,
): Promise<Subscription | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('plaza_id', plazaId)
    .in('status', ['active', 'past_due', 'free_period', 'pending'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data ?? null) as Subscription | null
}

export interface CreateSubscriptionInput {
  userId: string
  plazaId: string
  planId: string
}

export interface CreateSubscriptionResult {
  ok: boolean
  subscription?: Subscription
  paymentRequired?: boolean   // PG 결제창 띄울지 여부
  freePeriod?: boolean        // 무료 기간 가입인지
  error?: string
}

/**
 * 구독 생성.
 *
 * 6개월 무료 기간 (Feature Flag monetization.subscriptions = false):
 *   → status='free_period', is_early_bird=true, 결제 X
 *
 * 활성화 후:
 *   → status='pending', PG 결제창 → webhook 으로 'active' 전환
 */
export async function createSubscription(
  input: CreateSubscriptionInput,
): Promise<CreateSubscriptionResult> {
  const supabase = await createClient()
  const plan = await getPlan(input.planId)
  if (!plan) return { ok: false, error: '존재하지 않는 플랜입니다.' }

  // 이미 활성 구독이 있는지 체크
  const existing = await getCurrentSubscription(input.userId, input.plazaId)
  if (existing && existing.plan_id === input.planId) {
    return { ok: false, error: '이미 가입된 플랜입니다.', subscription: existing }
  }

  const subscriptionsEnabled = await isFeatureEnabled('monetization.subscriptions')

  // 무료 운영 기간 — free_period 상태로 즉시 활성화 + 얼리버드 락인
  if (!subscriptionsEnabled) {
    const periodEnd = new Date(FREE_PERIOD_END_DATE)
    const { data, error } = await supabase
      .from('subscriptions')
      .insert({
        user_id: input.userId,
        plaza_id: input.plazaId,
        plan_id: input.planId,
        status: 'free_period',
        current_period_start: new Date().toISOString(),
        current_period_end: periodEnd.toISOString(),
        is_early_bird: true,
        applied_discount_pct: plan.early_bird_discount_pct,
      })
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return {
      ok: true,
      subscription: data as Subscription,
      paymentRequired: false,
      freePeriod: true,
    }
  }

  // 정상 운영 — pending 으로 생성, 결제 후 active
  const { data, error } = await supabase
    .from('subscriptions')
    .insert({
      user_id: input.userId,
      plaza_id: input.plazaId,
      plan_id: input.planId,
      status: 'pending',
      current_period_start: new Date().toISOString(),
      current_period_end: addMonths(new Date(), 1).toISOString(),
      is_early_bird: false,
      applied_discount_pct: 0,
    })
    .select('*')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, subscription: data as Subscription, paymentRequired: true }
}

/** 구독 취소 (현 결제 기간 끝까지 사용 가능). */
export async function cancelSubscription(
  subscriptionId: string,
  userId: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('subscriptions')
    .update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      cancel_reason: reason ?? null,
    })
    .eq('id', subscriptionId)
    .eq('user_id', userId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * 무료 기간 종료 시 free_period → past_due 일괄 전환.
 * 사용자가 결제 등록을 안 하면 past_due → 만료 처리됨.
 *
 * cron 으로 호출.
 */
export async function expireFreePeriodSubscriptions(): Promise<{ updated: number }> {
  const supabase = await createClient()
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('subscriptions')
    .update({ status: 'past_due' })
    .eq('status', 'free_period')
    .lt('current_period_end', now)
    .select('id')
  if (error) return { updated: 0 }
  return { updated: (data ?? []).length }
}

function addMonths(d: Date, months: number): Date {
  const r = new Date(d.getTime())
  r.setMonth(r.getMonth() + months)
  return r
}

/**
 * 가격 계산 — 얼리버드 할인 / VAT 등 적용.
 */
export function calculateChargeAmount(
  plan: SubscriptionPlan,
  isEarlyBird: boolean,
): { gross: number; discount: number; net: number } {
  const gross = plan.monthly_price
  const discountPct = isEarlyBird ? plan.early_bird_discount_pct : 0
  const discount = Math.floor((gross * discountPct) / 100)
  const net = gross - discount
  return { gross, discount, net }
}
