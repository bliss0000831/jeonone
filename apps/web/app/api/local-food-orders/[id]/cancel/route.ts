import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { NextResponse, type NextRequest } from "next/server"
import { enforceRateLimit } from '@/lib/services/ratelimit'
import { banGuardResponse } from "@/lib/services/user-ban-guard"

/**
 * POST /api/local-food-orders/[id]/cancel
 *   구매자 — 결제 전(pending) 주문 취소
 *   결제 후 환불은 별도 /refund 라우트 (추후)
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
      console.error("[local-food-orders cancel] admin client unavailable", e)
    }
  }

  const plaza = await getCurrentPlaza()

  let q = supabase
    .from("local_food_orders")
    .select("buyer_id, status, points_used, points_tx_id")
    .eq("id", id)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data: order } = await q.maybeSingle()

  if (!order) return NextResponse.json({ error: "주문을 찾을 수 없습니다" }, { status: 404 })
  if (order.buyer_id !== user.id) {
    return NextResponse.json({ error: "구매자만 취소할 수 있습니다" }, { status: 403 })
  }
  if (order.status !== "pending") {
    return NextResponse.json(
      { error: "결제 완료된 주문은 환불 신청을 이용해주세요" },
      { status: 400 },
    )
  }

  const { data, error } = await writer
    .from("local_food_orders")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .single()

  if (error || !data) {
    return NextResponse.json({ error: "처리 실패" }, { status: 500 })
  }

  // 사용 포인트 환원 — 멱등 (이미 reverted 면 no-op)
  if (order.points_tx_id) {
    await supabase.rpc("points_refund_spend", {
      p_tx_id: order.points_tx_id,
      p_reason: "주문 취소(pending)",
    })
  }

  return NextResponse.json({ order: data })
}
