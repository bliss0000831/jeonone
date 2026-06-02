/**
 * 광장 협회 정산 서비스 — 월말 자동 일괄 정산.
 *
 * 동작:
 *   1. 매월 1일 (또는 N일) cron 이 generateMonthlyBatch() 호출
 *   2. 광장별 commission_splits (status='reserved') 합산 → payout 생성
 *   3. status='approved' 후 transferred (수동/자동 송금)
 *   4. payout 의 commission_splits.status = 'paid_out' 으로 일괄 마킹
 */
import { createClient } from '@/lib/supabase/server'
import { isFeatureEnabled } from './feature-flags'
import type { Payout, PayoutBatch, PlazaAssociation } from './types'

/**
 * 월말 정산 배치 생성 — 지정한 기간의 모든 광장 정산 데이터 집계.
 *
 * @param periodStart YYYY-MM-DD (포함)
 * @param periodEnd   YYYY-MM-DD (제외)
 * @param createdBy   슈퍼 어드민 user_id
 */
export async function generateMonthlyBatch(
  periodStart: string,
  periodEnd: string,
  createdBy?: string,
): Promise<{ ok: boolean; batch?: PayoutBatch; payouts?: Payout[]; error?: string }> {
  const enabled = await isFeatureEnabled('monetization.payouts')
  if (!enabled) {
    return { ok: false, error: '정산 기능 비활성화 (Feature Flag OFF)' }
  }

  const supabase = await createClient()

  // 배치 생성 (이미 있으면 재사용)
  const existing = await supabase
    .from('payout_batches')
    .select('*')
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .maybeSingle()

  let batch: PayoutBatch
  if (existing.data) {
    batch = existing.data as PayoutBatch
    if (batch.status === 'completed') {
      return { ok: false, error: '이미 완료된 정산 기간입니다.', batch }
    }
  } else {
    const { data, error } = await supabase
      .from('payout_batches')
      .insert({
        period_start: periodStart,
        period_end: periodEnd,
        status: 'processing',
        started_at: new Date().toISOString(),
        created_by: createdBy ?? null,
      })
      .select('*')
      .single()
    if (error || !data) return { ok: false, error: error?.message }
    batch = data as PayoutBatch
  }

  // 활성 광장 협회 모두 가져오기
  const { data: associations } = await supabase
    .from('plaza_associations')
    .select('*')
    .eq('status', 'active')

  const payouts: Payout[] = []
  let totalGross = 0
  let totalHq = 0
  let totalPlaza = 0

  for (const assoc of (associations ?? []) as PlazaAssociation[]) {
    // 해당 광장의 reserved splits 합계
    const { data: splits } = await supabase
      .from('commission_splits')
      .select('id, amount, recipient_type, payment_id, payments!inner(paid_at, plaza_id)')
      .eq('plaza_id', assoc.plaza_id)
      .eq('status', 'reserved')
      .gte('payments.paid_at', periodStart)
      .lt('payments.paid_at', periodEnd)

    const safeSplits = (splits ?? []) as Array<{
      id: string
      amount: number
      recipient_type: string
    }>

    const plazaAmount = safeSplits
      .filter((s) => s.recipient_type === 'plaza_association')
      .reduce((sum, s) => sum + Number(s.amount), 0)
    const hqAmount = safeSplits
      .filter((s) => s.recipient_type === 'hq')
      .reduce((sum, s) => sum + Number(s.amount), 0)
    const grossAmount = plazaAmount + hqAmount

    if (grossAmount === 0) continue

    const { data: payout } = await supabase
      .from('payouts')
      .insert({
        batch_id: batch.id,
        plaza_association_id: assoc.id,
        plaza_id: assoc.plaza_id,
        period_start: periodStart,
        period_end: periodEnd,
        gross_amount: grossAmount,
        hq_fee_amount: hqAmount,
        net_amount: plazaAmount,
        transfer_method: 'manual_bank',
        bank_name: assoc.bank_name,
        bank_account: assoc.bank_account,
        bank_holder: assoc.bank_holder,
        status: 'pending',
      })
      .select('*')
      .single()

    if (payout) {
      payouts.push(payout as Payout)
      totalGross += grossAmount
      totalHq += hqAmount
      totalPlaza += plazaAmount

      // 이 광장의 splits 들에 payout_id 연결
      const splitIds = safeSplits.map((s) => s.id)
      if (splitIds.length > 0) {
        await supabase
          .from('commission_splits')
          .update({ payout_id: payout.id })
          .in('id', splitIds)
      }
    }
  }

  // 배치 완료 정보 업데이트
  await supabase
    .from('payout_batches')
    .update({
      status: 'completed',
      total_gross_amount: totalGross,
      total_hq_amount: totalHq,
      total_plaza_amount: totalPlaza,
      plaza_count: payouts.length,
      completed_at: new Date().toISOString(),
    })
    .eq('id', batch.id)

  return { ok: true, batch, payouts }
}

/**
 * 정산 승인 (관리자) — pending → approved.
 * 실제 송금은 별도 (수동 계좌이체 또는 PG 정산 API).
 */
export async function approvePayout(
  payoutId: string,
  approverId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('payouts')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: approverId,
    })
    .eq('id', payoutId)
    .eq('status', 'pending')
  return { ok: !error, error: error?.message }
}

/**
 * 송금 완료 마킹 — approved → transferred.
 * commission_splits 도 paid_out 으로 일괄 변경.
 */
export async function markPayoutTransferred(
  payoutId: string,
  transferReference?: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('payouts')
    .update({
      status: 'transferred',
      transfer_reference: transferReference ?? null,
      transferred_at: now,
    })
    .eq('id', payoutId)
    .in('status', ['pending', 'approved'])

  if (error) return { ok: false, error: error.message }

  // 연결된 splits 들 paid_out
  await supabase
    .from('commission_splits')
    .update({ status: 'paid_out' })
    .eq('payout_id', payoutId)

  return { ok: true }
}

/** 광장별 정산 내역 조회 (광장 운영자 대시보드용). */
export async function listPayoutsForPlaza(plazaId: string): Promise<Payout[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('payouts')
    .select('*')
    .eq('plaza_id', plazaId)
    .order('period_end', { ascending: false })
  return (data ?? []) as Payout[]
}

/** 전체 정산 배치 목록 (슈퍼 어드민용). */
export async function listPayoutBatches(): Promise<PayoutBatch[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('payout_batches')
    .select('*')
    .order('period_end', { ascending: false })
  return (data ?? []) as PayoutBatch[]
}

/** 광장 협회 등록. */
export interface CreateAssociationInput {
  plazaId: string
  businessName: string
  businessNumber: string
  ceoName: string
  bankName: string
  bankAccount: string
  bankHolder: string
  contactEmail: string
  contactPhone?: string
  address?: string
  businessDocUrl?: string
  bankbookDocUrl?: string
  royaltyRate?: number
}

export async function createPlazaAssociation(
  input: CreateAssociationInput,
): Promise<{ ok: boolean; association?: PlazaAssociation; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('plaza_associations')
    .insert({
      plaza_id: input.plazaId,
      business_name: input.businessName,
      business_number: input.businessNumber,
      ceo_name: input.ceoName,
      bank_name: input.bankName,
      bank_account: input.bankAccount,
      bank_holder: input.bankHolder,
      contact_email: input.contactEmail,
      contact_phone: input.contactPhone ?? null,
      address: input.address ?? null,
      business_doc_url: input.businessDocUrl ?? null,
      bankbook_doc_url: input.bankbookDocUrl ?? null,
      royalty_rate: input.royaltyRate ?? 20,
      status: 'pending',
    })
    .select('*')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, association: data as PlazaAssociation }
}

/** 협회 승인 (슈퍼 어드민). */
export async function approveAssociation(
  associationId: string,
  approverId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('plaza_associations')
    .update({
      status: 'active',
      approved_at: new Date().toISOString(),
      approved_by: approverId,
    })
    .eq('id', associationId)
  return { ok: !error, error: error?.message }
}

/** 광장 ID 로 협회 조회. */
export async function getPlazaAssociation(
  plazaId: string,
): Promise<PlazaAssociation | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('plaza_associations')
    .select('*')
    .eq('plaza_id', plazaId)
    .maybeSingle()
  return (data ?? null) as PlazaAssociation | null
}
