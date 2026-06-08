import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { notify, preview } from "@/lib/services/notifications"
import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { banGuardResponse } from "@/lib/services/user-ban-guard"

export const dynamic = 'force-dynamic'

/**
 * 채팅방이 현재 광장에 속하는지 검증 (속성 매물 / 다른 게시글 모두 커버).
 * room.property_id 와 room.post_type 을 보고 해당 게시글의 plaza_id 를 비교.
 * 광장 외부면 false.
 */
async function chatRoomInPlaza(supabase: any, room: any, plaza: string | null): Promise<boolean> {
  if (!plaza || !room) return true
  const postType: string = room.post_type || 'property'
  // 🅲 DM (post_type='direct') 은 광장 무관 — 두 유저 간 직접 메시지는 항상 허용
  if (postType === 'direct') return true
  const postId: string | null = room.property_id || null
  if (!postId) return true // 어디 종속인지 모르면 통과 (legacy)

  const tableMap: Record<string, string> = {
    property: 'properties',
    sharing: 'sharing_posts',
    group_buying: 'group_buying_posts',
    new_store: 'new_store_posts',
    interior: 'interior_posts',
    moving: 'moving_posts',
    cleaning: 'cleaning_posts',
    repair: 'repair_posts',
    local_food: 'local_food',
  }
  const table = tableMap[postType] || 'properties'
  // 🅲 공구/로컬푸드는 visibility=national 이면 cross-plaza 허용
  const allowCrossPlaza = postType === 'group_buying' || postType === 'local_food'
  const selectCols = allowCrossPlaza ? 'plaza_id, visibility' : 'plaza_id'
  const { data } = await supabase.from(table).select(selectCols).eq('id', postId).maybeSingle()
  if (!data) return true // 게시글 삭제됐으면 채팅방 보존 — 멤버는 접근 가능
  if (!data.plaza_id || data.plaza_id === plaza) return true
  // 같은 광장 아님 → national 글이면 통과
  if (allowCrossPlaza && (data as any).visibility === 'national') return true
  return false
}

// 채팅 메시지 전용 리밋 — 1분에 30개 (일반 대화 충분히 커버)
const CHAT_LIMIT_NAME = 'default' as const

// 메시지 목록 조회
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  
  const { user } = await getAuthedUser(supabase, request)
  
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const roomId = searchParams.get("roomId")

  if (!roomId) {
    return NextResponse.json({ error: "채팅방 ID가 필요합니다" }, { status: 400 })
  }

  // 초대(방 전체) + 채팅방 조회 병렬 — 한 번 fetch 후 current-user 여부는 JS 에서 파생
  const [allInvitesRes, roomRes] = await Promise.all([
    supabase
      .from("expert_invitations")
      .select("id, chat_room_id, expert_id")
      .eq("chat_room_id", roomId)
      .eq("status", "accepted"),
    supabase
      .from("chat_rooms")
      .select("id, buyer_id, seller_id, property_id, post_type, plaza_id")
      .eq("id", roomId)
      .single(),
  ])
  const allAcceptedInvites = allInvitesRes.data || []
  const room = roomRes.data
  const isInvitedExpert = allAcceptedInvites.some((inv: any) => inv.expert_id === user.id)

  // 권한 확인: buyer/seller이거나 초대 수락한 전문가
  const isParticipant = room && (room.buyer_id === user.id || room.seller_id === user.id)
  const hasAccess = isParticipant || isInvitedExpert

  if (!hasAccess) {
    return NextResponse.json({ error: "접근 권한이 없습니다" }, { status: 403 })
  }

  // 광장 격리 — 다른 광장 매물/게시글의 채팅방이면 차단
  const plaza = await getCurrentPlaza()
  const inPlaza = await chatRoomInPlaza(supabase, room, plaza)
  if (!inPlaza) {
    return NextResponse.json({ error: "채팅방을 찾을 수 없습니다" }, { status: 404 })
  }

  // 메시지 조회
  const { data: messages, error } = await supabase
    .from("messages")
    .select("id, chat_room_id, sender_id, content, image_url, is_read, is_system, plaza_id, created_at")
    .eq("chat_room_id", roomId)
    .limit(200)
    .order("created_at", { ascending: true })

  if (error) {
    console.error('[chat/messages]', error)
    return NextResponse.json({ error: '처리에 실패했습니다' }, { status: 500 })
  }

  // 읽지 않은 메시지 읽음 처리 — fire-and-forget (응답 지연 X)
  void supabase
    .from("messages")
    .update({ is_read: true })
    .eq("chat_room_id", roomId)
    .neq("sender_id", user.id)
    .eq("is_read", false)
    .then(({ error: updErr }) => {
      if (updErr) console.warn('[messages GET] read update failed', updErr.message)
    })

  // 참가자 정보 — buyer/seller + 초대 전문가 프로필을 한 번의 쿼리로 병합
  const participants: any[] = []
  const expertIds = allAcceptedInvites.map((inv: any) => inv.expert_id)
  const allUserIds = [
    ...(room ? [room.buyer_id, room.seller_id] : []),
    ...expertIds,
  ].filter(Boolean)

  if (allUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, nickname, avatar_url, account_type")
      .in("id", [...new Set(allUserIds)])

    for (const p of profiles || []) {
      if (room && p.id === room.buyer_id) participants.push({ ...p, role: "buyer" })
      else if (room && p.id === room.seller_id) participants.push({ ...p, role: "seller" })
      else if (expertIds.includes(p.id)) participants.push({ ...p, role: "expert" })
    }
  }

  return NextResponse.json({ messages, room, participants })
}

// 메시지 전송
// POST handler 시작
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  
  const { user, tokenSource } = await getAuthedUser(supabase, request)

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  }

  // 차단 사용자 체크
  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  // Bearer 인증(모바일)은 supabase 클라에 세션이 안 박혀서 RLS 가 anonymous 로 판정
  // → chat_rooms / expert_invitations SELECT 가 차단되어 권한 확인 단계에서 403 떨어짐.
  // 신원은 이미 토큰으로 검증했으니 read 도 admin client 로 우회.
  let reader: any = supabase
  if (tokenSource === "bearer") {
    try {
      reader = createAdminClient()
    } catch (e) {
      console.error('[chat/messages] admin reader unavailable', e)
    }
  }

  // Rate limit — 채팅 도배 방어 (유저당 1분 30개)
  const limited = await enforceRateLimit(request, CHAT_LIMIT_NAME, user.id)
  if (limited) return limited

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 })
  }
  // 모바일은 chat_room_id, 웹은 roomId 로 보냄 — 둘 다 허용
  const roomId = (body as any).roomId ?? (body as any).chat_room_id
  const content = (body as any).content as string | undefined
  const imageUrlRaw = (body as any).image_url as string | undefined
  const imageUrl = typeof imageUrlRaw === 'string' && imageUrlRaw.trim() ? imageUrlRaw.trim() : null

  // content 또는 image_url 둘 중 하나는 있어야 함 (사진만 보내는 메시지 허용)
  if (!roomId || (!content?.trim() && !imageUrl)) {
    return NextResponse.json({ error: "채팅방 ID와 메시지 내용이 필요합니다" }, { status: 400 })
  }
  // 메시지 길이 제한 — 폭탄 방어
  if (content && content.length > 5000) {
    return NextResponse.json({ error: "메시지가 너무 깁니다 (최대 5000자)" }, { status: 400 })
  }

  // 초대 + 채팅방 조회 병렬 — Bearer 일 때 reader=admin 으로 RLS 우회
  const [inviteRes, roomRes] = await Promise.all([
    reader
      .from("expert_invitations")
      .select("id, chat_room_id")
      .eq("chat_room_id", roomId)
      .eq("expert_id", user.id)
      .eq("status", "accepted")
      .maybeSingle(),
    reader
      .from("chat_rooms")
      .select("*")
      .eq("id", roomId)
      .single(),
  ])
  const acceptedInvite = inviteRes.data
  const room = roomRes.data
  const isInvitedExpert = !!acceptedInvite

  // 권한 확인: buyer/seller이거나 초대 수락한 전문가
  const isParticipant = room && (room.buyer_id === user.id || room.seller_id === user.id)
  const hasAccess = isParticipant || isInvitedExpert

  if (!hasAccess) {
    return NextResponse.json({ error: "접근 권한이 없습니다" }, { status: 403 })
  }

  // 광장 격리 — Bearer 일 때 reader=admin
  const plaza = await getCurrentPlaza()
  const inPlaza = await chatRoomInPlaza(reader, room, plaza)
  if (!inPlaza) {
    return NextResponse.json({ error: "채팅방을 찾을 수 없습니다" }, { status: 404 })
  }

  // 메시지 저장 — 모바일(Bearer) 의 경우 anon 으로 실행되어 RLS 차단되므로
  // admin client 사용 (이미 권한 검증 완료한 상태). 웹 쿠키 세션은 user client 유지.
  let messageWriter: any = supabase
  if (tokenSource === "bearer") {
    try {
      messageWriter = createAdminClient()
    } catch (e) {
      console.error('[chat/messages] admin client unavailable, falling back to user client', e)
    }
  }
  const trimmedContent = content?.trim() || null
  const { data: message, error } = await messageWriter
    .from("messages")
    .insert({
      chat_room_id: roomId,
      sender_id: user.id,
      content: trimmedContent,
      image_url: imageUrl,
    })
    .select()
    .single()

  if (error) {
    console.error('[chat/messages]', error)
    return NextResponse.json({ error: "메시지 전송에 실패했습니다" }, { status: 500 })
  }

  // 채팅방 마지막 메시지 업데이트 — RLS 우회 위해 admin client
  // 사진만 보낸 경우 미리보기는 "[사진]" 으로 표시.
  const lastMessagePreview = trimmedContent ?? "[사진]"
  if (room) {
    await messageWriter
      .from("chat_rooms")
      .update({
        last_message: lastMessagePreview,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", roomId)

    // ─ 알림 발송 ─ (실패해도 메시지 응답은 정상 반환되도록 try/catch)
    try {
      const admin = createAdminClient()

      // 발신자 프로필 (알림 썸네일/닉네임)
      const { data: senderProfile } = await admin
        .from("profiles")
        .select("nickname, avatar_url")
        .eq("id", user.id)
        .maybeSingle()
      const senderName = senderProfile?.nickname || "사용자"

      // 수신자 후보: buyer + seller + 수락된 전문가들, 단 발신자 본인 제외
      const { data: invitedExperts } = await admin
        .from("expert_invitations")
        .select("expert_id")
        .eq("chat_room_id", roomId)
        .eq("status", "accepted")

      const recipients = new Set<string>()
      if (room.buyer_id) recipients.add(room.buyer_id)
      if (room.seller_id) recipients.add(room.seller_id)
      ;(invitedExperts || []).forEach((r: any) => {
        if (r?.expert_id) recipients.add(r.expert_id)
      })
      recipients.delete(user.id)

      const messagePreview = `${senderName}님: ${trimmedContent ? preview(trimmedContent, 50) : "[사진]"}`
      await Promise.all(
        Array.from(recipients).map((uid) =>
          notify(
            admin,
            {
              user_id: uid,
              type: "chat",
              title: "새 메시지",
              message: messagePreview,
              link: `/chat/${roomId}`,
              property_id: room.property_id,
              thumbnail_url: senderProfile?.avatar_url || "https://www.gwangjang.app/app-logo.png",
              actor_id: user.id,
            },
            user.id,
          ),
        ),
      )
    } catch (notifyErr) {
      console.error('[chat/messages] notify block failed (ignored):', notifyErr)
    }
  }

  return NextResponse.json({ message })
}
