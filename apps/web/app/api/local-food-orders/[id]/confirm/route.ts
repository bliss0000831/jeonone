import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { createClient as createAdmin } from "@supabase/supabase-js"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { NextResponse, type NextRequest } from "next/server"
import { enforceRateLimit } from '@/lib/services/ratelimit'
import { banGuardResponse } from "@/lib/services/user-ban-guard"

/**
 * POST /api/local-food-orders/[id]/confirm
 *   구매자 — 구매확정 → status='confirmed' → (정산 큐 트리거 + 포인트 적립)
 *
 *   ⚠️ 운영 전환 시:
 *     1. 정산 큐에 작업 추가 (PortOne escrow 해제 + 생산자 계좌 송금)
 *     2. 구매자에게 영수증 메일/알림 발송
 *
 *  Race safety (포인트 적립):
 *    1. point_transactions 에 UNIQUE(source, source_id) WHERE type='earn' 인덱스
 *       → 같은 주문 두 번 적립 시 두 번째는 23505 로 실패. silent skip.
 *    2. user_points 잔액 갱신은 grant_points_atomic RPC (INSERT … ON CONFLICT)
 *       → select-then-update race condition 차단.
 */

// 결제 금액 대비 적립률 (1pt = 1원). 운영 정책 변경 시 여기만 수정.
const LOCAL_FOOD_REWARD_PCT = 0.01    // 1%

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
      console.error("[local-food-orders confirm] admin client unavailable", e)
    }
  }

  const plaza = await getCurrentPlaza()

  // 구매자 본인 + shipped/delivered 상태만 확정 가능
  let q = supabase
    .from("local_food_orders")
    .select("buyer_id, status, plaza_id, amount, points_used")
    .eq("id", id)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data: order } = await q.maybeSingle()

  if (!order) return NextResponse.json({ error: "주문을 찾을 수 없습니다" }, { status: 404 })
  if (order.buyer_id !== user.id) {
    return NextResponse.json({ error: "구매자만 확정할 수 있습니다" }, { status: 403 })
  }
  if (!["shipped", "delivered"].includes(order.status)) {
    return NextResponse.json({ error: "배송 상태에서만 구매확정 가능합니다" }, { status: 400 })
  }

  const { data, error } = await writer
    .from("local_food_orders")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .in("status", ["shipped", "delivered"])
    .select()
    .single()

  if (error || !data) {
    console.error("[confirm]", error)
    return NextResponse.json({ error: "처리 실패" }, { status: 500 })
  }

  // ───── 포인트 적립 ─────────────────────────────────────────────────────
  // 적립 기준: 실 결제액 (amount - points_used). 포인트로만 결제한 부분은 적립 X.
  // 멱등성: UNIQUE(source, source_id) WHERE type='earn' 인덱스로 DB 가 보장.
  //         두 번째 요청은 23505 unique_violation → silent skip.
  try {
    const paidCash = Math.max(0, (order.amount || 0) - (order.points_used || 0))
    const reward = Math.floor(paidCash * LOCAL_FOOD_REWARD_PCT)

    if (reward > 0) {
      const serviceKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY
      const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
      if (serviceKey && supaUrl) {
        const admin = createAdmin(supaUrl, serviceKey, { auth: { persistSession: false } })

        const { error: txErr } = await admin.from("point_transactions").insert({
          user_id: user.id,
          plaza_id: order.plaza_id,
          type: "earn",
          amount: reward,
          source: "local_food.purchase",
          source_id: id,
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
          metadata: {
            order_amount: order.amount,
            points_used: order.points_used,
            paid_cash: paidCash,
            reward_pct: LOCAL_FOOD_REWARD_PCT,
          },
        })

        if (txErr) {
          // 23505 (unique_violation) → 이미 적립됨. silent skip.
          if ((txErr as any)?.code !== "23505") {
            console.error("[confirm] reward tx insert failed", txErr)
          }
        } else {
          // 잔액 원자적 갱신 — race condition 차단
          const { error: rpcErr } = await admin.rpc("grant_points_atomic", {
            p_user: user.id,
            p_plaza: order.plaza_id,
            p_amount: reward,
          })
          if (rpcErr) console.error("[confirm] grant_points_atomic failed", rpcErr)
        }
      } else {
        console.warn("[confirm] service role key missing — 포인트 적립 skip")
      }
    }
  } catch (e) {
    // 적립 실패는 구매확정 자체를 막지 않음 — 로그만
    console.error("[confirm] reward exception", e)
  }

  // TODO: PortOne 도입 후 — 에스크로 해제 + 생산자 계좌 정산 큐 등록
  return NextResponse.json({ order: data })
}
