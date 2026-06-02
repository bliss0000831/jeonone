import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { NextResponse, type NextRequest } from "next/server"
import { enforceRateLimit } from '@/lib/services/ratelimit'
import { banGuardResponse } from "@/lib/services/user-ban-guard"

/**
 * POST /api/group-buying-orders/[id]/cancel
 *   결제 전(pending) 또는 결제 직후(paid) 자기 의사로 취소.
 *   결제 후 취소면 status='refunded' (실 환불은 PortOne 도입 후 cancel API).
 *   모집 성공(group_confirmed) 후엔 일방 취소 불가 — refund 라우트로.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { user, tokenSource } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })

  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  // Bearer 토큰(모바일) → RLS 차단 → admin client 우회
  let writer: any = supabase
  if (tokenSource === "bearer") {
    try { writer = createAdminClient() } catch (e) {
      console.error("[group-buying-orders cancel] admin client unavailable", e)
    }
  }

  const plaza = await getCurrentPlaza()

  let q = supabase
    .from("group_buying_orders")
    .select("buyer_id, status, post_id, points_used, points_tx_id")
    .eq("id", id)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data: order } = await q.maybeSingle()
  if (!order) return NextResponse.json({ error: "주문을 찾을 수 없습니다" }, { status: 404 })
  if (order.buyer_id !== user.id) {
    return NextResponse.json({ error: "구매자만 취소할 수 있습니다" }, { status: 403 })
  }

  if (order.status === "pending") {
    const { error } = await writer
      .from("group_buying_orders")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending")
    if (error) return NextResponse.json({ error: "처리 실패" }, { status: 500 })
    // pending 에서 points_tx_id 가 있다면(예약만 된 경우) 환원
    if (order.points_tx_id) {
      await writer.rpc("points_refund_spend", {
        p_tx_id: order.points_tx_id,
        p_reason: "주문 취소(pending)",
      })
    }
    return NextResponse.json({ ok: true })
  }

  if (order.status === "paid") {
    // 모집중 결제 취소 → 환불 (mock — 실 PortOne 도입 후 cancel API 호출)
    const { error } = await writer
      .from("group_buying_orders")
      .update({
        status: "refunded",
        refunded_at: new Date().toISOString(),
        refund_reason: "구매자 취소",
      })
      .eq("id", id)
      .eq("status", "paid")
    if (error) return NextResponse.json({ error: "처리 실패" }, { status: 500 })
    // 사용 포인트 환원 (멱등 — 이미 reverted 면 no-op)
    if (order.points_tx_id) {
      await writer.rpc("points_refund_spend", {
        p_tx_id: order.points_tx_id,
        p_reason: "주문 환불(구매자 취소)",
      })
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json(
    { error: "이 상태에서는 취소할 수 없습니다" },
    { status: 400 },
  )
}
