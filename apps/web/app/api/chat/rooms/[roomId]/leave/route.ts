import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit } from '@/lib/services/ratelimit'
import { banGuardResponse } from "@/lib/services/user-ban-guard"

// 채팅방 나가기
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params
  const supabase = await createClient()

  const { user } = await getAuthedUser(supabase, request)

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  }

  // 차단 사용자 체크
  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  if (!roomId) {
    return NextResponse.json(
      { error: "채팅방 ID가 필요합니다" },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  // 채팅방 조회
  const { data: room } = await admin
    .from("chat_rooms")
    .select("*")
    .eq("id", roomId)
    .single()

  if (!room) {
    return NextResponse.json(
      { error: "채팅방을 찾을 수 없습니다" },
      { status: 404 },
    )
  }

  const isBuyer = room.buyer_id === user.id
  const isSeller = room.seller_id === user.id

  // 초대받은 전문가인지 확인
  const { data: invite } = await admin
    .from("expert_invitations")
    .select("id")
    .eq("chat_room_id", roomId)
    .eq("expert_id", user.id)
    .eq("status", "accepted")
    .maybeSingle()

  if (!isBuyer && !isSeller && !invite) {
    return NextResponse.json(
      { error: "참여 중인 채팅방이 아닙니다" },
      { status: 403 },
    )
  }

  // 초대받은 전문가: 초대 상태를 left 로 변경하여 목록에서 제외
  if (invite && !isBuyer && !isSeller) {
    const { error: updateError } = await admin
      .from("expert_invitations")
      .update({ status: "left" })
      .eq("id", invite.id)

    if (updateError) {
      // left 상태를 지원하지 않는 스키마면 행 자체 삭제로 폴백
      const { error: deleteError } = await admin
        .from("expert_invitations")
        .delete()
        .eq("id", invite.id)

      if (deleteError) {
        return NextResponse.json(
          { error: "처리에 실패했습니다" },
          { status: 500 },
        )
      }
    }

    return NextResponse.json({ success: true })
  }

  // buyer 또는 seller: 채팅방 및 관련 메시지/초대 전체 삭제
  await admin.from("messages").delete().eq("chat_room_id", roomId)
  await admin.from("expert_invitations").delete().eq("chat_room_id", roomId)
  const { error: roomDeleteError } = await admin
    .from("chat_rooms")
    .delete()
    .eq("id", roomId)

  if (roomDeleteError) {
    return NextResponse.json(
      { error: "처리에 실패했습니다" },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true })
}
