/**
 * PG (Payment Gateway) 어댑터 인터페이스.
 *
 * 한국 결제 환경의 다양한 PG (포트원 v2, 토스페이먼츠, KG이니시스 등) 를
 * 동일한 인터페이스로 추상화한다.
 *
 * 설계 의도:
 * - Phase 1 (출시 ~ 광장 5개): 본사 일괄 결제 + 월말 송금 (모델 A)
 *   → adapter.supportsSplitPayout = false 로 동작
 * - Phase 2 (광장 5개+): PG 마켓플레이스 분할정산 (모델 B)
 *   → adapter.supportsSplitPayout = true, registerSubMerchant / requestSplitPayment 사용
 *
 * 코드 다른 부분은 어댑터의 인터페이스만 의존하므로,
 * Phase 전환 시 adapter 인스턴스만 교체하면 된다.
 */

export interface PaymentRequestOptions {
  /** 결제 ID — 우리 시스템의 payment.id (UUID) */
  paymentId: string
  /** 결제 금액 (원 단위) */
  amount: number
  /** 주문명 (예: "공인중개사 월정액 - 2026.06") */
  orderName: string
  /** 결제자 이메일 */
  customerEmail?: string
  /** 결제자 이름 */
  customerName?: string
  /** 결제 수단 강제 지정 (선택) */
  method?: 'card' | 'kakaopay' | 'naverpay' | 'tosspay' | 'phone' | 'auto'
  /** 정기결제 여부 — 빌링키 발급 후 자동 갱신 */
  isRecurring?: boolean
  /** 결제 완료 시 redirect 될 URL */
  successUrl?: string
  /** 결제 실패 시 redirect 될 URL */
  failUrl?: string
  /** 추가 메타데이터 (PG 측 customData) */
  customData?: Record<string, any>
}

export interface PaymentRequestResult {
  /** PG 측 결제 ID (포트원 paymentId) */
  pgPaymentId: string
  /** 결제창 URL — 사용자를 여기로 리다이렉트 */
  checkoutUrl: string | null
  /** 결제창을 클라이언트 SDK 로 띄울 경우의 옵션 */
  clientOptions?: Record<string, any>
}

export interface PaymentVerifyResult {
  ok: boolean
  status: 'paid' | 'failed' | 'canceled' | 'pending' | 'partial_refund' | 'refunded'
  pgPaymentId: string
  amount: number
  paidAt: string | null
  method: string | null
  receiptUrl: string | null
  raw: any
  errorMessage?: string
}

export interface BillingKeyIssueOptions {
  /** 우리 시스템의 사용자 ID */
  userId: string
  /** 결제자 이메일 */
  customerEmail?: string
  /** 결제자 이름 */
  customerName?: string
}

export interface BillingKeyIssueResult {
  ok: boolean
  billingKey: string | null
  errorMessage?: string
  raw: any
}

export interface BillingKeyChargeOptions {
  billingKey: string
  paymentId: string
  amount: number
  orderName: string
}

export interface RefundOptions {
  pgPaymentId: string
  amount?: number
  reason: string
}

export interface RefundResult {
  ok: boolean
  refundedAmount: number
  errorMessage?: string
  raw: any
}

/**
 * 광장 협회 = PG 서브 가맹점 등록 (모델 B 전용).
 */
export interface SubMerchantRegistration {
  associationId: string
  businessName: string
  businessNumber: string
  ceoName: string
  bankCode: string
  bankAccount: string
  bankHolder: string
  contactEmail: string
}

export interface SubMerchantResult {
  ok: boolean
  subMerchantId: string | null
  errorMessage?: string
  raw: any
}

/**
 * 분할 결제 요청 (모델 B 전용).
 */
export interface SplitPaymentRequest extends PaymentRequestOptions {
  splits: Array<{
    subMerchantId: string | null  // null = 본사
    amount: number
  }>
}

/**
 * PG 어댑터 통합 인터페이스.
 *
 * 모든 PG 구현체는 이 인터페이스를 따른다.
 * 메서드는 모두 비동기.
 */
export interface PgAdapter {
  /** 어댑터 식별자 ('portone' | 'toss' | 'mock') */
  readonly provider: 'portone' | 'toss' | 'mock'

  /** 분할정산 지원 여부 (Phase 2 시 true) */
  readonly supportsSplitPayout: boolean

  /** PG 활성 여부 — 환경변수 미설정 시 false */
  readonly isConfigured: boolean

  /** ----- 단건 결제 ----- */
  requestPayment(opts: PaymentRequestOptions): Promise<PaymentRequestResult>

  verifyPayment(pgPaymentId: string): Promise<PaymentVerifyResult>

  /** ----- 정기결제 (빌링키) ----- */
  issueBillingKey(opts: BillingKeyIssueOptions): Promise<BillingKeyIssueResult>

  chargeBillingKey(opts: BillingKeyChargeOptions): Promise<PaymentVerifyResult>

  /** ----- 환불 ----- */
  refundPayment(opts: RefundOptions): Promise<RefundResult>

  /** ----- 분할정산 (모델 B 전용, 미지원이면 throw) ----- */
  registerSubMerchant?(reg: SubMerchantRegistration): Promise<SubMerchantResult>

  requestSplitPayment?(req: SplitPaymentRequest): Promise<PaymentRequestResult>

  /** ----- Webhook 검증 ----- */
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean
}

export class UnsupportedPgOperationError extends Error {
  constructor(provider: string, operation: string) {
    super(`PG provider "${provider}" does not support operation "${operation}"`)
    this.name = 'UnsupportedPgOperationError'
  }
}
