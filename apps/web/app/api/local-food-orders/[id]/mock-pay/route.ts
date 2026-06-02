import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { NextResponse, type NextRequest } from "next/server"

/**
 * POST /api/local-food-orders/[id]/mock-pay
 *
 * ⚠️ 개발용 mock 결제 — 사업자 등록·PortOne 연동 전 흐름 검증용.
 *
 * 운영 전환 시 작업:
 *   1. 이 라우트 삭제 (또는 development 환경에서만 동작하도록 가드)
 *   2. 새 라우트 /api/payments/portone/webhook 추가 (PortOne 웹훅 수신)
 *   3. 클라이언트는 PortOne SDK 결제창 호출 → 결제 성공 시 webhook 이 status='paid' 로 전환
 *   4. order 의 pg_payment_id, pg_raw, paid_at 채워줌
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // 안전장치 — production 에서는 env 무관 영구 차단.
  //   기존엔 ALLOW_MOCK_PAYMENT=1 로 우회 가능했으나, env 한 줄로 무료 결제 우회되는
  //   리스크가 너무 커서 production 빌드 자체에서 거부.
  //   dev/preview 에서만 mock 결제 허용 — 그 환경에서는 ALLOW_MOCK_PAYMENT 분기 의미 없음
  //   (기본 허용).
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "운영 환경에서는 mock 결제가 비활성화되어 있습니다. PortOne 연동 후 실 결제만 가능합니다." },
      { status: 503 },
    )
  }

  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })

  // 본인 주문 + pending 상태만 결제 가능
  const { data: order } = await supabase
    .from("local_food_orders")
    .select("id, buyer_id, status, amount")
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
    .from("local_food_orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      pg_provider: "mock",
      pg_payment_id: `mock_${Date.now()}`,
      pg_raw: { mock: true, ts: new Date().toISOString() },
    })
    .eq("id", id)
    .eq("status", "pending")            // 동시성 가드
    .select()
    .single()

  if (error || !data) {
    console.error("[mock-pay]", error)
    return NextResponse.json({ error: "결제 처리 실패" }, { status: 500 })
  }
  return NextResponse.json({ order: data })
}
