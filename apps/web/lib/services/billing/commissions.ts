/**
 * 거래 수수료 서비스 — 공동구매 / 로컬푸드 / 서비스 매칭 거래의 수수료 계산 + 기록.
 *
 * 6개월 무료 운영 기간 동안에는:
 *   - 거래는 기록되지만 수수료 0 적용
 *   - Feature Flag 'monetization.commissions' = false 시
 *
 * 활성화 후:
 *   - commission_settings 의 rate_pct 적용
 *   - commission_splits 에 본사/광장 분할 기록
 */
import { createClient } from '@/lib/supabase/server'
import { isFeatureEnabled } from './feature-flags'
import type {
  CommissionSetting,
  Transaction,
  TransactionKind,
  TransactionStatus,
} from './types'

/** 카테고리별 수수료율 조회. */
export async function getCommissionRate(category: string): Promise<number> {
  const enabled = await isFeatureEnabled('monetization.commissions')
  if (!enabled) return 0  // 무료 운영 기간

  const supabase = await createClient()
  const { data } = await supabase
    .from('commission_settings')
    .select('rate_pct, is_active')
    .eq('category', category)
    .eq('is_active', true)
    .maybeSingle()
  return Number(data?.rate_pct ?? 0)
}

/** 모든 수수료 설정. */
export async function listCommissionSettings(): Promise<CommissionSetting[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('commission_settings')
    .select('*')
    .order('category')
  return (data ?? []) as CommissionSetting[]
}

export interface RecordTransactionInput {
  plazaId: string
  kind: TransactionKind
  buyerId?: string
  sellerId?: string
  referenceType?: string
  referenceId?: string
  grossAmount: number
}

export interface RecordTransactionResult {
  ok: boolean
  transaction?: Transaction
  error?: string
}

/**
 * 거래 기록 — 공구/로컬푸드/매칭 등 발생 시 호출.
 *
 * 수수료는 Feature Flag 에 따라 자동 0 또는 설정값.
 */
export async function recordTransaction(
  input: RecordTransactionInput,
): Promise<RecordTransactionResult> {
  const supabase = await createClient()

  // 수수료 카테고리 매핑
  const categoryByKind: Record<TransactionKind, string> = {
    group_buying: 'group_buying',
    local_food: 'local_food',
    service_match: 'service_match',
    secondhand_safe: 'group_buying',  // 추후 분리
  }
  const category = categoryByKind[input.kind]
  const rate = await getCommissionRate(category)

  const commissionAmount = Math.floor((input.grossAmount * rate) / 100)
  const netAmount = input.grossAmount - commissionAmount

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      plaza_id: input.plazaId,
      kind: input.kind,
      buyer_id: input.buyerId ?? null,
      seller_id: input.sellerId ?? null,
      reference_type: input.referenceType ?? null,
      reference_id: input.referenceId ?? null,
      gross_amount: input.grossAmount,
      commission_rate: rate,
      commission_amount: commissionAmount,
      net_amount: netAmount,
      status: 'pending',
    })
    .select('*')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, transaction: data as Transaction }
}

/** 거래 상태 변경. */
export async function updateTransactionStatus(
  transactionId: string,
  status: TransactionStatus,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const update: Record<string, any> = { status }
  if (status === 'completed') update.completed_at = new Date().toISOString()
  const { error } = await supabase
    .from('transactions')
    .update(update)
    .eq('id', transactionId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** 광장별 거래 수수료 합계 — 정산 배치에서 사용. */
export async function sumPlazaCommissions(
  plazaId: string,
  periodStart: string,
  periodEnd: string,
): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('transactions')
    .select('commission_amount')
    .eq('plaza_id', plazaId)
    .eq('status', 'completed')
    .gte('completed_at', periodStart)
    .lt('completed_at', periodEnd)
  return (data ?? []).reduce((sum, t: any) => sum + Number(t.commission_amount ?? 0), 0)
}
