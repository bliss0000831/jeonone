/**
 * Billing 도메인 공통 타입.
 *
 * DB 테이블 (subscription_plans, subscriptions, payments, ...) 와 1:1 대응되며,
 * 서비스 레이어 / API / UI 가 모두 이 타입을 import 해서 사용한다.
 */

export type SubscriptionPlanCategory = 'realtor' | 'service' | 'newstore' | 'other'

export interface SubscriptionPlan {
  id: string
  name: string
  category: SubscriptionPlanCategory
  monthly_price: number
  early_bird_discount_pct: number
  description: string | null
  is_active: boolean
  created_at: string
}

export type SubscriptionStatus =
  | 'pending'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired'
  | 'free_period'

export interface Subscription {
  id: string
  user_id: string
  plaza_id: string
  plan_id: string
  status: SubscriptionStatus
  current_period_start: string
  current_period_end: string
  is_early_bird: boolean
  applied_discount_pct: number
  billing_key: string | null
  billing_key_provider: 'portone' | 'toss' | null
  canceled_at: string | null
  cancel_reason: string | null
  created_at: string
  updated_at: string
}

export type PaymentKind =
  | 'subscription'
  | 'boost'
  | 'push_credit'
  | 'ad_banner'
  | 'commission_payout'
  | 'manual'

export type PaymentStatus =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'refunded'
  | 'partially_refunded'

export interface Payment {
  id: string
  user_id: string | null
  plaza_id: string
  kind: PaymentKind
  reference_type: string | null
  reference_id: string | null
  amount: number
  vat_amount: number
  status: PaymentStatus
  pg_provider: 'portone' | 'toss' | null
  pg_payment_id: string | null
  pg_method: string | null
  pg_raw_response: any
  receipt_url: string | null
  memo: string | null
  paid_at: string | null
  refunded_at: string | null
  created_at: string
  updated_at: string
}

export type CommissionRecipientType = 'hq' | 'plaza_association' | 'merchant'
export type CommissionStatus = 'pending' | 'reserved' | 'paid_out' | 'refunded'

export interface CommissionSplit {
  id: string
  payment_id: string
  recipient_type: CommissionRecipientType
  recipient_id: string | null
  plaza_id: string | null
  amount: number
  rate_pct: number | null
  status: CommissionStatus
  payout_id: string | null
  created_at: string
  updated_at: string
}

export type TransactionKind =
  | 'group_buying'
  | 'local_food'
  | 'service_match'
  | 'secondhand_safe'

export type TransactionStatus =
  | 'pending'
  | 'completed'
  | 'canceled'
  | 'refunded'
  | 'disputed'

export interface Transaction {
  id: string
  plaza_id: string
  kind: TransactionKind
  buyer_id: string | null
  seller_id: string | null
  reference_type: string | null
  reference_id: string | null
  gross_amount: number
  commission_rate: number
  commission_amount: number
  net_amount: number
  status: TransactionStatus
  payment_id: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface CommissionSetting {
  category: string
  rate_pct: number
  description: string | null
  is_active: boolean
  updated_at: string
}

export interface PlazaAssociation {
  id: string
  plaza_id: string
  business_name: string
  business_number: string
  ceo_name: string
  bank_name: string
  bank_account: string
  bank_holder: string
  contact_email: string
  contact_phone: string | null
  address: string | null
  business_doc_url: string | null
  bankbook_doc_url: string | null
  status: 'pending' | 'active' | 'suspended' | 'terminated'
  royalty_rate: number
  notes: string | null
  created_at: string
  approved_at: string | null
  approved_by: string | null
}

export type PayoutTransferMethod = 'manual_bank' | 'pg_split' | 'pg_payout' | 'offset'
export type PayoutStatus =
  | 'pending'
  | 'approved'
  | 'transferred'
  | 'failed'
  | 'disputed'
  | 'refunded'

export interface Payout {
  id: string
  batch_id: string | null
  plaza_association_id: string
  plaza_id: string
  period_start: string
  period_end: string
  gross_amount: number
  hq_fee_amount: number
  net_amount: number
  transfer_method: PayoutTransferMethod
  transfer_reference: string | null
  bank_name: string | null
  bank_account: string | null
  bank_holder: string | null
  status: PayoutStatus
  tax_invoice_issued: boolean
  tax_invoice_url: string | null
  approved_at: string | null
  approved_by: string | null
  transferred_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PayoutBatch {
  id: string
  period_start: string
  period_end: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'partial'
  total_gross_amount: number
  total_hq_amount: number
  total_plaza_amount: number
  plaza_count: number
  notes: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  created_by: string | null
}

export interface FeatureFlag {
  key: string
  enabled: boolean
  description: string | null
  updated_at: string
  updated_by: string | null
}

/** Feature Flag 키 — 코드 전역에서 자동완성을 위해 union 으로 고정. */
export type FeatureFlagKey =
  | 'monetization.subscriptions'
  | 'monetization.commissions'
  | 'monetization.boost'
  | 'monetization.push_credits'
  | 'monetization.banner_ads'
  | 'monetization.payouts'
  | 'monetization.ai_pricing_paid'
  | 'monetization.points'
