import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse, type NextRequest } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { banGuardResponse } from "@/lib/services/user-ban-guard"

export const dynamic = 'force-dynamic'

// GET: 내 초대 요청 목록 조회
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)

  if (!user) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get("type") || "received" // received: 받은 요청, sent: 보낸 요청
  const countOnly = searchParams.get("countOnly") === "1"

  // ── 경량 모드: pending 개수만 반환 (invitation-bell 뱃지용)
  //    4개 조인 없는 count-only 쿼리 — 훨씬 빠름
  // 광장 격리: 다른 광장 매물 관련 초대는 카운트에서 제외
  if (countOnly) {
    const column = type === "received" ? "expert_id" : "inviter_id"
    const plaza = await getCurrentPlaza()

    if (plaza) {
      // expert_invitations 자체엔 plaza_id 가 없을 수 있어서
      // property 조인으로 필터해야 정확. 페이지 GET 과 동일한 방식.
      const { data, error: listErr } = await supabase
        .from("expert_invitations")
        .select("id, property:property_id(plaza_id)")
        .eq(column, user.id)
        .eq("status", "pending")
      if (listErr) {
        return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
      }
      const count = (data || []).filter(
        (inv: any) => !inv.property || inv.property.plaza_id === plaza,
      ).length
      return NextResponse.json({ pendingCount: count })
    }

    const { count, error: countErr } = await supabase
      .from("expert_invitations")
      .select("*", { count: "exact", head: true })
      .eq(column, user.id)
      .eq("status", "pending")

    if (countErr) {
      return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
    }
    return NextResponse.json({ pendingCount: count ?? 0 })
  }

  let query = supabase
    .from("expert_invitations")
    .select(`
      *,
      inviter:inviter_id(id, nickname, full_name, avatar_url),
      expert:expert_id(id, nickname, full_name, avatar_url, account_type),
      chat_room:chat_room_id(id, property_id),
      property:property_id(id, title, address, images, plaza_id)
    `)
    .order("created_at", { ascending: false })
    .limit(50)

  if (type === "received") {
    query = query.eq("expert_id", user.id)
  } else {
    query = query.eq("inviter_id", user.id)
  }

  const { data, error } = await query

  if (error) {
    console.error("Get invitations error:", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  // 광장 격리 — 매물이 현재 광장 소속인 초대만 노출 (매물 삭제됐으면 보존)
  const plaza = await getCurrentPlaza()
  const filtered = plaza
    ? (data || []).filter((inv: any) => !inv.property || inv.property.plaza_id === plaza)
    : data

  return NextResponse.json({ invitations: filtered })
}

// POST: 새 초대 요청 생성
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { user, tokenSource } = await getAuthedUser(supabase, request)

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  }

  // 차단 사용자 체크
  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  // Rate limit — 초대 spam 방어 (유저당 1시간 20건)
  const limited = await enforceRateLimit(request, 'invite-expert', user.id)
  if (limited) return limited

  const body = await request.json()
  const { chatRoomId, expertId, propertyId, message } = body

  if (!chatRoomId || !expertId) {
    return NextResponse.json({ error: "필수 정보 누락" }, { status: 400 })
  }

  // 0. 초대자 프로필이 있는지 확인, 없으면 생성
  const { data: inviterProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .single()

  if (!inviterProfile) {
    // 프로필 자동 생성
    const { error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        nickname: user.user_metadata?.nickname || user.email?.split("@")[0] || "사용자",
        account_type: "individual"
      })
    
    if (profileError) {
      console.error("Profile creation error:", profileError)
      return NextResponse.json({ error: "프로필 생성 실패" }, { status: 500 })
    }
  }

  // 현재 광장 — 광장 격리용
  const plaza = await getCurrentPlaza()

  // 1. 채팅방 정보 조회 (buyer_id, seller_id로 기본 참여자 확인)
  const { data: chatRoom, error: roomError } = await supabase
    .from("chat_rooms")
    .select("id, buyer_id, seller_id, plaza_id")
    .eq("id", chatRoomId)
    .single()

  if (roomError || !chatRoom) {
    return NextResponse.json({ error: "채팅방을 찾을 수 없습니다" }, { status: 404 })
  }

  // 광장 격리: 현재 광장의 채팅방만 초대 가능
  if (plaza && (chatRoom as any).plaza_id && (chatRoom as any).plaza_id !== plaza) {
    return NextResponse.json(
      { error: "다른 광장의 채팅방은 초대할 수 없습니다" },
      { status: 403 },
    )
  }

  // 초대자가 채팅방 참여자인지 (buyer 또는 seller) — 무관한 사람이 초대 못 하게
  if (chatRoom.buyer_id !== user.id && chatRoom.seller_id !== user.id) {
    return NextResponse.json(
      { error: "본인이 참여 중인 채팅방만 전문가를 초대할 수 있습니다" },
      { status: 403 },
    )
  }

  // 전문가가 이미 채팅방 참여자인지 확인 (buyer 또는 seller)
  if (chatRoom.buyer_id === expertId || chatRoom.seller_id === expertId) {
    return NextResponse.json({ error: "이미 채팅방에 참여 중인 사용자입니다" }, { status: 400 })
  }

  // 2. 이미 수락된 초대가 있는지 확인 (이미 3번째 참여자가 있는지)
  const { data: acceptedInvites } = await supabase
    .from("expert_invitations")
    .select("id")
    .eq("chat_room_id", chatRoomId)
    .eq("status", "accepted")

  if (acceptedInvites && acceptedInvites.length >= 1) {
    return NextResponse.json({ error: "채팅방 최대 인원(3명)을 초과할 수 없습니다" }, { status: 400 })
  }

  // 3. 이미 대기 중인 초대 요청이 있는지 확인
  const { data: existingInvite } = await supabase
    .from("expert_invitations")
    .select("id, status")
    .eq("chat_room_id", chatRoomId)
    .eq("expert_id", expertId)
    .eq("status", "pending")
    .maybeSingle()

  if (existingInvite) {
    return NextResponse.json({ error: "이미 대기 중인 초대 요청이 있습니다" }, { status: 400 })
  }

  // 4. 초대 요청 생성 — Bearer 토큰(모바일) → RLS 차단 → admin client 우회
  let writer: any = supabase
  if (tokenSource === "bearer") {
    try {
      writer = createAdminClient()
    } catch (e) {
      console.error("[expert-invitations] admin client unavailable", e)
    }
  }
  const { data: invitation, error: inviteError } = await writer
    .from("expert_invitations")
    .insert({
      chat_room_id: chatRoomId,
      inviter_id: user.id,
      expert_id: expertId,
      property_id: propertyId,
      message: message || null,
      status: "pending"
    })
    .select()
    .single()

  if (inviteError) {
    console.error("Create invitation error:", inviteError)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  // 5. 전문가에게 알림 전송 (실패해도 초대는 성공)
  try {
    const { data: inviterProfileInfo } = await supabase
      .from("profiles")
      .select("nickname, full_name")
      .eq("id", user.id)
      .maybeSingle()
    const inviterName =
      inviterProfileInfo?.nickname || inviterProfileInfo?.full_name || "사용자"

    // 알림은 타인(expert)의 row 를 생성해야 함.
    //   1순위: admin client (service role → RLS 우회)
    //   2순위(폴백): 일반 client (notifications_insert_as_actor RLS 정책 활용)
    //     ↳ SUPABASE_SERVICE_ROLE_KEY 미설정 환경에서도 동작하도록
    const payload = {
      user_id: expertId,
      type: "expert_invitation",
      title: "새 전문가 초대 요청",
      message: `${inviterName}님이 채팅방에 초대했습니다`,
      link: "/invitations",
      property_id: propertyId || null,
      actor_id: user.id,
      ...(plaza ? { plaza_id: plaza } : {}),
    }
    let notifyInsertErr: unknown = null
    let inserted = false
    // 1) admin(service role) 시도
    try {
      const admin = createAdminClient()
      const { error } = await admin.from("notifications").insert(payload)
      if (error) {
        notifyInsertErr = error
        console.warn("[invite] admin insert returned error:", error)
      } else {
        inserted = true
      }
    } catch (adminErr) {
      console.warn("[invite] admin client unavailable:", adminErr)
      notifyInsertErr = adminErr
    }
    // 2) 실패 시 일반 client 로 폴백 (notifications_insert_as_actor RLS 필요)
    if (!inserted) {
      const { error } = await supabase.from("notifications").insert(payload)
      if (error) {
        console.error("[invite] user-client fallback insert error:", error)
        notifyInsertErr = error
      } else {
        inserted = true
        notifyInsertErr = null
      }
    }
    if (!inserted && notifyInsertErr) {
      console.error("[invite] Notification insert FAILED (non-fatal):", notifyInsertErr)
    }
  } catch (notifyErr) {
    console.error("Notification insert exception (non-fatal):", notifyErr)
  }

  return NextResponse.json({ invitation, message: "초대 요청을 보냈습니다" })
}
