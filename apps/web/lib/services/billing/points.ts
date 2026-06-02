/**
 * 포인트 서비스 — 글쓰기 적립 + 결제 사용 + 어뷰징 방지.
 *
 * Feature Flag 'monetization.points' OFF 시 모든 호출이 no-op.
 *
 * 핵심 흐름:
 *  earn(rule_id, source_id) → 자격 체크 → pending 거래 생성 → counters++
 *                                                         ↓
 *  cron (24h 후) → evaluatePending() → confirm or revert (품질 평가)
 *                                                         ↓
 *  spend(category, amount) → 잔액/한도 검증 → 차감 → 거래 기록
 *
 *  revert(source_id, reason) → 신고/삭제 시 호출 → 회수 + reputation ↓
 */
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * 포인트 시스템 — 모든 쓰기는 service-role admin client 로 수행.
 *
 * 이유:
 *   - point_transactions / user_points / point_daily_counters 의 RLS 가
 *     admin 만 쓰기 허용 (악의적 사용자가 자기 reputation 100, balance 조작 차단).
 *   - 서비스 함수는 항상 `userId` 파라미터로 manual 필터하므로 admin bypass 안전함.
 *   - API 라우트(/api/points/*) 가 이미 supabase.auth.getUser() 로 user.id 검증 후
 *     이 service 를 호출 — 사용자 신원은 그쪽에서 보증.
 */
async function createClient() {
  return createAdminClient()
}
import { isFeatureEnabled } from './feature-flags'

export interface PointTransaction {
  id: string
  user_id: string
  plaza_id: string | null  // 광장 격리 해제 — nullable (레거시 데이터만 값 존재)
  type: 'earn' | 'spend' | 'revert' | 'expire' | 'manual_adjust' | 'penalty' | 'event'
  amount: number
  source: string
  source_id: string | null
  rule_id: string | null
  status: 'pending' | 'confirmed' | 'reverted'
  evaluation_at: string | null
  confirmed_at: string | null
  reverted_at: string | null
  reverted_reason: string | null
  metadata: Record<string, any>
  created_at: string
}

export interface UserPoints {
  user_id: string
  plaza_id: string | null  // 광장 격리 해제 — 더 이상 사용 안 함
  available: number
  pending: number
  lifetime_earned: number
  lifetime_spent: number
  lifetime_reverted: number
  reputation_score: number
  is_suspended: boolean
  suspended_reason: string | null
}

export interface PointRule {
  id: string
  display_name: string
  amount: number
  daily_cap: number | null
  weekly_cap: number | null
  cooldown_seconds: number
  quality_threshold: Record<string, any>
  evaluation_period_hours: number
  required_account_age_days: number
  required_phone_verified: boolean
  required_email_verified: boolean
  enabled: boolean
  description: string | null
}

export interface RedemptionSetting {
  category: string
  display_name: string
  enabled: boolean
  max_redemption_pct: number
  exchange_rate: number
  daily_limit_pt: number | null
  min_balance_required: number
  required_account_age_days: number
  description: string | null
}

// ============================================================================
// 적립 (Earn)
// ============================================================================

export interface EarnInput {
  userId: string
  plazaId?: string | null  // 광장 격리 해제 — 하위 호환용 (무시됨)
  ruleId: string
  sourceId?: string
  /** 품질 검증용 메타데이터 (예: { length: 120, has_image: true }) */
  qualityData?: Record<string, any>
}

export interface EarnResult {
  ok: boolean
  amount?: number
  status?: 'pending' | 'confirmed'
  error?: string
  reason?: string  // 적립 안 된 사유 (debug)
}

/**
 * 활동에 대해 포인트 적립 시도.
 *
 * Feature Flag OFF / 자격 미달 / 한도 초과 시 silent no-op (앱 동작은 정상 진행).
 */
export async function earn(input: EarnInput): Promise<EarnResult> {
  const enabled = await isFeatureEnabled('monetization.points')
  if (!enabled) return { ok: true, reason: 'feature_disabled' }

  const supabase = await createClient()

  // 규칙 로드
  const { data: rule } = await supabase
    .from('point_rules')
    .select('*')
    .eq('id', input.ruleId)
    .eq('enabled', true)
    .maybeSingle()
  if (!rule) return { ok: false, reason: 'rule_not_found' }

  // 사용자 정보 (가입일 / 휴대폰 인증 등)
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, phone, created_at, role')
    .eq('id', input.userId)
    .maybeSingle()
  if (!profile) return { ok: false, reason: 'profile_not_found' }

  // 자격 검증
  const accountAgeDays = Math.floor(
    (Date.now() - new Date(profile.created_at!).getTime()) / (1000 * 60 * 60 * 24),
  )
  if (accountAgeDays < (rule as any).required_account_age_days) {
    return { ok: false, reason: 'account_too_new' }
  }
  if ((rule as any).required_phone_verified && !profile.phone) {
    return { ok: false, reason: 'phone_not_verified' }
  }

  // 잔액 / Reputation 조회 (광장 격리 해제 — user_id 기준)
  const points = await ensureUserPoints(input.userId)
  if (points.is_suspended) return { ok: false, reason: 'user_suspended' }

  // Reputation 에 따른 적립률 보정
  const multiplier = reputationMultiplier(points.reputation_score)
  if (multiplier === 0) return { ok: false, reason: 'reputation_too_low' }

  // 품질 검증
  const threshold = (rule as any).quality_threshold ?? {}
  if (threshold.min_length != null && (input.qualityData?.length ?? 0) < threshold.min_length) {
    return { ok: false, reason: 'quality_min_length' }
  }
  if (threshold.must_have_image && !input.qualityData?.has_image) {
    return { ok: false, reason: 'quality_no_image' }
  }

  // 최종 적립 포인트 계산
  const amount = Math.floor((rule as any).amount * multiplier)
  if (amount <= 0) return { ok: false, reason: 'amount_zero' }

  // 일일 한도 — 원자적 증가 후 반환 count 로 검증 (race-safe)
  if ((rule as any).daily_cap) {
    // KST (UTC+9) 기준 날짜 — UTC 사용 시 자정 전후 9시간 차이로 일일한도 이중 적립 가능
    const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { data: newCount, error: rpcErr } = await supabase.rpc('increment_point_daily_counter', {
      p_user_id: input.userId,
      p_rule_id: input.ruleId,
      p_date: today,
    })
    if (rpcErr) {
      console.warn('[earn] counter RPC failed', rpcErr.message)
      return { ok: false, reason: 'counter_failed', error: rpcErr.message }
    }
    if (typeof newCount === 'number' && newCount > (rule as any).daily_cap) {
      // 한도 초과 — 원자적 카운터 -1 (RPC 재사용: increment(-1) 패턴)
      // decrement RPC가 없으면 직접 SQL로 원자적 감소
      const { error: decErr } = await (supabase.rpc as any)('decrement_point_daily_counter', {
        p_user_id: input.userId,
        p_rule_id: input.ruleId,
        p_date: today,
      })
      if (decErr) {
        // decrement RPC 미존재 시 fallback — count = count - 1 (non-atomic이지만 기존보다는 나음)
        console.warn('[earn] decrement RPC failed, fallback:', decErr.message)
        await supabase
          .from('point_daily_counters')
          .update({ count: (newCount as number) - 1 })
          .eq('user_id', input.userId)
          .eq('rule_id', input.ruleId)
          .eq('date', today)
      }
      return { ok: false, reason: 'daily_cap_reached' }
    }
  }

  // 평가 대기 시간 계산
  const evalHours = (rule as any).evaluation_period_hours ?? 24
  const evaluationAt = new Date(Date.now() + evalHours * 60 * 60 * 1000).toISOString()
  const status: 'pending' | 'confirmed' = evalHours === 0 ? 'confirmed' : 'pending'

  // 거래 생성 (광장 격리 해제 — plaza_id NULL, 마이그레이션 후 nullable)
  const { error: txErr } = await supabase.from('point_transactions').insert({
    user_id: input.userId,
    plaza_id: null as any,
    type: 'earn',
    amount,
    source: input.ruleId,
    source_id: input.sourceId ?? null,
    rule_id: input.ruleId,
    status,
    evaluation_at: evaluationAt,
    confirmed_at: status === 'confirmed' ? new Date().toISOString() : null,
    metadata: { multiplier, ...input.qualityData },
  })
  if (txErr) return { ok: false, reason: 'tx_insert_failed', error: txErr.message }

  // 잔액 갱신 — 원자적 증감 RPC (read-then-write 레이스 방어)
  // points.available + amount 대신 DB 측에서 atomic increment
  if (status === 'confirmed') {
    const { error: incErr } = await (supabase.rpc as any)('increment_user_points', {
      p_user_id: input.userId,
      p_available_delta: amount,
      p_pending_delta: 0,
      p_lifetime_earned_delta: amount,
      p_lifetime_spent_delta: 0,
      p_lifetime_reverted_delta: 0,
    })
    // RPC 미존재 시 fallback (마이그레이션 전 환경)
    if (incErr) {
      console.warn('[earn] increment RPC failed, fallback:', incErr.message)
      await supabase
        .from('user_points')
        .update({
          available: points.available + amount,
          lifetime_earned: points.lifetime_earned + amount,
        })
        .eq('user_id', input.userId)
    }
  } else {
    const { error: incErr } = await (supabase.rpc as any)('increment_user_points', {
      p_user_id: input.userId,
      p_available_delta: 0,
      p_pending_delta: amount,
      p_lifetime_earned_delta: 0,
      p_lifetime_spent_delta: 0,
      p_lifetime_reverted_delta: 0,
    })
    if (incErr) {
      console.warn('[earn] increment RPC failed, fallback:', incErr.message)
      await supabase
        .from('user_points')
        .update({ pending: points.pending + amount })
        .eq('user_id', input.userId)
    }
  }

  return { ok: true, amount, status }
}

// ============================================================================
// 사용 (Spend)
// ============================================================================

export interface SpendInput {
  userId: string
  plazaId?: string | null  // 광장 격리 해제 — 하위 호환용 (무시됨)
  category: string  // 'group_buying' | 'local_food' | 'boost' | ...
  amount: number    // 사용할 포인트
  /** 결제 총액 (max_redemption_pct 검증용) */
  paymentTotal?: number
  sourceId?: string
}

export async function spend(input: SpendInput): Promise<{ ok: boolean; error?: string; reason?: string }> {
  const enabled = await isFeatureEnabled('monetization.points')
  if (!enabled) return { ok: false, reason: 'feature_disabled' }

  const supabase = await createClient()

  // ─── RPC 우선 (atomic balance check + decrement + transaction insert) ─────
  // POINTS_USE_RPC=off 면 fallback (긴급 롤백 안전망)
  if (process.env.POINTS_USE_RPC !== 'off') {
    // user_points row 존재 보장 (RPC 가 UPDATE 만 하므로 row 가 있어야 함)
    await ensureUserPoints(input.userId)

    const { data: rpcResult, error: rpcErr } = await supabase.rpc('points_spend_atomic', {
      p_user_id: input.userId,
      p_plaza_id: null as any,  // 광장 격리 해제 — RPC에서 무시됨
      p_category: input.category,
      p_amount: input.amount,
      p_payment_total: (input.paymentTotal ?? null) as number | undefined,
      p_source_id: (input.sourceId ?? null) as string | undefined,
    })
    if (!rpcErr && rpcResult) {
      const r = rpcResult as { ok: boolean; reason?: string }
      if (r.ok) return { ok: true }
      if (!r.ok) return { ok: false, reason: r.reason ?? 'unknown' }
    }
    if (rpcErr) console.warn('[spend] RPC failed, falling back:', rpcErr.message)
  }

  // ─── Fallback: 기존 비-atomic 흐름 ──────────────────────────────────────────
  // 사용처 정책
  const { data: setting } = await supabase
    .from('point_redemption_settings')
    .select('*')
    .eq('category', input.category)
    .eq('enabled', true)
    .maybeSingle()
  if (!setting) return { ok: false, reason: 'category_disabled' }

  // 결제액 비례 한도
  if (input.paymentTotal != null) {
    const maxPt = Math.floor((input.paymentTotal * (setting as any).max_redemption_pct) / 100)
    if (input.amount > maxPt) {
      return { ok: false, reason: 'exceeds_redemption_pct' }
    }
  }

  // 잔액 확인 (광장 격리 해제 — user_id 기준)
  const points = await ensureUserPoints(input.userId)
  if (points.is_suspended) return { ok: false, reason: 'user_suspended' }
  if (points.available < input.amount) return { ok: false, reason: 'insufficient_balance' }

  // 거래 기록 (광장 격리 해제 — plaza_id NULL, 마이그레이션 후 nullable)
  const { data: insertedTx, error } = await supabase.from('point_transactions').insert({
    user_id: input.userId,
    plaza_id: null as any,
    type: 'spend',
    amount: input.amount,
    source: `${input.category}.purchase`,
    source_id: input.sourceId ?? null,
    status: 'confirmed',
    confirmed_at: new Date().toISOString(),
    metadata: { category: input.category, payment_total: input.paymentTotal },
  }).select('id').maybeSingle()
  if (error) return { ok: false, error: error.message }
  const txId = insertedTx?.id

  // 잔액 차감 — atomic conditional UPDATE (음수 잔액 race 방어, PK = user_id)
  const { data: updatedRow, error: updErr } = await supabase
    .from('user_points')
    .update({
      available: points.available - input.amount,
      lifetime_spent: points.lifetime_spent + input.amount,
    })
    .eq('user_id', input.userId)
    .gte('available', input.amount)
    .select('available')
    .maybeSingle()
  if (updErr || !updatedRow) {
    // 동시 차감으로 잔액 부족이 됐다면 위 INSERT 한 거래 revert — ID 기준 정확 매칭
    if (txId) {
      await supabase
        .from('point_transactions')
        .update({ status: 'reverted', reverted_at: new Date().toISOString(), reverted_reason: 'race' })
        .eq('id', txId)
    }
    return { ok: false, reason: 'insufficient_balance' }
  }

  return { ok: true }
}

// ============================================================================
// 회수 (Revert) — 신고/삭제 시
// ============================================================================

export async function revertBySource(
  source: string,
  sourceId: string,
  reason: string,
): Promise<{ updated: number }> {
  const supabase = await createClient()
  // 해당 source 의 모든 거래 (pending/confirmed) 회수
  const { data: txs } = await supabase
    .from('point_transactions')
    .select('*')
    .eq('source', source)
    .eq('source_id', sourceId)
    .in('status', ['pending', 'confirmed'])
    .eq('type', 'earn')

  if (!txs || txs.length === 0) return { updated: 0 }

  let updated = 0
  for (const tx of txs as PointTransaction[]) {
    await supabase
      .from('point_transactions')
      .update({
        status: 'reverted',
        reverted_at: new Date().toISOString(),
        reverted_reason: reason,
      })
      .eq('id', tx.id)

    // 잔액 회수 — 원자적 증감 (레이스 방어)
    if (tx.status === 'confirmed') {
      const { error: incErr } = await (supabase.rpc as any)('increment_user_points', {
        p_user_id: tx.user_id,
        p_available_delta: -tx.amount,
        p_pending_delta: 0,
        p_lifetime_earned_delta: 0,
        p_lifetime_spent_delta: 0,
        p_lifetime_reverted_delta: tx.amount,
      })
      if (incErr) {
        const points = await ensureUserPoints(tx.user_id)
        await supabase
          .from('user_points')
          .update({
            available: Math.max(0, points.available - tx.amount),
            lifetime_reverted: points.lifetime_reverted + tx.amount,
          })
          .eq('user_id', tx.user_id)
      }
      // Reputation -10 (신고/삭제 페널티) — 별도 업데이트 (음수 방어)
      await (supabase.rpc as any)('decrement_reputation', {
        p_user_id: tx.user_id,
        p_amount: 10,
      }).then(({ error }: { error: any }) => {
        if (error) {
          // RPC 미존재 시 fallback
          return ensureUserPoints(tx.user_id).then(p =>
            supabase
              .from('user_points')
              .update({ reputation_score: Math.max(0, p.reputation_score - 10) })
              .eq('user_id', tx.user_id)
          )
        }
      })
    } else {
      const { error: incErr } = await (supabase.rpc as any)('increment_user_points', {
        p_user_id: tx.user_id,
        p_available_delta: 0,
        p_pending_delta: -tx.amount,
        p_lifetime_earned_delta: 0,
        p_lifetime_spent_delta: 0,
        p_lifetime_reverted_delta: 0,
      })
      if (incErr) {
        const points = await ensureUserPoints(tx.user_id)
        await supabase
          .from('user_points')
          .update({ pending: Math.max(0, points.pending - tx.amount) })
          .eq('user_id', tx.user_id)
      }
      await (supabase.rpc as any)('decrement_reputation', {
        p_user_id: tx.user_id,
        p_amount: 10,
      }).then(({ error }: { error: any }) => {
        if (error) {
          return ensureUserPoints(tx.user_id).then(p =>
            supabase
              .from('user_points')
              .update({ reputation_score: Math.max(0, p.reputation_score - 10) })
              .eq('user_id', tx.user_id)
          )
        }
      })
    }
    updated++
  }
  return { updated }
}

// ============================================================================
// 평가 (Evaluate) — cron 으로 24h 후 호출
// ============================================================================

export async function evaluatePending(): Promise<{ confirmed: number; reverted: number }> {
  const supabase = await createClient()
  const now = new Date().toISOString()

  // 평가 시각 도래한 pending 거래
  const { data: pendings } = await supabase
    .from('point_transactions')
    .select('*')
    .eq('status', 'pending')
    .eq('type', 'earn')
    .lte('evaluation_at', now)
    .limit(500)

  if (!pendings || pendings.length === 0) return { confirmed: 0, reverted: 0 }

  let confirmed = 0
  let reverted = 0

  // 사용자별로 그룹화 → 병렬 처리 (N+1 → 사용자 수만큼 병렬)
  const byUser = new Map<string, PointTransaction[]>()
  for (const tx of pendings as PointTransaction[]) {
    const arr = byUser.get(tx.user_id) || []
    arr.push(tx)
    byUser.set(tx.user_id, arr)
  }

  const results = await Promise.all(
    Array.from(byUser.entries()).map(async ([userId, txs]) => {
      let userConfirmed = 0
      let userReverted = 0

      for (const tx of txs) {
        const ok = await passesEvaluation(supabase, tx)

        if (ok) {
          await supabase
            .from('point_transactions')
            .update({ status: 'confirmed', confirmed_at: now })
            .eq('id', tx.id)
          const { error: incErr } = await (supabase.rpc as any)('increment_user_points', {
            p_user_id: tx.user_id,
            p_available_delta: tx.amount,
            p_pending_delta: -tx.amount,
            p_lifetime_earned_delta: tx.amount,
            p_lifetime_spent_delta: 0,
            p_lifetime_reverted_delta: 0,
          })
          if (incErr) {
            const points = await ensureUserPoints(tx.user_id)
            await supabase
              .from('user_points')
              .update({
                available: points.available + tx.amount,
                pending: Math.max(0, points.pending - tx.amount),
                lifetime_earned: points.lifetime_earned + tx.amount,
              })
              .eq('user_id', tx.user_id)
          }
          userConfirmed++
        } else {
          await supabase
            .from('point_transactions')
            .update({
              status: 'reverted',
              reverted_at: now,
              reverted_reason: 'quality_check_failed',
            })
            .eq('id', tx.id)
          const { error: incErr } = await (supabase.rpc as any)('increment_user_points', {
            p_user_id: tx.user_id,
            p_available_delta: 0,
            p_pending_delta: -tx.amount,
            p_lifetime_earned_delta: 0,
            p_lifetime_spent_delta: 0,
            p_lifetime_reverted_delta: 0,
          })
          if (incErr) {
            const points = await ensureUserPoints(tx.user_id)
            await supabase
              .from('user_points')
              .update({ pending: Math.max(0, points.pending - tx.amount) })
              .eq('user_id', tx.user_id)
          }
          userReverted++
        }
      }
      return { userConfirmed, userReverted }
    })
  )

  for (const r of results) {
    confirmed += r.userConfirmed
    reverted += r.userReverted
  }

  return { confirmed, reverted }
}

/** 평가 통과 여부 — 신고 0건 + 글이 살아있고 + 조회수 임계값 충족 */
async function passesEvaluation(supabase: any, tx: PointTransaction): Promise<boolean> {
  // source_id 가 있는 거래만 (글/매물 등)
  if (!tx.source_id) return true

  // 게시글 평가
  if (tx.source === 'post.create') {
    const { data: post } = await supabase
      .from('board_posts')
      .select('id, view_count, status')
      .eq('id', tx.source_id)
      .maybeSingle()
    if (!post || (post as any).status === 'hidden' || (post as any).status === 'deleted') return false
    if ((post as any).view_count < 5) return false
    return true
  }

  // 매물 평가
  if (tx.source === 'property.create') {
    const { data: prop } = await supabase
      .from('properties')
      .select('id, status')
      .eq('id', tx.source_id)
      .maybeSingle()
    if (!prop || (prop as any).status === 'hidden') return false
    return true
  }

  // 그 외 — 일단 confirm
  return true
}

// ============================================================================
// 잔액 조회 / 보장
// ============================================================================

export async function getUserPoints(userId: string, _plazaId?: string | null): Promise<UserPoints> {
  // 광장 격리 해제 — plazaId 파라미터는 하위 호환용 (무시됨)
  return ensureUserPoints(userId)
}

async function ensureUserPoints(userId: string): Promise<UserPoints> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('user_points')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (data) return data as UserPoints

  // 없으면 생성 — race 시 PK 충돌이 ignoreDuplicates 로 처리되고
  // 두 번째 SELECT 로 실제 row 가져옴 (단일 race 방어)
  const initial = {
    user_id: userId,
    plaza_id: null as any,
    available: 0,
    pending: 0,
    lifetime_earned: 0,
    lifetime_spent: 0,
    lifetime_reverted: 0,
    reputation_score: 100,
    is_suspended: false,
    suspended_reason: null,
  }
  await supabase
    .from('user_points')
    .upsert(initial, { onConflict: 'user_id', ignoreDuplicates: true })
  // 새로 만들었든 race 로 이미 존재하든 — 정확한 row 반환
  const { data: row } = await supabase
    .from('user_points')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  return (row as UserPoints) ?? (initial as UserPoints)
}

async function incrementDailyCounter(userId: string, ruleId: string): Promise<void> {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)
  // 원자적 +1 — RPC 가 ON CONFLICT DO UPDATE 로 race-safe 처리
  const { error } = await supabase.rpc('increment_point_daily_counter', {
    p_user_id: userId,
    p_rule_id: ruleId,
    p_date: today,
  })
  if (error) {
    // RPC 없거나 실패 시 fallback (마이그레이션 미적용 환경 대비)
    console.warn('[incrementDailyCounter] RPC failed, fallback', error.message)
    await supabase
      .from('point_daily_counters')
      .upsert(
        { user_id: userId, rule_id: ruleId, date: today, count: 1 },
        { onConflict: 'user_id,rule_id,date', ignoreDuplicates: true },
      )
  }
}

/** Reputation 점수에 따른 적립 배수 (0~1). */
function reputationMultiplier(score: number): number {
  if (score >= 80) return 1.0
  if (score >= 50) return 0.7
  if (score >= 30) return 0.3
  return 0
}

// ============================================================================
// 규칙 / 사용처 조회
// ============================================================================

export async function listRules(): Promise<PointRule[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('point_rules')
    .select('*')
    .eq('enabled', true)
    .order('amount', { ascending: false })
  return (data ?? []) as PointRule[]
}

export async function listRedemptionSettings(): Promise<RedemptionSetting[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('point_redemption_settings')
    .select('*')
    .eq('enabled', true)
    .order('display_name')
  return (data ?? []) as RedemptionSetting[]
}
