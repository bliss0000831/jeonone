/**
 * 포트원 v2 PG 어댑터 (Stub).
 *
 * 6개월 무료 운영 기간 동안은 환경변수 미설정 → isConfigured = false.
 * 활성화 시점에:
 *   1. PG 사업자 가입 (포트원 → 토스/카카오 등)
 *   2. 발급받은 키를 .env / Vercel 환경변수에 입력:
 *        - PORTONE_STORE_ID
 *        - PORTONE_API_SECRET
 *        - PORTONE_CHANNEL_KEY
 *        - PORTONE_WEBHOOK_SECRET
 *        - NEXT_PUBLIC_PORTONE_STORE_ID
 *   3. SDK 설치: pnpm add @portone/server-sdk @portone/browser-sdk
 *   4. 이 파일의 TODO 부분 (실제 SDK 호출) 채우기 — 약 1~2시간 작업
 *   5. Feature Flag 'monetization.subscriptions' 등 ON
 *
 * 현재 동작 — 모든 메서드가 isConfigured 체크 후 mock 응답을 반환하므로,
 * 빌드는 통과하고 호출 시 안전하게 "not configured" 에러를 던진다.
 */
import crypto from 'node:crypto'
import type {
  PgAdapter,
  PaymentRequestOptions,
  PaymentRequestResult,
  PaymentVerifyResult,
  BillingKeyIssueOptions,
  BillingKeyIssueResult,
  BillingKeyChargeOptions,
  RefundOptions,
  RefundResult,
  SubMerchantRegistration,
  SubMerchantResult,
  SplitPaymentRequest,
} from './adapter'
import { UnsupportedPgOperationError } from './adapter'

const STORE_ID = process.env.PORTONE_STORE_ID
const API_SECRET = process.env.PORTONE_API_SECRET
const CHANNEL_KEY = process.env.PORTONE_CHANNEL_KEY
const WEBHOOK_SECRET = process.env.PORTONE_WEBHOOK_SECRET

class NotConfiguredError extends Error {
  constructor(op: string) {
    super(
      `PortOne not configured (missing PORTONE_STORE_ID / PORTONE_API_SECRET). ` +
        `Cannot call ${op}. 활성화 절차는 lib/integrations/pg/portone.ts 파일 상단 주석 참고.`,
    )
    this.name = 'PortOneNotConfiguredError'
  }
}

export class PortOnePgAdapter implements PgAdapter {
  readonly provider = 'portone' as const
  readonly supportsSplitPayout = false  // Phase 2 시 true 로 변경

  get isConfigured(): boolean {
    return Boolean(STORE_ID && API_SECRET && CHANNEL_KEY)
  }

  private requireConfig(op: string) {
    if (!this.isConfigured) throw new NotConfiguredError(op)
  }

  // ============================================================================
  // 단건 결제
  // ============================================================================
  async requestPayment(opts: PaymentRequestOptions): Promise<PaymentRequestResult> {
    this.requireConfig('requestPayment')
    // TODO (활성화 시 구현):
    //   import PortOne from '@portone/browser-sdk'
    //   클라이언트 SDK 가 직접 결제창을 띄우므로, 서버에선
    //   결제 요청 정보 (storeId, channelKey, amount, paymentId 등) 만 응답.
    //   클라이언트는 그 정보를 받아 PortOne.requestPayment({...}) 호출.
    return {
      pgPaymentId: opts.paymentId,
      checkoutUrl: null,
      clientOptions: {
        storeId: STORE_ID,
        channelKey: CHANNEL_KEY,
        paymentId: opts.paymentId,
        orderName: opts.orderName,
        totalAmount: opts.amount,
        currency: 'KRW',
        payMethod: opts.method ?? 'CARD',
        customer: {
          customerId: opts.customerEmail,
          email: opts.customerEmail,
          fullName: opts.customerName,
        },
        redirectUrl: opts.successUrl,
        customData: opts.customData,
      },
    }
  }

  async verifyPayment(pgPaymentId: string): Promise<PaymentVerifyResult> {
    this.requireConfig('verifyPayment')
    // TODO: 활성화 시 구현
    //   import { PortOneServer } from '@portone/server-sdk'
    //   const client = PortOneServer({ secret: API_SECRET })
    //   const payment = await client.payment.getPayment({ paymentId: pgPaymentId })
    //   return mapped result
    return {
      ok: false,
      status: 'pending',
      pgPaymentId,
      amount: 0,
      paidAt: null,
      method: null,
      receiptUrl: null,
      raw: null,
      errorMessage: 'Not implemented (PortOne adapter is stub)',
    }
  }

  // ============================================================================
  // 빌링키 (정기결제)
  // ============================================================================
  async issueBillingKey(opts: BillingKeyIssueOptions): Promise<BillingKeyIssueResult> {
    this.requireConfig('issueBillingKey')
    // TODO: PortOne.requestIssueBillingKey() — 클라이언트 SDK
    return {
      ok: false,
      billingKey: null,
      raw: null,
      errorMessage: 'Not implemented (PortOne adapter is stub)',
    }
  }

  async chargeBillingKey(opts: BillingKeyChargeOptions): Promise<PaymentVerifyResult> {
    this.requireConfig('chargeBillingKey')
    // TODO: 서버에서 PortOne payment.payWithBillingKey
    return {
      ok: false,
      status: 'pending',
      pgPaymentId: opts.paymentId,
      amount: opts.amount,
      paidAt: null,
      method: null,
      receiptUrl: null,
      raw: null,
      errorMessage: 'Not implemented (PortOne adapter is stub)',
    }
  }

  // ============================================================================
  // 환불
  // ============================================================================
  async refundPayment(opts: RefundOptions): Promise<RefundResult> {
    this.requireConfig('refundPayment')
    // TODO: PortOne payment.cancel
    return {
      ok: false,
      refundedAmount: 0,
      raw: null,
      errorMessage: 'Not implemented (PortOne adapter is stub)',
    }
  }

  // ============================================================================
  // 분할정산 (Phase 2 활성화 시)
  // ============================================================================
  async registerSubMerchant(reg: SubMerchantRegistration): Promise<SubMerchantResult> {
    throw new UnsupportedPgOperationError('portone', 'registerSubMerchant (Phase 2)')
  }

  async requestSplitPayment(req: SplitPaymentRequest): Promise<PaymentRequestResult> {
    throw new UnsupportedPgOperationError('portone', 'requestSplitPayment (Phase 2)')
  }

  // ============================================================================
  // Webhook 검증
  // ============================================================================
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
    if (!WEBHOOK_SECRET || !signature) return false
    try {
      // 포트원 웹훅: HMAC-SHA256(rawBody, WEBHOOK_SECRET) → hex
      // 헤더에 "sha256=<hex>" 또는 raw hex 둘 다 허용.
      const expectedHex = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(rawBody, 'utf8')
        .digest('hex')

      const provided = signature.startsWith('sha256=')
        ? signature.slice('sha256='.length)
        : signature

      const a = Buffer.from(expectedHex, 'hex')
      const b = Buffer.from(provided, 'hex')
      if (a.length !== b.length || a.length === 0) return false
      return crypto.timingSafeEqual(a, b)
    } catch {
      return false
    }
  }
}
