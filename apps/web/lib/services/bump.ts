/**
 * 글 올리기 (Bump) 서비스.
 *
 *   - 본인 글의 bumped_at 을 NOW() 로 갱신 → 최신순 맨 위로
 *   - 무료 N회/일 (bump_settings) → 다 쓰면 포인트 또는 현금 결제
 *   - 같은 글 cooldown_seconds 내 재올리기 차단
 *
 * 도메인: property | secondhand (foundation 마이그레이션 기준)
 *   향후 board_posts / sharing / group_buying / etc 확장 가능 (같은 패턴).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { spend } from './billing/points'

/**
 * Bump 서비스 — 모든 쓰기는 service-role admin client 로 수행.
 *
 * 이유:
 *   - bump_tickets / bump_daily / bump_history / bump_ticket_orders 의 RLS 가
 *     SELECT 만 허용. INSERT/UPDATE 는 admin 또는 service 만.
 *   - 서비스 함수는 항상 `userId` 파라미터로 manual 필터하므로 admin bypass 안전.
 *   - API 라우트(/api/bump/*) 가 이미 supabase.auth.getUser() 로 user.id 검증 후
 *     이 service 를 호출 — 사용자 신원은 그쪽에서 보증.
 */
async function createClient() {
  return createAdminClient()
}

export type BumpTargetType =
  | 'property'
  | 'secondhand'
  | 'interior'
  | 'moving'
  | 'cleaning'
  | 'repair'
  | 'group_buying'
  | 'local_food'
  | 'jobs'
  | 'new_store'

const TABLE_BY_TYPE: Record<BumpTargetType, string> = {
  property: 'properties',
  secondhand: 'secondhand_posts',
  interior: 'interior_posts',
  moving: 'moving_posts',
  cleaning: 'cleaning_posts',
  repair: 'repair_posts',
  group_buying: 'group_buying_posts',
  local_food: 'local_food',
  jobs: 'jobs_posts',
  new_store: 'new_store_posts',
}

export interface BumpStatus {
  /** 무료 잔여 횟수 (오늘) */
  freeRemaining: number
  /** 무료 한도 */
  freeTotal: number
  /** 추가 1회 = N 포인트 */
  pointsCost: number
  /** 추가 1회 = N 원 (현금) — 직접 결제는 비활성, ticket 으로 통합 */
  krwCost: number
  /** 보유 올리기권 잔액 */
  ticketBalance: number
  /** 같은 글 cooldown 풀리는 시각 (null 이면 즉시 가능) */
  cooldownUntil: string | null
  /** 가입 N일 미만이면 차단 */
  accountAgeOk: boolean
  /** 적립 가능 여부 종합 */
  canBumpFree: boolean
  canBumpPaid: boolean
}

function todayDateStr(): string {
  // YYYY-MM-DD (KST 기준 — 한국 사용자가 자정 기준으로 일일 무료 끌올 받음)
  // UTC 기준이면 한국 자정~09:00 사이에 "어제 = 오늘" 으로 인식되는 버그가 있었음.
  // Intl.DateTimeFormat 의 'en-CA' locale 은 YYYY-MM-DD 출력
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date())
}

/** 글 소유자 + plaza_id 추출. (bump 호출 전 호출자가 검증한 뒤 보내는 것도 가능) */
async function getTargetMeta(
  targetType: BumpTargetType,
  targetId: string,
): Promise<{ user_id: string; plaza_id: string; bumped_at: string | null } | null> {
  const supabase = await createClient()
  const table = TABLE_BY_TYPE[targetType]
  const { data, error } = await (supabase as any)
    .from(table)
    .select('user_id, plaza_id, bumped_at')
    .eq('id', targetId)
    .maybeSingle()
  if (error || !data) return null
  return data as any
}

/** 사용자 가입일 조회 */
async function getAccountAgeDays(userId: string): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('created_at')
    .eq('id', userId)
    .maybeSingle()
  if (!data?.created_at) return 0
  const ms = Date.now() - new Date(data.created_at).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

/** 현재 상태 (UI 모달용) */
export async function getBumpStatus(
  userId: string,
  plazaId: string,
  targetType: BumpTargetType,
  targetId: string,
): Promise<{ ok: true; status: BumpStatus } | { ok: false; reason: string }> {
  const supabase = await createClient()

  const { data: setting } = await supabase
    .from('bump_settings')
    .select('*')
    .eq('target_type', targetType)
    .eq('enabled', true)
    .maybeSingle()
  if (!setting) return { ok: false, reason: 'feature_disabled' }

  // 일일 카운터 — 🆕 전체 도메인 합산 (도메인별 카운트가 아니라 사용자 단위 통합 2개)
  const GLOBAL_FREE_PER_DAY = 2
  const { data: dailyAll } = await supabase
    .from('bump_daily')
    .select('free_used')
    .eq('user_id', userId)
    .eq('plaza_id', plazaId)
    .eq('date', todayDateStr())
  const freeUsed = (dailyAll ?? []).reduce(
    (sum, r) => sum + ((r as any).free_used ?? 0),
    0,
  )
  const freeRemaining = Math.max(0, GLOBAL_FREE_PER_DAY - freeUsed)

  // 같은 글 cooldown
  const target = await getTargetMeta(targetType, targetId)
  let cooldownUntil: string | null = null
  if (target?.bumped_at) {
    const next =
      new Date(target.bumped_at).getTime() +
      (setting as any).cooldown_seconds * 1000
    if (next > Date.now()) cooldownUntil = new Date(next).toISOString()
  }

  // 계정 연령
  const ageDays = await getAccountAgeDays(userId)
  const accountAgeOk = ageDays >= (setting as any).required_account_age_days

  // 올리기권 잔액
  const { data: ticket } = await supabase
    .from('bump_tickets')
    .select('balance')
    .eq('user_id', userId)
    .eq('plaza_id', plazaId)
    .maybeSingle()
  const ticketBalance = (ticket as any)?.balance ?? 0

  return {
    ok: true,
    status: {
      freeRemaining,
      // 🆕 전체 통합 무료 한도 (도메인별 X)
      freeTotal: GLOBAL_FREE_PER_DAY,
      pointsCost: (setting as any).points_cost,
      krwCost: (setting as any).krw_cost,
      ticketBalance,
      cooldownUntil,
      accountAgeOk,
      canBumpFree: accountAgeOk && cooldownUntil == null && freeRemaining > 0,
      canBumpPaid: accountAgeOk && cooldownUntil == null,
    },
  }
}

interface BumpInput {
  userId: string
  plazaId: string
  targetType: BumpTargetType
  targetId: string
  payment: 'free' | 'points' | 'ticket'
}

export async function bump(input: BumpInput): Promise<
  | { ok: true; bumpedAt: string }
  | { ok: false; reason: string; error?: string }
> {
  const { userId, plazaId, targetType, targetId, payment } = input
  const supabase = await createClient()

  // ─── RPC 우선 시도 (atomic) — 환경변수로 제어 가능 ────────────────────────
  // BUMP_USE_RPC=off 면 fallback 으로 (긴급 롤백 안전망)
  if (process.env.BUMP_USE_RPC !== 'off') {
    // points cost 계산을 위해 settings 한 번 조회 (cache 가능)
    const { data: setting } = await supabase
      .from('bump_settings')
      .select('points_cost')
      .eq('target_type', targetType)
      .eq('enabled', true)
      .maybeSingle()
    const pointsCost = (setting as any)?.points_cost ?? 0

    const { data: rpcResult, error: rpcErr } = await supabase.rpc('bump_atomic', {
      p_user_id: userId,
      p_plaza_id: plazaId,
      p_target_type: targetType,
      p_target_id: targetId,
      p_payment: payment,
      p_points_cost: pointsCost,
    })
    if (!rpcErr && rpcResult) {
      const r = rpcResult as { ok: boolean; reason?: string; bumped_at?: string }
      if (r.ok && r.bumped_at) return { ok: true, bumpedAt: r.bumped_at }
      if (!r.ok) return { ok: false, reason: r.reason ?? 'unknown' }
    }
    // RPC 호출 실패 (네트워크/스키마 미스 등) → fallback 으로
    if (rpcErr) console.warn('[bump] RPC failed, falling back:', rpcErr.message)
  }

  // ─── Fallback: 기존 비-atomic 흐름 ─────────────────────────────────────────
  // 1) 소유권 검증 — 정보 누출(plaza enumeration) 방지를 위해 단일 reason 으로 통합
  const target = await getTargetMeta(targetType, targetId)
  if (!target) return { ok: false, reason: 'not_found_or_not_owner' }
  if (target.user_id !== userId) return { ok: false, reason: 'not_found_or_not_owner' }
  if (target.plaza_id !== plazaId) return { ok: false, reason: 'not_found_or_not_owner' }

  // 2) 정책 + 상태 확인
  const statusRes = await getBumpStatus(userId, plazaId, targetType, targetId)
  if (!statusRes.ok) return statusRes
  const s = statusRes.status

  if (!s.accountAgeOk) return { ok: false, reason: 'account_too_young' }
  if (s.cooldownUntil)  return { ok: false, reason: 'cooldown' }

  if (payment === 'free') {
    if (s.freeRemaining <= 0) return { ok: false, reason: 'no_free_quota' }
  } else if (payment === 'points') {
    const r = await spend({
      userId,
      plazaId,
      category: 'bump',
      amount: s.pointsCost,
      sourceId: targetId,
    })
    if (!r.ok) return { ok: false, reason: r.reason ?? 'points_spend_failed', error: r.error }
  } else if (payment === 'ticket') {
    if (s.ticketBalance <= 0) return { ok: false, reason: 'no_tickets' }
    // 잔액 -1 — atomic check: balance > 0 인 row 만 update, 동시 요청 시 한 쪽이 0 row 받음
    const { data: tRows, error: tErr } = await supabase
      .from('bump_tickets')
      .update({
        balance: s.ticketBalance - 1,
        lifetime_used:
          (s as any).lifetime_used != null ? (s as any).lifetime_used + 1 : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('plaza_id', plazaId)
      .gt('balance', 0)
      .select('balance')
    if (tErr) return { ok: false, reason: 'ticket_use_failed', error: tErr.message }
    // 동시 요청에서 race 발생 시 affected rows 0 — double-spend 차단
    if (!tRows || tRows.length === 0) {
      return { ok: false, reason: 'no_tickets' }
    }
  }

  // 3) bumped_at 갱신
  const now = new Date().toISOString()
  const table = TABLE_BY_TYPE[targetType]
  const { error: updErr } = await (supabase as any)
    .from(table)
    .update({ bumped_at: now })
    .eq('id', targetId)
    .eq('user_id', userId)
  if (updErr) return { ok: false, reason: 'update_failed', error: updErr.message }

  // 4) 카운터 + 히스토리 기록
  const today = todayDateStr()
  const incCol = payment === 'free' ? 'free_used' : 'paid_used'
  // upsert: 있으면 +1, 없으면 1
  await supabase.rpc('bump_inc_daily', {
    p_user_id: userId,
    p_plaza_id: plazaId,
    p_target_type: targetType,
    p_date: today,
    p_col: incCol,
  }).then(async (res) => {
    // RPC 가 없으면 fallback (트랜잭션 보장 X)
    if (res.error) {
      await supabase
        .from('bump_daily')
        .upsert(
          {
            user_id: userId,
            plaza_id: plazaId,
            target_type: targetType,
            date: today,
            free_used: payment === 'free' ? 1 : 0,
            paid_used: payment !== 'free' ? 1 : 0,
          },
          { onConflict: 'user_id,plaza_id,target_type,date', ignoreDuplicates: false },
        )
      // upsert 가 +1 을 못 하므로 다시 select → update
      const { data: cur } = await supabase
        .from('bump_daily')
        .select('free_used, paid_used')
        .eq('user_id', userId)
        .eq('plaza_id', plazaId)
        .eq('target_type', targetType)
        .eq('date', today)
        .maybeSingle()
      if (cur) {
        await supabase
          .from('bump_daily')
          .update({
            free_used: payment === 'free' ? cur.free_used + 1 : cur.free_used,
            paid_used: payment !== 'free' ? cur.paid_used + 1 : cur.paid_used,
          })
          .eq('user_id', userId)
          .eq('plaza_id', plazaId)
          .eq('target_type', targetType)
          .eq('date', today)
      }
    }
  })

  await supabase.from('bump_history').insert({
    user_id: userId,
    plaza_id: plazaId,
    target_type: targetType,
    target_id: targetId,
    payment,
    cost_points: payment === 'points' ? s.pointsCost : 0,
    cost_krw: 0,
  })

  return { ok: true, bumpedAt: now }
}

// ─── 올리기권 (Bump Tickets) ──────────────────────────────────────────────

export interface BumpTicketPack {
  id: string
  size: number
  krw_price: number
  points_price: number
  display_label: string
  description: string | null
  enabled: boolean
  sort_order: number
}

export async function listTicketPacks(): Promise<BumpTicketPack[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('bump_ticket_packs')
    .select('*')
    .eq('enabled', true)
    .order('sort_order', { ascending: true })
  return (data as BumpTicketPack[]) ?? []
}

export async function getTicketBalance(
  userId: string,
  plazaId: string,
): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('bump_tickets')
    .select('balance')
    .eq('user_id', userId)
    .eq('plaza_id', plazaId)
    .maybeSingle()
  return (data as any)?.balance ?? 0
}

interface PurchaseTicketInput {
  userId: string
  plazaId: string
  packId: string
  payment: 'points' | 'cash'
  /** 현금 결제 시 외부 결제 ID — 현재는 BETA stub 허용 */
  paymentId?: string
}

export async function purchaseTicketPack(input: PurchaseTicketInput): Promise<
  | { ok: true; balance: number; added: number }
  | { ok: false; reason: string; error?: string }
> {
  const { userId, plazaId, packId, payment, paymentId } = input
  const supabase = await createClient()

  // 현금 결제 게이트 (실연동 전까지)
  if (payment === 'cash' && process.env.BUMP_CASH_ENABLED !== 'on') {
    return { ok: false, reason: 'cash_disabled' }
  }

  // ─── RPC 우선 (atomic 결제 + 잔액 + 주문 기록) ─────────────────────────────
  if (process.env.BUMP_USE_RPC !== 'off') {
    const { data: rpcResult, error: rpcErr } = await supabase.rpc(
      'bump_purchase_ticket_atomic',
      {
        p_user_id: userId,
        p_plaza_id: plazaId,
        p_pack_id: packId,
        p_payment: payment,
        p_payment_id: (paymentId ?? null) as string | undefined,
      },
    )
    if (!rpcErr && rpcResult) {
      const r = rpcResult as {
        ok: boolean
        reason?: string
        balance?: number
        added?: number
      }
      if (r.ok && r.balance != null && r.added != null) {
        return { ok: true, balance: r.balance, added: r.added }
      }
      if (!r.ok) return { ok: false, reason: r.reason ?? 'unknown' }
    }
    if (rpcErr) console.warn('[bump.purchaseTicketPack] RPC failed, falling back:', rpcErr.message)
  }

  // ─── Fallback: 기존 비-atomic 흐름 ──────────────────────────────────────────
  const { data: pack } = await supabase
    .from('bump_ticket_packs')
    .select('*')
    .eq('id', packId)
    .eq('enabled', true)
    .maybeSingle()
  if (!pack) return { ok: false, reason: 'pack_not_found' }

  // 결제
  if (payment === 'points') {
    const r = await spend({
      userId,
      plazaId,
      category: 'bump',
      amount: (pack as any).points_price,
    })
    if (!r.ok) return { ok: false, reason: r.reason ?? 'points_spend_failed', error: r.error }
  } else if (payment === 'cash') {
    // 현금 결제는 외부 결제 게이트웨이 실연동 전까지 차단 — BETA stub 악용 방어
    if (process.env.BUMP_CASH_ENABLED !== 'on') {
      return { ok: false, reason: 'cash_disabled' }
    }
    if (!paymentId) return { ok: false, reason: 'payment_id_required' }
  }

  // 잔액 +size (upsert)
  const current = await getTicketBalance(userId, plazaId)
  const newBalance = current + (pack as any).size
  const { error: upErr } = await supabase
    .from('bump_tickets')
    .upsert(
      {
        user_id: userId,
        plaza_id: plazaId,
        balance: newBalance,
        lifetime_purchased: current + (pack as any).size, // 단순화
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,plaza_id' },
    )
  if (upErr) return { ok: false, reason: 'balance_update_failed', error: upErr.message }

  // 주문 기록
  await supabase.from('bump_ticket_orders').insert({
    user_id: userId,
    plaza_id: plazaId,
    pack_id: packId,
    qty: (pack as any).size,
    payment,
    cost_points: payment === 'points' ? (pack as any).points_price : 0,
    cost_krw: payment === 'cash' ? (pack as any).krw_price : 0,
    payment_id: paymentId ?? null,
  })

  return { ok: true, balance: newBalance, added: (pack as any).size }
}
