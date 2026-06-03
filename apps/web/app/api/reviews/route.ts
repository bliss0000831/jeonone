import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { NextResponse, type NextRequest } from "next/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { banGuardResponse } from "@/lib/services/user-ban-guard"

/**
 * 이웃 별 후기 API
 *
 * GET  /api/reviews?user_id=…       해당 사용자에 대한 후기 목록 (공개)
 * POST /api/reviews                 후기 작성 (거래 검증 후)
 *
 * 거래 검증:
 *  - source_type='local_food_order'   : 본인이 buyer 인 confirmed/settled 주문만
 *  - source_type='group_buying_order' : 본인이 buyer 인 group_confirmed/shipped/confirmed 주문만
 *  - source_type='property'           : 매물 채팅방 거래 완료 후 (추후)
 *  - source_type='secondhand'         : 중고거래 채팅방 거래 완료 후 (추후)
 *
 * 본인 자신은 후기 작성 불가, 한 source당 1회만.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const userId = new URL(request.url).searchParams.get("user_id")
  if (!userId) {
    return NextResponse.json({ error: "user_id 필요" }, { status: 400 })
  }
  const { data, error } = await supabase
    .from("reviews")
    .select(
      "id, reviewer_id, reviewed_user_id, response_speed, accuracy, kindness, total_score, content, created_at, profiles!reviews_reviewer_id_fkey(nickname)",
    )
    .eq("reviewed_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50)
  if (error) {
    console.error("[reviews GET]", error)
    return NextResponse.json({ error: "조회 실패" }, { status: 500 })
  }
  const reviews = (data || []).map((r: any) => ({
    ...r,
    reviewer_name: r.profiles?.nickname || "익명",
  }))
  return NextResponse.json({ reviews })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { user, tokenSource } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  }

  // 차단 사용자 체크
  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  // Rate limit — 분당 5건, 일일 20건 같은 도배 방지
  const limited = await enforceRateLimit(request, "post", user.id)
  if (limited) return limited

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 })

  const reviewed_user_id = body.reviewed_user_id as string
  const source_type = body.source_type as string
  const source_id = body.source_id as string
  const response_speed = Math.max(1, Math.min(5, Number(body.response_speed) || 0))
  const accuracy = Math.max(1, Math.min(5, Number(body.accuracy) || 0))
  const kindness = Math.max(1, Math.min(5, Number(body.kindness) || 0))
  const content = (body.content || "").toString().slice(0, 500) || null

  if (!reviewed_user_id) {
    return NextResponse.json({ error: "대상 사용자가 지정되지 않았습니다" }, { status: 400 })
  }
  if (reviewed_user_id === user.id) {
    return NextResponse.json({ error: "본인에게 후기를 남길 수 없습니다" }, { status: 400 })
  }
  if (response_speed < 1 || accuracy < 1 || kindness < 1) {
    return NextResponse.json({ error: "별점은 1~5 사이여야 합니다" }, { status: 400 })
  }
  if (!source_type || !source_id) {
    return NextResponse.json({ error: "거래 정보가 없습니다" }, { status: 400 })
  }

  // ─── 거래 검증 ───────────────────────────────────────────────────────────
  if (source_type === "local_food_order") {
    const { data: order } = await supabase
      .from("local_food_orders")
      .select("buyer_id, seller_id, status")
      .eq("id", source_id)
      .maybeSingle()
    if (!order) {
      return NextResponse.json({ error: "주문을 찾을 수 없습니다" }, { status: 404 })
    }
    if (order.buyer_id !== user.id) {
      return NextResponse.json({ error: "구매자만 후기 작성 가능합니다" }, { status: 403 })
    }
    if (order.seller_id !== reviewed_user_id) {
      return NextResponse.json({ error: "거래 상대가 아닙니다" }, { status: 400 })
    }
    if (!["confirmed", "settled"].includes(order.status)) {
      return NextResponse.json(
        { error: "구매확정 후에 후기를 남길 수 있습니다" },
        { status: 400 },
      )
    }
  } else if (source_type === "group_buying_order") {
    const { data: order } = await supabase
      .from("group_buying_orders")
      .select("buyer_id, seller_id, status")
      .eq("id", source_id)
      .maybeSingle()
    if (!order) {
      return NextResponse.json({ error: "주문을 찾을 수 없습니다" }, { status: 404 })
    }
    if (order.buyer_id !== user.id) {
      return NextResponse.json({ error: "구매자만 후기 작성 가능합니다" }, { status: 403 })
    }
    if (order.seller_id !== reviewed_user_id) {
      return NextResponse.json({ error: "거래 상대가 아닙니다" }, { status: 400 })
    }
    if (!["shipped", "confirmed", "settled"].includes(order.status)) {
      return NextResponse.json(
        { error: "발송 후에 후기를 남길 수 있습니다" },
        { status: 400 },
      )
    }
  } else if (source_type === "auction") {
    // 경매 낙찰자 → 판매자 후기 (source_id = auction_listings.id)
    const { data: a } = await (supabase as any)
      .from("auction_listings")
      .select("seller_id, winner_id, status")
      .eq("id", source_id)
      .maybeSingle()
    if (!a) {
      return NextResponse.json({ error: "경매를 찾을 수 없습니다" }, { status: 404 })
    }
    if (a.winner_id !== user.id) {
      return NextResponse.json({ error: "낙찰자만 후기 작성 가능합니다" }, { status: 403 })
    }
    if (a.seller_id !== reviewed_user_id) {
      return NextResponse.json({ error: "거래 상대가 아닙니다" }, { status: 400 })
    }
    if (a.status !== "ended") {
      return NextResponse.json({ error: "경매 종료 후 후기를 남길 수 있습니다" }, { status: 400 })
    }
  } else if (source_type === "rental") {
    // 대여 신청자 → 소유자 후기 (source_id = rental_bookings.id)
    const { data: bk } = await (supabase as any)
      .from("rental_bookings")
      .select("renter_id, status, rental:rental_listings(owner_id)")
      .eq("id", source_id)
      .maybeSingle()
    if (!bk) {
      return NextResponse.json({ error: "예약을 찾을 수 없습니다" }, { status: 404 })
    }
    if (bk.renter_id !== user.id) {
      return NextResponse.json({ error: "대여 신청자만 후기 작성 가능합니다" }, { status: 403 })
    }
    if (bk.rental?.owner_id !== reviewed_user_id) {
      return NextResponse.json({ error: "거래 상대가 아닙니다" }, { status: 400 })
    }
    if (!["returned", "completed"].includes(bk.status)) {
      return NextResponse.json({ error: "대여 완료 후 후기를 남길 수 있습니다" }, { status: 400 })
    }
  } else if (source_type === "property" || source_type === "secondhand") {
    // 추후: 채팅방 거래 완료 시점에 source_id = chat_room_id 로 검증
    // 현재는 일단 차단 — 미래에 풀어줄 예정
    return NextResponse.json(
      { error: "이 거래 유형은 아직 후기를 지원하지 않습니다" },
      { status: 400 },
    )
  } else {
    return NextResponse.json({ error: "지원하지 않는 거래 유형" }, { status: 400 })
  }

  // ─── INSERT ──────────────────────────────────────────────────────────────
  // total_score 는 3개 항목 평균 (1~5)
  const total_score = Number(((response_speed + accuracy + kindness) / 3).toFixed(2))

  // Bearer 토큰(모바일) → supabase 가 anonymous 실행 → RLS 차단
  let writer: any = supabase
  if (tokenSource === "bearer") {
    const { getAdminWriteClient } = await import("@/lib/services/admin-auth")
    const wc = await getAdminWriteClient()
    if (!wc) {
      return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 })
    }
    writer = wc
  }

  const plaza = await getCurrentPlaza()
  if (!plaza) {
    return NextResponse.json({ error: "광장이 지정되지 않았습니다" }, { status: 400 })
  }

  const { data, error } = await writer
    .from("reviews")
    .insert({
      reviewer_id: user.id,
      reviewed_user_id,
      source_type,
      source_id,
      response_speed,
      accuracy,
      kindness,
      total_score,
      content,
      plaza_id: plaza,
    })
    .select("id, reviewer_id, reviewed_user_id, source_type, source_id, response_speed, accuracy, kindness, total_score, content, created_at")
    .single()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "이미 이 거래에 후기를 남기셨습니다" },
        { status: 409 },
      )
    }
    console.error("[reviews POST]", error)
    return NextResponse.json({ error: "후기 등록 실패" }, { status: 500 })
  }
  // 트리거가 자동으로 update_neighbor_star 호출 → 평균 갱신
  return NextResponse.json({ review: data })
}
