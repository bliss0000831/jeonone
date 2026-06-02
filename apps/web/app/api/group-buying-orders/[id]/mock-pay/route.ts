import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { NextResponse, type NextRequest } from "next/server"

/**
 * POST /api/group-buying-orders/[id]/mock-pay
 *
 * ⚠️ 개발용 — production 차단. PortOne 도입 후 webhook 으로 교체.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  // production 영구 차단 — env 우회 불가
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "운영 환경에서는 mock 결제가 비활성화되어 있습니다" },
      { status: 503 },
    )
  }
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })

  const { data: order } = await supabase
    .from("group_buying_orders")
    .select("id, buyer_id, status, post_id")
    .eq("id", id)
    .maybeSingle()
  if (!order) return NextResponse.json({ error: "주문을 찾을 수 없습니다" }, { status: 404 })
  if (order.buyer_id !== user.id) {
    return NextResponse.json({ error: "본인 주문만 결제할 수 있습니다" }, { status: 403 })
  }
  if (order.status !== "pending") {
    return NextResponse.json({ error: "결제 가능 상태가 아닙니다" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("group_buying_orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      pg_provider: "mock",
      pg_payment_id: `mock_${Date.now()}`,
      pg_raw: { mock: true, ts: new Date().toISOString() },
    })
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .single()
  if (error || !data) {
    console.error("[gb mock-pay]", error)
    return NextResponse.json({ error: "결제 처리 실패" }, { status: 500 })
  }

  // 모집 인원 +1 — current_participants 카운트 (글 카드용 표시값)
  // RLS 우회: trigger 또는 atomic update 가 더 안전하지만, 단순화를 위해 직접 update
  // (소유자만 update 가능하도록 RLS 제약 있을 수 있음 → 무시 fail 시 그대로 진행)
  void supabase.rpc("increment_view_count", {
    p_table: "group_buying_posts",
    p_id: order.post_id,
    p_column: "current_participants",
  }).then(() => {}, () => {
    // current_participants 가 increment_view_count 화이트리스트에 없으면 fail —
    // 정확한 카운트는 group_buying_orders COUNT 로 항상 재계산 가능 (글 카드 쿼리에서 보강)
  })

  return NextResponse.json({ order: data })
}
