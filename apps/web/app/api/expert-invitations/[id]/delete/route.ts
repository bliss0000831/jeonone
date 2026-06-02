import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse, type NextRequest } from "next/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { banGuardResponse } from "@/lib/services/user-ban-guard"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { user } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  }

  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  // Rate limit — 도배/스캔 방어 (인증된 유저 기준)
  const limited = await enforceRateLimit(request, "mutate", user.id)
  if (limited) return limited

  // 1. 초대 조회 (본인이 당사자인지 + 처리된 상태인지 확인)
  const { data: invitation, error: fetchErr } = await supabase
    .from("expert_invitations")
    .select("id, expert_id, inviter_id, status")
    .eq("id", id)
    .maybeSingle()

  if (fetchErr || !invitation) {
    return NextResponse.json({ error: "초대 요청을 찾을 수 없습니다" }, { status: 404 })
  }

  const isExpert = invitation.expert_id === user.id
  const isInviter = invitation.inviter_id === user.id
  if (!isExpert && !isInviter) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
  }

  // 전문가(수신자)는 "처리된" 초대만 본인 목록에서 지울 수 있음.
  //   — pending 상태는 거절/수락으로만 처리해야 함.
  if (isExpert && !isInviter && invitation.status === "pending") {
    return NextResponse.json(
      { error: "대기 중인 초대는 수락/거절로만 처리할 수 있습니다" },
      { status: 400 },
    )
  }

  // RLS 정책은 inviter 만 DELETE 허용이므로,
  // expert 가 본인 목록을 정리하려 할 때는 admin client 로 우회.
  // (권한 검증은 위에서 이미 완료)
  const admin = createAdminClient()
  const { error } = await admin
    .from("expert_invitations")
    .delete()
    .eq("id", id)

  if (error) {
    console.error("[expert-invitations delete]", error)
    return NextResponse.json({ error: "삭제에 실패했습니다" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
