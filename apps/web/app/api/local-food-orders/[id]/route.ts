import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { NextResponse, type NextRequest } from "next/server"

/**
 * GET /api/local-food-orders/[id]
 *   주문 상세 — 본인이 구매자/판매자인 경우만 (RLS 가 보장)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })

  const { data, error } = await supabase
    .from("local_food_orders")
    .select("*, items:local_food_order_items(*)")
    .eq("id", id)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다" }, { status: 404 })
  }
  return NextResponse.json({ order: data })
}
