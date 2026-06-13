import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { banGuardResponse } from "@/lib/services/user-ban-guard"

export const dynamic = 'force-dynamic'

// 채팅방 목록 조회 — 현재 광장의 매물 관련 대화만
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  const { user } = await getAuthedUser(supabase, request)

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  }

  const limited = await enforceRateLimit(request as any, 'search', user.id)
  if (limited) return limited

  // 내가 참여한 채팅방 목록 조회 (buyer 또는 seller) — DB 단계 광장 필터
  let directQ: any = supabase
    .from("chat_rooms")
    .select("id, buyer_id, seller_id, property_id, post_type, plaza_id, buyer_plaza_id, last_message, last_message_at, created_at")
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .limit(50)
    .order("last_message_at", { ascending: false, nullsFirst: false })
  if (plaza) directQ = directQ.eq("plaza_id", plaza)

  // 두 독립 쿼리 병렬 실행
  const [directResult, invitedResult] = await Promise.all([
    directQ,
    supabase
      .from("expert_invitations")
      .select("chat_room_id")
      .eq("expert_id", user.id)
      .eq("status", "accepted"),
  ])

  const { data: directRooms, error: directError } = directResult
  const { data: invitedRoomIds } = invitedResult

  if (directError) {
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  // 초대받은 채팅방 상세 정보 조회 (별도 쿼리로 RLS 우회) — 광장 필터
  let invitedChatRooms: any[] = []
  if (invitedRoomIds && invitedRoomIds.length > 0) {
    const roomIds = invitedRoomIds.map(r => r.chat_room_id)
    let invQ: any = supabase
      .from("chat_rooms")
      .select("id, buyer_id, seller_id, property_id, post_type, plaza_id, buyer_plaza_id, last_message, last_message_at, created_at")
      .in("id", roomIds)
      .limit(50)
    if (plaza) invQ = invQ.eq("plaza_id", plaza)
    const { data: rooms } = await invQ
    invitedChatRooms = rooms || []
  }

  // 중복 제거하여 병합
  const directRoomIds = new Set((directRooms || []).map((r: { id: string }) => r.id))
  const allRooms = [
    ...(directRooms || []),
    ...invitedChatRooms.filter((r: { id: string }) => !directRoomIds.has(r.id))
  ]
  // [v0] 디버그 로그 제거됨 (production 노이즈)

  // 시간순 정렬
  allRooms.sort((a, b) => {
    const timeA = a.last_message_at ? Date.parse(a.last_message_at) : 0
    const timeB = b.last_message_at ? Date.parse(b.last_message_at) : 0
    return timeB - timeA
  })

  const rooms = allRooms

  // 각 채팅방의 상대 user 와 매물 ID 미리 추출 (batch fetch 위해)
  const meta = (rooms || []).map((room) => {
    const isInvitedExpert = room.buyer_id !== user.id && room.seller_id !== user.id
    const otherUserId = isInvitedExpert
      ? room.seller_id
      : (room.buyer_id === user.id ? room.seller_id : room.buyer_id)
    return { roomId: room.id, otherUserId, propertyId: room.property_id, isInvitedExpert }
  })

  const otherIds = [...new Set(meta.map((m) => m.otherUserId).filter(Boolean))]
  const propertyIds = [...new Set(meta.map((m) => m.propertyId).filter(Boolean))]
  const roomIds = (rooms || []).map((r) => r.id)

  // 3개 batch 쿼리 — 이전엔 N개 룸당 3쿼리 (= 3N) 였지만 이제 항상 3쿼리.
  const [profilesRes, propertiesRes, unreadRes] = await Promise.all([
    otherIds.length > 0
      ? supabase.from("profiles").select("id, nickname, avatar_url").in("id", otherIds)
      : Promise.resolve({ data: [] as any[] }),
    propertyIds.length > 0
      ? supabase
          .from("properties")
          .select("id, title, images, price, transaction_type, plaza_id")
          .in("id", propertyIds)
      : Promise.resolve({ data: [] as any[] }),
    // 읽지 않은 메시지: 룸별 count 를 DB에서 집계 (이전: 전체 row fetch 후 JS 그룹핑)
    roomIds.length > 0
      ? supabase.rpc("chat_unread_counts", {
          p_room_ids: roomIds,
          p_user_id: user.id,
        }).then((res) => res, () => ({ data: [] as any[] }))
      : Promise.resolve({ data: [] as any[] }),
  ])

  const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]))
  const propertyMap = new Map((propertiesRes.data || []).map((p: any) => [p.id, p]))
  // RPC 가 { chat_room_id, cnt } 형태로 반환 — fallback: 기존 row 카운팅
  const unreadMap = new Map<string, number>()
  for (const m of (unreadRes.data || []) as any[]) {
    if (m.cnt !== undefined) {
      // RPC 결과 (GROUP BY 집계)
      unreadMap.set(m.chat_room_id, Number(m.cnt))
    } else {
      // fallback: 개별 row 카운팅
      unreadMap.set(m.chat_room_id, (unreadMap.get(m.chat_room_id) || 0) + 1)
    }
  }

  const roomsWithDetails = (rooms || []).map((room: any, i: number) => {
    const m = meta[i]
    return {
      ...room,
      otherUser: profileMap.get(m.otherUserId) || null,
      property: propertyMap.get(m.propertyId) || null,
      unreadCount: unreadMap.get(room.id) || 0,
      isInvitedExpert: m.isInvitedExpert,
    }
  })

  // DB 레벨에서 이미 plaza 필터됐지만, 매물 plaza_id 가 어긋나는
  // edge case (백필 안 된 row 등) 한 번 더 방어
  const filtered = plaza
    ? roomsWithDetails.filter((r: any) => !r.property || r.property.plaza_id === plaza)
    : roomsWithDetails

  return NextResponse.json({ rooms: filtered })
}

// 채팅방 생성 또는 기존 채팅방 반환
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  const { user, tokenSource } = await getAuthedUser(supabase, request)

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  }

  // 차단 사용자 체크
  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  // 채팅방 생성 도배 방어
  const limited = await enforceRateLimit(request, 'mutate', user.id)
  if (limited) return limited

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 })
  }
  const { propertyId, sellerId, postId, postType, auctionId } = body

  // 경매 낙찰 후: 판매자 → 낙찰자 채팅
  // 일반 경로(POST postId)는 작성자(판매자) 시작을 막으므로, 낙찰 거래를 위해
  // 판매자가 낙찰자에게 먼저 연락할 수 있는 유일한 경로. 엄격 검증:
  //   호출자 = 경매 판매자 && 낙찰자 존재 → buyer=낙찰자, seller=호출자 로 방 생성/반환.
  if (auctionId) {
    const { data: auc } = await (supabase as any)
      .from("auction_listings")
      .select("seller_id, winner_id, post_id, plaza_id")
      .eq("id", auctionId)
      .maybeSingle()
    if (!auc) {
      return NextResponse.json({ error: "경매를 찾을 수 없습니다" }, { status: 404 })
    }
    if (auc.seller_id !== user.id) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
    }
    if (!auc.winner_id) {
      return NextResponse.json({ error: "낙찰자가 없습니다" }, { status: 400 })
    }
    if (plaza && auc.plaza_id && auc.plaza_id !== plaza) {
      return NextResponse.json({ error: "경매를 찾을 수 없습니다" }, { status: 404 })
    }

    let reader: any = supabase
    if (tokenSource === "bearer") {
      try { reader = createAdminClient() } catch {}
    }
    const { data: existingRoom } = await reader
      .from("chat_rooms")
      .select("id")
      .eq("property_id", auc.post_id)
      .eq("buyer_id", auc.winner_id)
      .eq("seller_id", user.id)
      .maybeSingle()
    if (existingRoom) {
      return NextResponse.json({ room: existingRoom })
    }

    const sellerPlazaId = auc.plaza_id ?? plaza
    let writer: any = supabase
    if (tokenSource === "bearer") {
      try { writer = createAdminClient() } catch (e) { console.error("[chat/rooms auction] admin client unavailable", e) }
    }
    const { data: newRoom, error } = await writer
      .from("chat_rooms")
      .insert({
        property_id: auc.post_id,
        buyer_id: auc.winner_id,
        seller_id: user.id,
        post_type: "secondhand",
        ...(sellerPlazaId ? { plaza_id: sellerPlazaId, buyer_plaza_id: sellerPlazaId } : {}),
      })
      .select()
      .single()
    if (error) {
      console.error("[chat/rooms auction] insert failed:", { error, tokenSource })
      return NextResponse.json({ error: "채팅방 생성에 실패했습니다" }, { status: 500 })
    }
    return NextResponse.json({ room: newRoom })
  }

  // 부동산 매물 채팅 (기존 로직)
  if (propertyId && sellerId) {
    // 본인 매물에는 채팅 불가
    if (user.id === sellerId) {
      return NextResponse.json({ error: "본인 매물에는 채팅할 수 없습니다" }, { status: 400 })
    }

    // 광장 + 소유자 검증 — 다른 광장 매물로 채팅 시도 차단 + sellerId 위변조 차단
    const { data: prop } = await supabase
      .from("properties")
      .select("plaza_id, user_id")
      .eq("id", propertyId)
      .maybeSingle()
    if (!prop) {
      return NextResponse.json({ error: "매물을 찾을 수 없습니다" }, { status: 404 })
    }
    if (plaza && prop.plaza_id && prop.plaza_id !== plaza) {
      return NextResponse.json({ error: "매물을 찾을 수 없습니다" }, { status: 404 })
    }
    // sellerId 가 실제 매물 소유자와 다르면 거부 (body trust 방어)
    if ((prop as any).user_id !== sellerId) {
      return NextResponse.json({ error: "매물을 찾을 수 없습니다" }, { status: 404 })
    }

    // 기존 채팅방 확인
    const { data: existingRoom } = await supabase
      .from("chat_rooms")
      .select("id")
      .eq("property_id", propertyId)
      .eq("buyer_id", user.id)
      .eq("seller_id", sellerId)
      .maybeSingle()

    if (existingRoom) {
      return NextResponse.json({ room: existingRoom })
    }

    // 새 채팅방 생성 — plaza_id (seller plaza) + buyer_plaza_id (현재 광장) 주입
    // Bearer 토큰 (모바일) 은 RLS 차단되므로 admin client 사용
    let writerP: any = supabase
    if (tokenSource === "bearer") {
      try {
        writerP = createAdminClient()
      } catch (e) {
        console.error("[chat/rooms property] admin client unavailable", e)
      }
    }
    const { data: newRoom, error } = await writerP
      .from("chat_rooms")
      .insert({
        property_id: propertyId,
        buyer_id: user.id,
        seller_id: sellerId,
        post_type: "property",
        ...(plaza ? { plaza_id: plaza, buyer_plaza_id: plaza } : {}),
      })
      .select()
      .single()

    if (error) {
      console.error("[chat/rooms property] insert failed:", { error, tokenSource })
      return NextResponse.json({
        error: "채팅방 생성에 실패했습니다",
      }, { status: 500 })
    }

    return NextResponse.json({ room: newRoom })
  }

  // 다른 게시물 유형 채팅 (나눔, 공동구매, 신장개업, 인테리어, 이사, 청소, 수리)
  if (postId && postType) {
    // 게시물 작성자 확인
    const tableMap: Record<string, string> = {
      sharing: "sharing_posts",
      group_buying: "group_buying_posts",
      new_store: "new_store_posts",
      interior: "interior_posts",
      moving: "moving_posts",
      cleaning: "cleaning_posts",
      repair: "repair_posts",
      local_food: "local_food",
      secondhand: "secondhand_posts",
      jobs: "jobs_posts",
      clubs: "clubs", // 모임 — 호스트 1:1 문의 채팅용
    }
    
    const tableName = tableMap[postType]
    if (!tableName) {
      return NextResponse.json({ error: "잘못된 게시물 유형입니다" }, { status: 400 })
    }

    // 🅲 광장 격리 — 공구/로컬푸드 national 글은 cross-plaza 허용
    const allowCrossPlaza = postType === "group_buying" || postType === "local_food"
    const selectCols = allowCrossPlaza
      ? "user_id, plaza_id, visibility"
      : "user_id, plaza_id"
    let postQ: any = (supabase as any).from(tableName).select(selectCols).eq("id", postId)
    const { data: post } = await postQ.maybeSingle()

    if (!post) {
      return NextResponse.json({ error: "게시물을 찾을 수 없습니다" }, { status: 404 })
    }
    // plaza 미스매치 검증 — national 글이거나 같은 광장이어야 함
    if (plaza && (post as any).plaza_id && (post as any).plaza_id !== plaza) {
      const isNational =
        allowCrossPlaza && (post as any).visibility === "national"
      if (!isNational) {
        return NextResponse.json({ error: "게시물을 찾을 수 없습니다" }, { status: 404 })
      }
    }

    // 본인 게시물에는 채팅 불가
    if (user.id === post.user_id) {
      return NextResponse.json({ error: "본인 게시물에는 채팅할 수 없습니다" }, { status: 400 })
    }

    // 기존 채팅방 확인 — Bearer 는 RLS 우회 위해 admin 사용 (호출자 = buyer 검증 완료)
    let reader: any = supabase
    if (tokenSource === "bearer") {
      try {
        reader = createAdminClient()
      } catch {}
    }
    const { data: existingRoom } = await reader
      .from("chat_rooms")
      .select("id")
      .eq("property_id", postId)
      .eq("buyer_id", user.id)
      .eq("seller_id", post.user_id)
      .maybeSingle()

    if (existingRoom) {
      return NextResponse.json({ room: existingRoom })
    }

    // 새 채팅방 생성
    // plaza_id = 글 작성자 광장 (seller plaza, 정산/표시 anchor)
    // buyer_plaza_id = 채팅 시작자(buyer) 의 현재 광장
    // Bearer 토큰 경로(모바일) 는 RLS 가 차단하므로 admin client 사용
    // (호출자 신원은 이미 검증됨 — user.id === buyer_id 강제)
    const sellerPlazaId = (post as any).plaza_id ?? plaza
    let writer: any = supabase
    if (tokenSource === "bearer") {
      try {
        writer = createAdminClient()
      } catch (e) {
        console.error("[chat/rooms] admin client unavailable", e)
      }
    }
    const insertPayload = {
      property_id: postId,
      buyer_id: user.id,
      seller_id: post.user_id,
      post_type: postType,
      ...(sellerPlazaId ? { plaza_id: sellerPlazaId } : {}),
      ...(plaza ? { buyer_plaza_id: plaza } : {}),
    }
    const { data: newRoom, error } = await writer
      .from("chat_rooms")
      .insert(insertPayload)
      .select()
      .single()

    if (error) {
      // 디테일한 에러 노출 — 디버깅용
      console.error("[chat/rooms] insert failed:", {
        error,
        tokenSource,
        insertPayload,
        plaza,
        postType,
      })
      return NextResponse.json({
        error: "채팅방 생성에 실패했습니다",
      }, { status: 500 })
    }

    return NextResponse.json({ room: newRoom })
  }

  return NextResponse.json({ error: "필수 정보가 누락되었습니다" }, { status: 400 })
}
