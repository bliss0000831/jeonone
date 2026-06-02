import { NextResponse } from 'next/server'
import { getPgAdapter } from '@/lib/integrations/pg'
import { markPaymentSucceeded, markPaymentFailed } from '@/lib/services/billing'

export const dynamic = 'force-dynamic'

/**
 * POST /api/billing/webhook/portone — 포트원 webhook 수신.
 *
 * 포트원이 결제 완료/실패/환불 시 호출.
 * 6개월 무료 운영 기간 동안에는 PG 미설정 → 호출되지 않음.
 *
 * 활성화 후 본인이 해야 할 일:
 *   1. 포트원 콘솔에서 webhook URL 등록: https://gwangjang.app/api/billing/webhook/portone
 *   2. 환경변수 PORTONE_WEBHOOK_SECRET 설정
 *   3. (필요 시) 본 파일의 verify 로직 보강
 */
export async function POST(request: Request) {
  const adapter = getPgAdapter()
  const rawBody = await request.text()
  const signature = request.headers.get('webhook-signature')

  // Webhook 서명 검증
  if (!adapter.verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const paymentId: string | undefined = body?.data?.paymentId
  const status: string | undefined = body?.type  // 'Transaction.Paid' | 'Transaction.Failed' | ...

  if (!paymentId || !status) {
    return NextResponse.json({ error: 'missing paymentId or type' }, { status: 400 })
  }

  // 결제 상태 검증 (PG 측에서 다시 조회해서 신뢰)
  const verify = await adapter.verifyPayment(paymentId)
  if (!verify.ok) {
    return NextResponse.json({ error: verify.errorMessage ?? 'verify failed' }, { status: 400 })
  }

  if (verify.status === 'paid') {
    await markPaymentSucceeded(
      paymentId,
      verify.pgPaymentId,
      verify.method,
      verify.receiptUrl,
      verify.raw,
    )
  } else if (verify.status === 'failed' || verify.status === 'canceled') {
    await markPaymentFailed(paymentId, verify.errorMessage ?? verify.status, verify.raw)
  }

  return NextResponse.json({ ok: true })
}
