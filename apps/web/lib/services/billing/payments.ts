/**
 * 결제 서비스 — 결제 레코드 생성 / 검증 / 환불.
 *
 * 모든 결제는 commission_splits 와 함께 생성되어 본사/광장 분할이 처음부터 기록됨.
 *
 * Phase 1 (모델 A): 분할은 가상 → 월말 정산 배치가 실제 송금
 * Phase 2 (모델 B): PG 분할정산 → splits 가 즉시 paid_out
 */
import { createClient } from '@/lib/supabase/server'
import { getPgAdapter } from '@/lib/integrations/pg'
import { isFeatureEnabled } from './feature-flags'
import type {
  Payment,
  PaymentKind,
  PaymentStatus,
  CommissionSplit,
} from './types'

const HQ_ROYALTY_RATE_DEFAULT = 20  // %

export interface CreatePaymentInput {
  userId?: string
  plazaId: string
  kind: PaymentKind
  referenceType?: string
  referenceId?: string
  amount: number
  vatAmount?: number
  memo?: string
  /** 광장 협회 ID — 본사/광장 분할 기록 시 필요. 없으면 100% 본사. */
  plazaAssociationId?: string
  /** 본사 수취 비율 (%). 광장 협회별로 다를 수 있음. 기본 20%. */
  hqRoyaltyRate?: number
}

export interface CreatePaymentResult {
  ok: boolean
  payment?: Payment
  splits?: CommissionSplit[]
  error?: string
}

/**
 * 결제 레코드 생성 (PG 호출 전 단계).
 *
 * 동시에 commission_splits 까지 만들어둠 (status='pending').
 * 결제 성공 webhook 후 'reserved' 로 전환.
 */
export async function createPaymentWithSplits(
  input: CreatePaymentInput,
): Promise<CreatePaymentResult> {
  const supabase = await createClient()

  const { data: payment, error } = await supabase
    .from('payments')
    .insert({
      user_id: input.userId ?? null,
      plaza_id: input.plazaId,
      kind: input.kind,
      reference_type: input.referenceType ?? null,
      reference_id: input.referenceId ?? null,
      amount: input.amount,
      vat_amount: input.vatAmount ?? 0,
      status: 'pending',
      memo: input.memo ?? null,
    })
    .select('*')
    .single()

  if (error || !payment) return { ok: false, error: error?.message ?? 'create payment failed' }

  // 분할 계산
  const royaltyRate = input.hqRoyaltyRate ?? HQ_ROYALTY_RATE_DEFAULT
  const hqAmount = Math.floor((input.amount * royaltyRate) / 100)
  const plazaAmount = input.amount - hqAmount

  type SplitRow = {
    payment_id: string
    recipient_type: 'hq' | 'plaza_association' | 'plaza' | 'agent' | 'individual'
    recipient_id: string | null
    plaza_id: string
    amount: number
    rate_pct: number
    status: 'pending' | 'paid' | 'failed'
  }
  const splitsToInsert: SplitRow[] = [
    {
      payment_id: payment.id,
      recipient_type: 'hq',
      recipient_id: null,
      plaza_id: input.plazaId,
      amount: hqAmount,
      rate_pct: royaltyRate,
      status: 'pending',
    },
  ]

  if (input.plazaAssociationId && plazaAmount > 0) {
    splitsToInsert.push({
      payment_id: payment.id,
      recipient_type: 'plaza_association' as const,
      recipient_id: input.plazaAssociationId,
      plaza_id: input.plazaId,
      amount: plazaAmount,
      rate_pct: 100 - royaltyRate,
      status: 'pending' as const,
    })
  } else if (plazaAmount > 0) {
    // 협회 미등록 광장 → 본사 임시 보관
    splitsToInsert.push({
      payment_id: payment.id,
      recipient_type: 'hq' as const,
      recipient_id: null,
      plaza_id: input.plazaId,
      amount: plazaAmount,
      rate_pct: 100 - royaltyRate,
      status: 'pending' as const,
    })
  }

  const { data: splits } = await supabase
    .from('commission_splits')
    .insert(splitsToInsert)
    .select('*')

  return {
    ok: true,
    payment: payment as Payment,
    splits: (splits ?? []) as CommissionSplit[],
  }
}

/**
 * PG 결제 시도 — Feature Flag OFF 면 즉시 'pending' 반환 (실제 결제 X).
 */
export async function requestPayment(
  paymentId: string,
  amount: number,
  orderName: string,
  customerEmail?: string,
): Promise<{ ok: boolean; error?: string; clientOptions?: Record<string, any> }> {
  const enabled = await isFeatureEnabled('monetization.subscriptions')
  if (!enabled) {
    return { ok: false, error: '6개월 무료 운영 기간입니다. 결제 기능은 추후 활성화됩니다.' }
  }

  const adapter = getPgAdapter()
  if (!adapter.isConfigured) {
    return { ok: false, error: 'PG 미설정 — 환경변수 확인 필요' }
  }

  try {
    const result = await adapter.requestPayment({
      paymentId,
      amount,
      orderName,
      customerEmail,
    })
    return { ok: true, clientOptions: result.clientOptions }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'PG 호출 실패' }
  }
}

/**
 * 결제 성공 처리 (webhook 또는 verify 후 호출).
 *
 * - payments.status = 'succeeded'
 * - commission_splits.status = 'reserved' (월말 정산 대기)
 */
export async function markPaymentSucceeded(
  paymentId: string,
  pgPaymentId: string,
  pgMethod: string | null,
  receiptUrl: string | null,
  raw: any,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const now = new Date().toISOString()
  const { error: pErr } = await supabase
    .from('payments')
    .update({
      status: 'succeeded',
      pg_provider: 'portone',
      pg_payment_id: pgPaymentId,
      pg_method: pgMethod,
      pg_raw_response: raw,
      receipt_url: receiptUrl,
      paid_at: now,
    })
    .eq('id', paymentId)
  if (pErr) return { ok: false, error: pErr.message }

  // 분할 상태도 reserved 로 변경
  await supabase
    .from('commission_splits')
    .update({ status: 'reserved' })
    .eq('payment_id', paymentId)
    .eq('status', 'pending')

  return { ok: true }
}

/** 결제 실패 처리. */
export async function markPaymentFailed(
  paymentId: string,
  reason: string,
  raw?: any,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('payments')
    .update({
      status: 'failed',
      pg_raw_response: raw ?? null,
      memo: reason,
    })
    .eq('id', paymentId)
  return { ok: !error, error: error?.message }
}

/** 결제 환불. */
export async function refundPayment(
  paymentId: string,
  reason: string,
  partialAmount?: number,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: payment } = await supabase
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .maybeSingle()
  if (!payment) return { ok: false, error: '결제를 찾을 수 없습니다.' }
  if (payment.status !== 'succeeded') {
    return { ok: false, error: '환불 가능한 상태가 아닙니다.' }
  }

  const adapter = getPgAdapter()
  if (!adapter.isConfigured || !payment.pg_payment_id) {
    // PG 미설정 — DB 만 환불 처리
    await supabase
      .from('payments')
      .update({
        status: partialAmount ? 'partially_refunded' : 'refunded',
        refunded_at: new Date().toISOString(),
        memo: `[refund] ${reason}`,
      })
      .eq('id', paymentId)
    return { ok: true }
  }

  const result = await adapter.refundPayment({
    pgPaymentId: payment.pg_payment_id,
    amount: partialAmount,
    reason,
  })
  if (!result.ok) return { ok: false, error: result.errorMessage }

  await supabase
    .from('payments')
    .update({
      status: partialAmount ? 'partially_refunded' : 'refunded',
      refunded_at: new Date().toISOString(),
    })
    .eq('id', paymentId)

  // 분할도 환불 처리
  await supabase
    .from('commission_splits')
    .update({ status: 'refunded' })
    .eq('payment_id', paymentId)
    .neq('status', 'paid_out')

  return { ok: true }
}
