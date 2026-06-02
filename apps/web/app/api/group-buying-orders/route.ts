import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { NextResponse, type NextRequest } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { generateMerchantUid, calculateFee, type DeliveryAddress } from "@/lib/local-food-orders"

/**
 * 공동구매 주문 — 결제 모드 (payment_required=TRUE) 글에 참여 시 사용.
 * 직거래 모드는 기존 /api/group-buying/[id]/join 그대로.
 *
 * GET  ?role=buyer|seller   본인 주문 목록
 * POST                       주문 생성 (status='pending')
 *   body: { post_id, quantity, receive_method, delivery_addr?, buyer_memo?, points_used? }
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })

  const role = new URL(request.url).searchParams.get("role") || "buyer"
  const plaza = await getCurrentPlaza()

  let q: any = supabase
    .from("group_buying_orders")
    .select("*, post:group_buying_posts(id, title, product_name, images, deadline, status, min_participants, current_participants, group_price, delivery_mode, pickup_location, pickup_time)")
    .order("created_at", { ascending: false })

  if (role === "seller") {
    q = q.eq("seller_id", user.id)
    // 판매자는 전국 배송 주문도 볼 수 있어야 하므로 plaza 필터 생략
  } else {
    q = q.eq("buyer_id", user.id)
    if (plaza) q = q.eq("plaza_id", plaza)
  }

  q = q.limit(200)

  const { data, error } = await q
  if (error) {
    console.error("[gb-orders GET]", error)
    return NextResponse.json({ error: "조회 실패" }, { status: 500 })
  }
  return NextResponse.json({ orders: data || [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })

  const limited = await enforceRateLimit(request, "post", user.id)
  if (limited) return limited

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 })

  const post_id = body.post_id as string
  const quantity = Math.max(1, Math.min(99, Number(body.quantity) || 1))
  const receive_method = body.receive_method === "delivery" ? "delivery" : "pickup"
  let delivery_addr = body.delivery_addr as (DeliveryAddress & { zipcode?: string }) | undefined
  const buyer_memo = (body.buyer_memo || "").toString().slice(0, 500) || null
  const requestedPoints = Math.max(0, Math.floor(Number(body.points_used) || 0))
  const idempotencyKey = (body.idempotency_key || "").toString().slice(0, 64) || null

  if (!post_id) return NextResponse.json({ error: "글 정보가 없습니다" }, { status: 400 })

  // idempotency — 같은 buyer+key 의 기존 주문 반환
  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from("group_buying_orders")
      .select("id, status")
      .eq("buyer_id", user.id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ order: existing, idempotent: true })
    }
  }

  if (receive_method === "delivery") {
    if (!delivery_addr || !delivery_addr.recipient_name || !delivery_addr.phone || !delivery_addr.addr1) {
      return NextResponse.json({ error: "배송지 정보가 부족합니다" }, { status: 400 })
    }
    // XSS 방어 — HTML 태그 제거 + 길이 제한
    const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '').trim()
    delivery_addr = {
      recipient_name: stripHtml(String(delivery_addr.recipient_name)).slice(0, 50),
      phone: String(delivery_addr.phone).replace(/[^\d\-+]/g, '').slice(0, 20),
      postcode: String((delivery_addr as any).postcode || (delivery_addr as any).zipcode || '').replace(/[^\d]/g, '').slice(0, 10),
      addr1: stripHtml(String(delivery_addr.addr1)).slice(0, 200),
      addr2: stripHtml(String(delivery_addr.addr2 || '')).slice(0, 200),
    }
    // 전화번호 형식 검증 — 한국 휴대폰/일반전화 (숫자 9~11자리)
    const phoneDigits = delivery_addr.phone.replace(/[^\d]/g, '')
    if (phoneDigits.length < 9 || phoneDigits.length > 11) {
      return NextResponse.json({ error: "올바른 연락처를 입력해주세요" }, { status: 400 })
    }
  }

  // 글 검증 — cross-plaza national 글 허용을 위해 buyer plaza 로 필터 X
  const buyerPlaza = await getCurrentPlaza()
  const { data: post } = await supabase
    .from("group_buying_posts")
    .select("id, user_id, plaza_id, status, group_price, max_participants, current_participants, deadline, payment_required, delivery_mode, visibility")
    .eq("id", post_id)
    .maybeSingle()
  if (!post) return NextResponse.json({ error: "글을 찾을 수 없습니다" }, { status: 404 })
  // cross-plaza 접근 가능 조건: 같은 광장 OR national 글
  if (buyerPlaza && post.plaza_id !== buyerPlaza && post.visibility !== "national") {
    return NextResponse.json({ error: "다른 광장의 글입니다" }, { status: 403 })
  }
  // 결제·정산 광장 = 글의 광장(=판매자 광장)
  const sellerPlaza = post.plaza_id
  if (post.user_id === user.id) {
    return NextResponse.json({ error: "본인 글에는 참여할 수 없습니다" }, { status: 400 })
  }
  if (!post.payment_required) {
    return NextResponse.json({ error: "결제 모드 글이 아닙니다" }, { status: 400 })
  }
  if (post.status !== "recruiting") {
    return NextResponse.json({ error: "모집이 종료되었습니다" }, { status: 400 })
  }
  if (post.deadline && new Date(post.deadline) < new Date()) {
    return NextResponse.json({ error: "모집 마감일이 지났습니다" }, { status: 400 })
  }
  if (post.max_participants && (post.current_participants ?? 0) >= post.max_participants) {
    return NextResponse.json({ error: "이미 정원이 모두 찼습니다" }, { status: 400 })
  }
  // 수령 방식 호환성 — 글이 'pickup' 만 허용하면 'delivery' 거부, 그 반대도
  if (post.delivery_mode === "pickup" && receive_method === "delivery") {
    return NextResponse.json({ error: "이 공구는 픽업만 가능합니다" }, { status: 400 })
  }
  if (post.delivery_mode === "delivery" && receive_method === "pickup") {
    return NextResponse.json({ error: "이 공구는 배송만 가능합니다" }, { status: 400 })
  }

  const unit_price = Number(post.group_price) || 0
  if (unit_price <= 0) {
    return NextResponse.json({ error: "가격이 설정되지 않은 글입니다" }, { status: 400 })
  }
  const amount = unit_price * quantity
  const fee_amount = calculateFee(amount)
  const merchant_uid = generateMerchantUid()

  // 포인트 사용 — local-food 와 동일 패턴
  let pointsToUse = 0
  let pointsTxId: string | null = null
  if (requestedPoints > 0) {
    const { data: setting } = await supabase
      .from("point_redemption_settings")
      .select("enabled, max_redemption_pct")
      .eq("category", "group_buying")
      .maybeSingle()
    if (!setting || !setting.enabled) {
      return NextResponse.json({ error: "현재 포인트 사용이 비활성화되어 있습니다" }, { status: 400 })
    }
    const maxByPct = Math.floor((amount * (setting.max_redemption_pct || 30)) / 100)
    if (requestedPoints > maxByPct) {
      return NextResponse.json(
        { error: `이 주문의 포인트 한도는 ${maxByPct.toLocaleString()}P 입니다` },
        { status: 400 },
      )
    }
    pointsToUse = Math.min(requestedPoints, amount, maxByPct)

    const { data: spendRes, error: spendErr } = await supabase.rpc("points_spend_atomic", {
      p_user_id: user.id,
      p_plaza_id: null as any,  // 광장 격리 해제 — RPC에서 무시됨
      p_category: "group_buying",
      p_amount: pointsToUse,
      p_payment_total: amount,
      p_source_id: null as any,
    })
    if (spendErr) {
      console.error("[gb-order POST] points_spend_atomic error", spendErr)
      return NextResponse.json({ error: "포인트 차감 실패" }, { status: 500 })
    }
    if (!spendRes || (spendRes as any).ok === false) {
      const reason = (spendRes as any)?.reason || "unknown"
      const msg =
        reason === "insufficient_balance_or_suspended"
          ? "포인트 잔액이 부족합니다"
          : reason === "exceeds_redemption_pct"
          ? "결제액의 30% 까지만 포인트 사용 가능합니다"
          : "포인트 사용 실패"
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    pointsTxId = (spendRes as any).tx_id || null
  }

  // PG 채널·정산 광장은 sellerPlaza 기준 — PortOne channel/store 도 sellerPlaza 의 것 사용
  // (실제 결제 confirm 단계에서 plazas where id=sellerPlaza 의 portone_channel_key 사용)
  const { data: order, error: oErr } = await (supabase as any)
    .from("group_buying_orders")
    .insert({
      post_id,
      buyer_id: user.id,
      seller_id: post.user_id,
      plaza_id: sellerPlaza,           // 정산·수수료 광장 = 판매자 광장
      buyer_plaza_id: buyerPlaza,      // 통계용 (cross-plaza 거래 추적)
      status: "pending",
      unit_price,
      quantity,
      amount,
      fee_amount,
      points_used: pointsToUse,
      points_tx_id: pointsTxId,
      receive_method,
      delivery_addr: delivery_addr ?? null,
      buyer_memo,
      pg_provider: "mock",
      pg_merchant_uid: merchant_uid,
      idempotency_key: idempotencyKey,
    })
    .select()
    .single()

  if (oErr || !order) {
    // idempotency 동시 요청 처리 — 기존 주문 반환
    if (oErr?.code === "23505" && idempotencyKey) {
      const { data: existing } = await supabase
        .from("group_buying_orders")
        .select("*")
        .eq("buyer_id", user.id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle()
      if (existing) {
        // 중복 요청이라 차감했던 포인트는 환원 (멱등 RPC)
        if (pointsTxId) {
          await supabase.rpc("points_refund_spend", {
            p_tx_id: pointsTxId,
            p_reason: "주문 INSERT 중복(idempotency)",
          })
        }
        return NextResponse.json({ order: existing, idempotent: true })
      }
    }
    console.error("[gb-orders POST] insert", oErr)
    // 포인트 롤백 — Day 3-4 에서 도입한 points_refund_spend RPC 사용
    if (pointsTxId) {
      await supabase.rpc("points_refund_spend", {
        p_tx_id: pointsTxId,
        p_reason: "주문 INSERT 실패 롤백",
      })
    }
    return NextResponse.json({ error: "주문 생성 실패" }, { status: 500 })
  }

  return NextResponse.json({ order })
}
