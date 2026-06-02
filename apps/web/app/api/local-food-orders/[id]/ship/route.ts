import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { NextResponse, type NextRequest } from "next/server"
import { enforceRateLimit } from '@/lib/services/ratelimit'
import { banGuardResponse } from "@/lib/services/user-ban-guard"

/**
 * PATCH /api/local-food-orders/[id]/ship
 *   판매자 — 운송장 등록 → status='shipped'
 *   body: { tracking_company, tracking_number }
 */
export async function PATCH(
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
      console.error("[local-food-orders ship] admin client unavailable", e)
    }
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 })

  const tracking_company = (body.tracking_company || "").toString().slice(0, 50)
  const tracking_number = (body.tracking_number || "").toString().replace(/\s+/g, "").slice(0, 50)

  if (!tracking_company || !tracking_number) {
    return NextResponse.json({ error: "택배사·운송장번호 모두 입력해주세요" }, { status: 400 })
  }

  const plaza = await getCurrentPlaza()

  // 판매자 본인 + paid 상태만 발송 처리
  let q = supabase
    .from("local_food_orders")
    .select("seller_id, status")
    .eq("id", id)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data: order } = await q.maybeSingle()
  if (!order) return NextResponse.json({ error: "주문을 찾을 수 없습니다" }, { status: 404 })
  if (order.seller_id !== user.id) {
    return NextResponse.json({ error: "판매자만 발송 처리할 수 있습니다" }, { status: 403 })
  }
  if (order.status !== "paid") {
    return NextResponse.json({ error: "결제 완료 상태에서만 발송 가능합니다" }, { status: 400 })
  }

  const { data, error } = await writer
    .from("local_food_orders")
    .update({
      status: "shipped",
      tracking_company,
      tracking_number,
      shipped_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "paid")
    .select()
    .single()

  if (error || !data) {
    console.error("[ship]", error)
    return NextResponse.json({ error: "처리 실패" }, { status: 500 })
  }
  return NextResponse.json({ order: data })
}
