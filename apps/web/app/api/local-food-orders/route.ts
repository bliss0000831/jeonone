import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { NextResponse, type NextRequest } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { banGuardResponse } from "@/lib/services/user-ban-guard"
import { generateMerchantUid, calculateFee, type DeliveryAddress } from "@/lib/local-food-orders"

/**
 * GET /api/local-food-orders?role=buyer|seller
 *   본인 주문 목록 (구매자 또는 판매자 관점)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const role = searchParams.get("role") || "buyer"
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100)
  const offset = parseInt(searchParams.get("offset") || "0")
  const plaza = await getCurrentPlaza()

  let q: any = supabase
    .from("local_food_orders")
    .select("*, items:local_food_order_items(*)")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (role === "seller") {
    q = q.eq("seller_id", user.id)
  } else {
    q = q.eq("buyer_id", user.id)
  }
  if (plaza) q = q.eq("plaza_id", plaza)

  const { data, error } = await q
  if (error) {
    console.error("[local-food-orders GET]", error)
    return NextResponse.json({ error: "조회 실패" }, { status: 500 })
  }
  return NextResponse.json({ orders: data || [] })
}

/**
 * POST /api/local-food-orders
 *   주문 생성 — 결제는 별도 단계 (status='pending' 으로 시작)
 *   body: { items: [{ local_food_id, quantity }], delivery_addr, buyer_memo? }
 *
 *   같은 주문 안의 모든 상품은 동일 생산자여야 함 (다른 생산자면 별도 주문으로).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { user, tokenSource } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })

  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  // 주문 생성 rate limit — 분당 5건
  const limited = await enforceRateLimit(request, "post", user.id)
  if (limited) return limited

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 })

  const items = body.items as Array<{ local_food_id: string; quantity: number }>
  const delivery_addr = body.delivery_addr as DeliveryAddress
  const buyer_memo = (body.buyer_memo || "").toString().slice(0, 500) || null
  const requestedPoints = Math.max(0, Math.floor(Number(body.points_used) || 0))
  const idempotencyKey = (body.idempotency_key || "").toString().slice(0, 64) || null

  // idempotency — 같은 buyer+key 의 기존 주문이 있으면 그걸 반환 (재시도 안전)
  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from("local_food_orders")
      .select("id, status")
      .eq("buyer_id", user.id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ order: existing, idempotent: true })
    }
  }

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "상품을 선택해주세요" }, { status: 400 })
  }
  if (!delivery_addr || !delivery_addr.recipient_name || !delivery_addr.phone || !delivery_addr.addr1) {
    return NextResponse.json({ error: "배송지 정보가 부족합니다" }, { status: 400 })
  }
  for (const it of items) {
    if (!it.local_food_id || !Number.isInteger(it.quantity) || it.quantity <= 0 || it.quantity > 99) {
      return NextResponse.json({ error: "수량은 1~99 사이" }, { status: 400 })
    }
  }

  // 상품 정보 조회 — cross-plaza national 글 허용을 위해 buyer plaza 로 필터 X
  const buyerPlaza = await getCurrentPlaza()
  const { data: foods, error: fErr } = await supabase
    .from("local_food")
    .select("id, user_id, plaza_id, title, unit, price, status, images, visibility")
    .in("id", items.map((i) => i.local_food_id))
  if (fErr || !foods || foods.length !== items.length) {
    return NextResponse.json({ error: "상품을 찾을 수 없습니다" }, { status: 404 })
  }

  // 동일 생산자 검증
  const sellerIds = new Set(foods.map((f: any) => f.user_id))
  if (sellerIds.size > 1) {
    return NextResponse.json({ error: "한 주문에는 동일 생산자 상품만 담을 수 있습니다" }, { status: 400 })
  }
  const sellerId = foods[0].user_id
  if (sellerId === user.id) {
    return NextResponse.json({ error: "본인 상품은 구매할 수 없습니다" }, { status: 400 })
  }
  // 품절·숨김 글 차단
  if (foods.some((f: any) => f.status === "sold_out" || f.status === "hidden")) {
    return NextResponse.json({ error: "구매할 수 없는 상품이 포함되어 있습니다" }, { status: 400 })
  }
  // 동일 판매자 광장 검증 — 모든 상품의 plaza_id 가 같아야 함 (정산 단일화)
  const sellerPlazaIds = new Set(foods.map((f: any) => f.plaza_id))
  if (sellerPlazaIds.size > 1) {
    return NextResponse.json({ error: "광장이 다른 상품을 한 주문에 담을 수 없습니다" }, { status: 400 })
  }
  const sellerPlaza = foods[0].plaza_id as string
  // cross-plaza 가능 조건: 같은 광장 OR national 글
  if (buyerPlaza && sellerPlaza !== buyerPlaza) {
    const allNational = foods.every((f: any) => f.visibility === "national")
    if (!allNational) {
      return NextResponse.json({ error: "다른 광장 상품(전체광장 글 아님)" }, { status: 403 })
    }
  }

  // 합계 계산 (가격 스냅샷)
  const foodMap = new Map<string, any>(foods.map((f: any) => [f.id, f]))
  let amount = 0
  const itemRows = items.map((it) => {
    const f = foodMap.get(it.local_food_id)
    const price = typeof f.price === "number" ? f.price : Number(f.price) || 0
    const subtotal = price * it.quantity
    amount += subtotal
    return {
      local_food_id: f.id,
      title: f.title,
      unit: f.unit,
      unit_price: price,
      quantity: it.quantity,
      thumbnail_url: Array.isArray(f.images) && f.images[0] ? f.images[0] : null,
    }
  })

  if (amount <= 0) {
    return NextResponse.json({ error: "0원 상품은 결제 대상이 아닙니다" }, { status: 400 })
  }
  // 주문 금액 상한 — 오버플로우 및 비정상 주문 방지 (1억원)
  if (amount > 100_000_000) {
    return NextResponse.json({ error: "주문 금액이 한도를 초과했습니다" }, { status: 400 })
  }
  const fee_amount = calculateFee(amount)
  const merchant_uid = generateMerchantUid()

  // ─── 포인트 사용 정책 검증 (요청된 경우만) ────────────────────────────────
  // 실제 차감(points_spend_atomic)은 주문 INSERT 성공 이후에 수행한다.
  //   - idempotency_key UNIQUE 제약이 동시성 차단의 1차 게이트 역할을 하므로,
  //     INSERT 가 성공한(=경쟁에서 이긴) 요청만 포인트를 차감하면 이중 차감이 원천 차단된다.
  //   - 여기서는 정책/한도 검증과 pointsToUse 계산만 수행 (잔액 변동 없음).
  let pointsToUse = 0
  let pointsTxId: string | null = null
  if (requestedPoints > 0) {
    // 카테고리 정책 — max_redemption_pct 적용 (예: 30%)
    const { data: setting } = await supabase
      .from("point_redemption_settings")
      .select("enabled, max_redemption_pct, daily_limit_pt, exchange_rate")
      .eq("category", "local_food")
      .maybeSingle()

    if (!setting || !setting.enabled) {
      return NextResponse.json({ error: "현재 포인트 사용이 비활성화되어 있습니다" }, { status: 400 })
    }
    const exchangeRate = setting.exchange_rate || 1
    // exchange_rate=1 (1pt = 1원) 가정. 다른 값일 경우 환전 적용
    const maxByPct = Math.floor((amount * (setting.max_redemption_pct || 30)) / 100)
    if (requestedPoints > maxByPct) {
      return NextResponse.json(
        { error: `이 주문의 포인트 한도는 ${maxByPct.toLocaleString()}P 입니다` },
        { status: 400 },
      )
    }
    // amount 보다 많이 쓰지 못하게
    pointsToUse = Math.min(requestedPoints, amount, maxByPct)
    void exchangeRate // 향후 환전율 적용 자리
  }

  // Bearer 토큰(모바일) → RLS 차단 → admin client 우회
  let writer: any = supabase
  if (tokenSource === "bearer") {
    try {
      writer = createAdminClient()
    } catch (e) {
      console.error("[local-food-orders POST] admin client unavailable", e)
    }
  }

  // 주문 INSERT — 정산·PG 광장 = 판매자 광장
  //   ※ 포인트 차감(points_spend_atomic)보다 INSERT 를 먼저 수행한다.
  //     (buyer_id, idempotency_key) UNIQUE 제약이 동시 요청의 1차 게이트가 되어,
  //     INSERT 에 성공한 단 하나의 요청만 이후 포인트를 차감 → 이중 차감 원천 차단.
  //   이 시점에는 아직 차감 전이므로 points_tx_id 는 null 로 둔다.
  const { data: order, error: oErr } = await (writer as any)
    .from("local_food_orders")
    .insert({
      buyer_id: user.id,
      seller_id: sellerId,
      plaza_id: sellerPlaza,           // 정산·수수료 광장 = 판매자 광장
      buyer_plaza_id: buyerPlaza,      // 통계용 (cross-plaza 거래 추적)
      status: "pending",
      amount,
      fee_amount,
      points_used: pointsToUse,
      points_tx_id: null,
      delivery_addr,
      buyer_memo,
      pg_provider: "mock",     // TODO: PortOne 도입 시 'portone' 으로 교체
      pg_merchant_uid: merchant_uid,
      idempotency_key: idempotencyKey,
    })
    .select()
    .single()

  // 포인트 롤백 헬퍼 — 차감 후 후속 단계 실패 시 차감했던 포인트 회수
  const rollbackPoints = async () => {
    if (!pointsToUse || !pointsTxId) return
    try {
      // 원자적 롤백 RPC 우선 시도 (race-safe)
      const { error: rpcErr } = await supabase.rpc("points_refund_spend", {
        p_tx_id: pointsTxId,
        p_reason: "주문 실패 자동 환불",
      })
      if (!rpcErr) return // 성공

      // RPC 실패 시 fallback — atomic increment
      console.warn("[order POST] points_refund_spend RPC failed, fallback:", rpcErr.message)
      const { error: incErr } = await (supabase.rpc as any)("increment_user_points", {
        p_user_id: user.id,
        p_available_delta: pointsToUse,
        p_pending_delta: 0,
        p_lifetime_earned_delta: 0,
        p_lifetime_spent_delta: -pointsToUse,
        p_lifetime_reverted_delta: 0,
      })
      if (incErr) {
        // 최후 fallback — read-then-write (비원자적이지만 없는 것보다 나음)
        const { data: cur } = await supabase
          .from("user_points")
          .select("available, lifetime_spent")
          .eq("user_id", user.id)
          .maybeSingle()
        if (cur) {
          await supabase
            .from("user_points")
            .update({
              available: (cur.available || 0) + pointsToUse,
              lifetime_spent: Math.max(0, (cur.lifetime_spent || 0) - pointsToUse),
            })
            .eq("user_id", user.id)
        }
      }
      // revert 트랜잭션 기록 — 감사용
      await (supabase as any).from("point_transactions").insert({
        user_id: user.id,
        plaza_id: null,
        type: "manual_adjust",
        amount: pointsToUse,
        source: "local_food.order_failed_rollback",
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        metadata: { reverted_tx_id: pointsTxId },
      })
    } catch (e) {
      console.error("[order POST] points rollback failed", e)
    }
  }

  if (oErr || !order) {
    // idempotency 동시 요청 — UNIQUE 위반은 기존 row 반환.
    //   INSERT 가 차감보다 먼저이므로 패자 요청은 아직 포인트를 차감하지 않았다 → 롤백 불필요.
    if (oErr?.code === "23505" && idempotencyKey) {
      const { data: existing } = await supabase
        .from("local_food_orders")
        .select("*")
        .eq("buyer_id", user.id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle()
      if (existing) {
        return NextResponse.json({ order: existing, idempotent: true })
      }
    }
    console.error("[local-food-orders POST] insert order", oErr)
    return NextResponse.json({ error: "주문 생성 실패" }, { status: 500 })
  }

  // 아이템 INSERT
  const { error: iErr } = await (writer as any)
    .from("local_food_order_items")
    .insert(itemRows.map((r) => ({ ...r, order_id: order.id })))

  if (iErr) {
    // 롤백 — 주문 삭제 (아직 포인트 차감 전이므로 포인트 복구 불필요)
    await (writer as any).from("local_food_orders").delete().eq("id", order.id)
    console.error("[local-food-orders POST] insert items", iErr)
    return NextResponse.json({ error: "주문 생성 실패" }, { status: 500 })
  }

  // ─── 포인트 차감 (주문/아이템 INSERT 성공 이후) ───────────────────────────
  //   UNIQUE 제약을 통과한 단일 요청만 여기 도달 → 이중 차감 불가.
  if (pointsToUse > 0) {
    const { data: spendRes, error: spendErr } = await supabase.rpc("points_spend_atomic", {
      p_user_id: user.id,
      p_plaza_id: null as any,  // 광장 격리 해제 — RPC에서 무시됨
      p_category: "local_food",
      p_amount: pointsToUse,
      p_payment_total: amount,
      p_source_id: null as any,
    })

    // 차감 실패 시 주문/아이템 롤백 (보상)
    const rollbackOrder = async () => {
      await (writer as any).from("local_food_order_items").delete().eq("order_id", order.id)
      await (writer as any).from("local_food_orders").delete().eq("id", order.id)
    }

    if (spendErr) {
      console.error("[order POST] points_spend_atomic error", spendErr)
      await rollbackOrder()
      return NextResponse.json({ error: "포인트 차감 실패" }, { status: 500 })
    }
    if (!spendRes || (spendRes as any).ok === false) {
      const reason = (spendRes as any)?.reason || "unknown"
      const msg =
        reason === "insufficient_balance_or_suspended"
          ? "포인트 잔액이 부족합니다"
          : reason === "exceeds_redemption_pct"
          ? "결제액의 30% 까지만 포인트 사용 가능합니다"
          : reason === "category_disabled"
          ? "포인트 사용이 비활성화되어 있습니다"
          : "포인트 사용 실패"
      await rollbackOrder()
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    pointsTxId = (spendRes as any).tx_id || null

    // 차감 tx_id 를 주문에 기록 — 이후 취소/환불 시 환원 근거
    const { error: updErr } = await (writer as any)
      .from("local_food_orders")
      .update({ points_tx_id: pointsTxId })
      .eq("id", order.id)
    if (updErr) {
      // tx_id 기록 실패 → 차감 포인트 환원 + 주문 롤백 (불일치 방지)
      console.error("[order POST] points_tx_id update failed, rolling back", updErr)
      await rollbackPoints()
      await rollbackOrder()
      return NextResponse.json({ error: "주문 생성 실패" }, { status: 500 })
    }
    order.points_tx_id = pointsTxId
  }

  return NextResponse.json({ order })
}
