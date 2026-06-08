import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { NextResponse, type NextRequest } from "next/server"
import { enforceRateLimit } from '@/lib/services/ratelimit'

/**
 * POST /api/local-food-orders/[id]/refund
 *   구매자 — 환불 요청 (paid/shipped/delivered 상태에서)
 *   판매자/관리자가 승인하면 status='refunded' 로 전환 (별도 라우트 추후)
 *
 *   PG 결제 취소 연동 (PortOne v2 API):
 *     - payment_id 가 있는 주문은 PortOne 취소 API 호출
 *     - 무료 기간 / 미결제 주문은 즉시 상태 변경만
 *     - 분쟁 케이스는 super-admin 중재
 */

/**
 * PortOne 결제 취소 호출 (PG 연동 시 활성화).
 * 환경변수 PORTONE_API_SECRET 이 없으면 skip (무료 운영 기간).
 * @returns { cancelled: boolean, error?: string }
 */
async function requestPortOneCancel(paymentId: string, reason: string): Promise<{ cancelled: boolean; error?: string }> {
  const secret = process.env.PORTONE_API_SECRET
  if (!secret || !paymentId) {
    // PG 미연동 / 무료 기간 — 결제 취소 없이 상태만 변경
    return { cancelled: false }
  }
  // S5: URL-safe 검증 — path traversal / query injection 방지
  if (!/^[a-zA-Z0-9_-]+$/.test(paymentId)) {
    console.error(`[refund] Invalid paymentId format: ${paymentId}`)
    return { cancelled: false, error: '유효하지 않은 결제 ID' }
  }
  try {
    const res = await fetch(`https://api.portone.io/payments/${paymentId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `PortOne ${secret}`,
      },
      body: JSON.stringify({ reason }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error('[refund] PortOne cancel failed:', res.status, body)
      return { cancelled: false, error: body?.message || `PG 취소 실패 (${res.status})` }
    }
    return { cancelled: true }
  } catch (e: any) {
    console.error('[refund] PortOne cancel error:', e)
    return { cancelled: false, error: e?.message || 'PG 통신 오류' }
  }
}
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })

  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  const body = await request.json().catch(() => ({}))
  const reason = (body?.reason || "").toString().slice(0, 500)
  if (!reason) {
    return NextResponse.json({ error: "환불 사유를 입력해주세요" }, { status: 400 })
  }

  const plaza = await getCurrentPlaza()

  let q = supabase
    .from("local_food_orders")
    .select("buyer_id, seller_id, status, buyer_memo, amount, points_used, points_tx_id")
    .eq("id", id)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data: order } = await q.maybeSingle()

  if (!order) return NextResponse.json({ error: "주문을 찾을 수 없습니다" }, { status: 404 })
  if (order.buyer_id !== user.id) {
    return NextResponse.json({ error: "구매자만 환불 신청할 수 있습니다" }, { status: 403 })
  }
  if (!["paid", "shipped", "delivered"].includes(order.status)) {
    return NextResponse.json({ error: "환불 가능 상태가 아닙니다" }, { status: 400 })
  }

  // PG 결제 취소 시도 (payment_id 가 있는 경우만)
  // payment_id 컬럼은 DB 타입에 아직 없을 수 있으므로 별도 안전 조회
  let paymentId: string | null = null
  try {
    const { data: pidRow } = await (supabase as any)
      .from('local_food_orders')
      .select('payment_id')
      .eq('id', id)
      .maybeSingle()
    paymentId = pidRow?.payment_id ?? null
  } catch { /* 컬럼 미존재 시 무시 */ }

  let pgCancelled = false
  if (paymentId) {
    const pgResult = await requestPortOneCancel(paymentId, reason)
    if (pgResult.error) {
      // PG 취소 실패 — 환불 요청 상태로만 전환 (관리자가 수동 처리)
      console.warn(`[refund] PG cancel failed for order ${id}:`, pgResult.error)
    }
    pgCancelled = pgResult.cancelled
  }

  const memo = order.buyer_memo
    ? `${order.buyer_memo}\n\n[환불사유] ${reason}`
    : `[환불사유] ${reason}`

  const { data, error } = await supabase
    .from("local_food_orders")
    .update({
      status: pgCancelled ? "refunded" : "refund_requested",
      refund_requested_at: new Date().toISOString(),
      ...(pgCancelled ? { refunded_at: new Date().toISOString() } : {}),
      buyer_memo: memo,
    })
    .eq("id", id)
    .in("status", ["paid", "shipped", "delivered"])
    .select()
    .single()

  if (error || !data) {
    // L1: PG 취소 성공 후 DB 업데이트 실패 → 금전 불일치 경고 로깅
    if (pgCancelled) {
      console.error(`[refund] CRITICAL: PG cancel succeeded but DB update failed for order ${id}. Payment ${paymentId} was cancelled at PG but status not updated. Manual reconciliation required.`, error)
    }
    return NextResponse.json({
      error: "처리 실패",
      ...(pgCancelled ? { warning: "PG 취소는 완료됐으나 DB 반영 실패. 관리자에게 문의하세요." } : {}),
    }, { status: 500 })
  }

  // 사용 포인트 환원 — 실제 환불 완료(status='refunded') 시에만.
  //   cancel 라우트와 동일한 패턴: points_used > 0 이고 points_tx_id 가 있으면
  //   points_refund_spend RPC 로 환원. 이미 reverted 된 tx 면 RPC 가 no-op → 중복 안전.
  //   service_role(admin) 클라이언트로 호출.
  if (pgCancelled && order.points_used > 0 && order.points_tx_id) {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin")
      const admin = createAdminClient()
      await admin.rpc("points_refund_spend", {
        p_tx_id: order.points_tx_id,
        p_reason: "주문 환불",
      })
    } catch (refundErr) {
      // 포인트 환원 실패는 치명적 — 수동 정산 필요. 단 PG/DB 는 이미 처리됨.
      console.error(`[refund] CRITICAL: points_refund_spend failed for order ${id}, tx ${order.points_tx_id}. Manual reconciliation required.`, refundErr)
    }
  }

  // 판매자에게 환불 요청 알림 (비동기, non-fatal)
  if (order.seller_id) {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin")
      const { notify } = await import("@/lib/services/notifications")
      const admin = createAdminClient()
      await notify(admin, {
        user_id: order.seller_id,
        type: "system",
        title: pgCancelled ? "환불 완료" : "환불 요청",
        message: pgCancelled
          ? `주문 환불이 PG사를 통해 처리되었습니다. 사유: ${reason.slice(0, 50)}`
          : `구매자가 환불을 요청했습니다. 사유: ${reason.slice(0, 50)}`,
        link: `/local-food/orders/${id}`,
      }, user.id)
    } catch (notifyErr) {
      console.error("[refund] notify seller failed (non-fatal):", notifyErr)
    }
  }

  return NextResponse.json({ order: data, pgCancelled })
}
