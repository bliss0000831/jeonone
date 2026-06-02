import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { banGuardResponse } from "@/lib/services/user-ban-guard"

export const dynamic = 'force-dynamic'

// POST: 요청글에 응답(댓글) 달기
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()
  const { user, tokenSource } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })

  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  const body = await request.json()
  const { content, propertyId } = body

  if (!content || !content.trim()) {
    return NextResponse.json({ error: "내용을 입력해주세요" }, { status: 400 })
  }

  // 요청글 존재 확인 — plaza_id 불일치 허용 (기존 데이터 호환)
  const { data: reqRow } = await supabase
    .from("property_requests")
    .select("id, user_id, plaza_id")
    .eq("id", id)
    .maybeSingle()
  if (!reqRow) return NextResponse.json({ error: "요청글을 찾을 수 없습니다" }, { status: 404 })

  // Bearer 토큰(모바일) → RLS 차단 → admin client 우회
  let writer: any = supabase
  if (tokenSource === "bearer") {
    try {
      writer = createAdminClient()
    } catch (e) {
      console.error("[property-request-responses] admin client unavailable", e)
    }
  }

  const { data, error } = await writer
    .from("property_request_responses")
    .insert({
      request_id: id,
      user_id: user.id,
      content: content.trim(),
      property_id: propertyId || null,
    })
    .select()
    .single()

  if (error) {
    console.error("Create response error:", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  // 요청자에게 알림 (본인 응답 제외)
  if (reqRow.user_id !== user.id) {
    try {
      const { data: responderProfile } = await supabase
        .from("profiles")
        .select("nickname, full_name, account_type")
        .eq("id", user.id)
        .maybeSingle()
      const name = responderProfile?.nickname || responderProfile?.full_name || "누군가"
      const isAgent = responderProfile?.account_type === "agent"
      const admin = createAdminClient()
      await admin.from("notifications").insert({
        user_id: reqRow.user_id,
        type: "property_request_response",
        title: isAgent ? "공인중개사가 매물을 추천했습니다" : "새 응답이 도착했습니다",
        message: `${name}님이 회원님의 구해주세요 글에 응답했습니다`,
        link: `/requests/${id}`,
        actor_id: user.id,
        ...(plaza ? { plaza_id: plaza } : {}),
      })
    } catch (e) {
      console.error("Response notification error (non-fatal):", e)
    }
  }

  return NextResponse.json({ response: data })
}
