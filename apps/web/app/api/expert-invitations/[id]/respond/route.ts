import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse, type NextRequest } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { banGuardResponse } from "@/lib/services/user-ban-guard"

export const dynamic = 'force-dynamic'

// POST: 초대 요청에 응답 (수락/거절)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()
  const { user, tokenSource } = await getAuthedUser(supabase, request)

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  }

  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  const limited = await enforceRateLimit(request, 'mutate', user.id)
  if (limited) return limited

  const body = await request.json()
  const { response } = body // "accepted" 또는 "rejected"

  if (!["accepted", "rejected"].includes(response)) {
    return NextResponse.json({ error: "잘못된 응답" }, { status: 400 })
  }

  // 1. 초대 요청 조회
  const { data: invitation, error: inviteError } = await supabase
    .from("expert_invitations")
    .select("*, chat_room:chat_room_id(*)")
    .eq("id", id)
    .single()

  if (inviteError || !invitation) {
    return NextResponse.json({ error: "초대 요청을 찾을 수 없습니다" }, { status: 404 })
  }

  // 2. 본인에게 온 요청인지 확인
  if (invitation.expert_id !== user.id) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
  }

  // 3. 이미 처리된 요청인지 확인
  if (invitation.status !== "pending") {
    return NextResponse.json({ error: "이미 처리된 요청입니다" }, { status: 400 })
  }

  // 4. 수락인 경우 채팅방 인원 확인 (expert_invitations 테이블로 확인)
  if (response === "accepted") {
    const { data: acceptedInvites } = await supabase
      .from("expert_invitations")
      .select("id")
      .eq("chat_room_id", invitation.chat_room_id)
      .eq("status", "accepted")

    // 이미 수락된 전문가가 있으면 최대 인원 초과 (기본 2명 + 전문가 1명 = 3명)
    if (acceptedInvites && acceptedInvites.length >= 1) {
      return NextResponse.json({ error: "채팅방 최대 인원(3명)을 초과할 수 없습니다" }, { status: 400 })
    }
  }

  // 5. 초대 상태 업데이트 — Bearer 토큰(모바일) → admin client 우회
  let writer: any = supabase
  if (tokenSource === "bearer") {
    try {
      writer = createAdminClient()
    } catch (e) {
      console.error("[expert-invitations respond] admin client unavailable", e)
    }
  }
  const { error: updateError } = await writer
    .from("expert_invitations")
    .update({
      status: response,
      responded_at: new Date().toISOString()
    })
    .eq("id", id)

  if (updateError) {
    console.error("Update invitation error:", updateError)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  // 6. 수락인 경우 시스템 메시지 추가 (참여자 추가는 expert_invitations 상태로 관리)
  if (response === "accepted") {
    const { data: expertProfile } = await supabase
      .from("profiles")
      .select("nickname, full_name, account_type")
      .eq("id", user.id)
      .single()

    const expertName = expertProfile?.nickname || expertProfile?.full_name || "전문가"
    const accountTypeLabels: Record<string, string> = {
      agent: "공인중개사",
      interior: "인테리어 전문가",
      moving: "이사 전문가",
      cleaning: "청소 전문가",
      repair: "수리 전문가",
    }
    const accountTypeLabel =
      accountTypeLabels[expertProfile?.account_type as string] || "전문가"

    await writer
      .from("messages")
      .insert({
        chat_room_id: invitation.chat_room_id,
        sender_id: user.id,
        content: `${expertName}(${accountTypeLabel})님이 채팅방에 참여했습니다.`,
        is_system: true
      })
  }

  // 7. 초대자에게 수락/거절 결과 알림
  try {
    const { data: responderProfile } = await supabase
      .from("profiles")
      .select("nickname, full_name")
      .eq("id", user.id)
      .maybeSingle()
    const responderName =
      responderProfile?.nickname || responderProfile?.full_name || "전문가"

    // 초대자(타인) 의 row 를 생성해야 함.
    //   1순위: admin client (RLS 우회) / 2순위: 일반 client (RLS 정책 허용)
    const payload = {
      user_id: invitation.inviter_id,
      type: "expert_invitation_response",
      title: response === "accepted" ? "전문가 초대 수락" : "전문가 초대 거절",
      message:
        response === "accepted"
          ? `${responderName}님이 초대를 수락했습니다`
          : `${responderName}님이 초대를 거절했습니다`,
      link: response === "accepted" ? `/chat/${invitation.chat_room_id}` : "/invitations",
      property_id: invitation.property_id || null,
      actor_id: user.id,
      ...(plaza ? { plaza_id: plaza } : {}),
    }
    let notifyInsertErr: unknown = null
    let inserted = false
    try {
      const admin = createAdminClient()
      const { error } = await admin.from("notifications").insert(payload)
      if (error) {
        notifyInsertErr = error
        console.warn("[respond] admin insert returned error:", error)
      } else {
        inserted = true
      }
    } catch (adminErr) {
      console.warn("[respond] admin client unavailable:", adminErr)
      notifyInsertErr = adminErr
    }
    if (!inserted) {
      const { error } = await supabase.from("notifications").insert(payload)
      if (error) {
        console.error("[respond] user-client fallback insert error:", error)
        notifyInsertErr = error
      } else {
        inserted = true
        notifyInsertErr = null
      }
    }
    if (!inserted && notifyInsertErr) {
      console.error("[respond] Notification insert FAILED (non-fatal):", notifyInsertErr)
    }
  } catch (notifyErr) {
    console.error("Response notification exception (non-fatal):", notifyErr)
  }

  return NextResponse.json({
    success: true,
    message: response === "accepted" ? "초대를 수락했습니다" : "초대를 거절했습니다",
    chatRoomId: response === "accepted" ? invitation.chat_room_id : null
  })
}
