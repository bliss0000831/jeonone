import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { banGuardResponse } from "@/lib/services/user-ban-guard"

// 채팅방 신고 — 관리자에게 알림 전달
//   body: { reason: string, detail?: string }
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

  const body = await request.json().catch(() => ({}))
  const reason: string | undefined = body?.reason
  const detail: string | undefined = body?.detail
  if (!reason) {
    return NextResponse.json({ error: "신고 사유가 필요합니다" }, { status: 400 })
  }

  const admin = createAdminClient()

  // 채팅방의 plaza_id 조회 — 알림 행에도 박아 광장별 카운트와 매칭
  const { data: room } = await admin
    .from("chat_rooms")
    .select("plaza_id")
    .eq("id", roomId)
    .maybeSingle()
  const roomPlaza = (room as any)?.plaza_id ?? null

  // 본인에게 접수 알림 — 별도 테이블 없이도 추적 가능
  await admin.from("notifications").insert({
    user_id: user.id,
    type: "system",
    title: "신고 접수 완료",
    message: `채팅방 신고가 접수되었습니다. 사유: ${reason}${detail ? ` / ${detail}` : ""}`,
    ...(roomPlaza ? { plaza_id: roomPlaza } : {}),
  })

  console.warn("[chat-report]", {
    reporter: user.id,
    roomId,
    reason,
    detail,
    at: new Date().toISOString(),
  })

  return NextResponse.json({ success: true })
}
