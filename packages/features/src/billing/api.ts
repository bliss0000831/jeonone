/**
 * Billing 도메인 API — DI 패턴 (SupabaseClient 외부 주입).
 * 광장 web lib/services/billing 의 RN 호환 버전.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface SubscriptionPlan {
  id: string
  name: string
  description: string | null
  monthly_price: number
  early_bird_discount_pct: number
  is_active: boolean
}

export interface Subscription {
  id: string
  user_id: string
  plaza_id: string
  plan_id: string
  status: "active" | "pending" | "free_period" | "past_due" | "canceled" | "expired"
  current_period_start: string
  current_period_end: string
  is_early_bird: boolean
  applied_discount_pct: number | null
}

/** 활성 플랜 목록 */
export async function listActivePlans(
  supabase: SupabaseClient,
): Promise<SubscriptionPlan[]> {
  const { data } = await supabase
    .from("subscription_plans")
    .select("id, name, description, monthly_price, early_bird_discount_pct, is_active")
    .eq("is_active", true)
    .order("monthly_price")
  return (data ?? []) as SubscriptionPlan[]
}

/** 사용자의 현재 활성 구독 (광장별) */
export async function getCurrentSubscription(
  supabase: SupabaseClient,
  userId: string,
  plazaId: string,
): Promise<Subscription | null> {
  const { data } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .eq("plaza_id", plazaId)
    .in("status", ["active", "past_due", "free_period", "pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data ?? null) as Subscription | null
}

/** Feature flag — 광장 web 의 lib/services/billing/feature-flags 와 호환 */
export async function isFeatureEnabled(
  supabase: SupabaseClient,
  key: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("feature_flags")
    .select("enabled")
    .eq("key", key)
    .maybeSingle()
  return !!(data && (data as any).enabled)
}

/** 가격 계산 — 얼리버드 할인 적용 (순수 함수) */
export function calculateChargeAmount(
  plan: SubscriptionPlan,
  isEarlyBird: boolean,
): { gross: number; discount: number; net: number } {
  const gross = plan.monthly_price
  const pct = isEarlyBird ? plan.early_bird_discount_pct : 0
  const discount = Math.floor((gross * pct) / 100)
  return { gross, discount, net: gross - discount }
}

/** 구독 생성 — 무료기간이면 즉시 free_period, 아니면 pending */
export async function createSubscription(
  supabase: SupabaseClient,
  args: { userId: string; plazaId: string; planId: string; freePeriod: boolean },
): Promise<Subscription> {
  const now = new Date()
  const end = new Date(now)
  end.setMonth(end.getMonth() + 1)
  const status = args.freePeriod ? "free_period" : "pending"
  const { data, error } = await supabase
    .from("subscriptions")
    .insert({
      user_id: args.userId,
      plaza_id: args.plazaId,
      plan_id: args.planId,
      status,
      current_period_start: now.toISOString(),
      current_period_end: end.toISOString(),
      is_early_bird: args.freePeriod,
      applied_discount_pct: args.freePeriod ? 50 : 0,
    })
    .select()
    .single()
  if (error) throw error
  return data as Subscription
}
