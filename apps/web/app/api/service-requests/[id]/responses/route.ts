import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { banGuardResponse } from "@/lib/services/user-ban-guard"

export const dynamic = 'force-dynamic'

const SERVICE_TYPE_LABELS: Record<string, string> = {
  interior: "인테리어 전문가",
  moving: "이사 전문가",
  cleaning: "청소 전문가",
  repair: "수리 전문가",
}

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
  const { content } = body

  if (!content || !content.trim()) {
    return NextResponse.json({ error: "내용을 입력해주세요" }, { status: 400 })
  }

  // 요청글 존재 확인 — 광장 검증
  let reqQ: any = (supabase as any)
    .from("service_requests")
    .select("id, user_id, plaza_id, service_type")
    .eq("id", id)
  if (plaza) reqQ = reqQ.eq("plaza_id", plaza)
  const { data: reqRow } = await reqQ.maybeSingle()
  if (!reqRow) return NextResponse.json({ error: "요청글을 찾을 수 없습니다" }, { status: 404 })

  // 응답자 프로필 조회 — 서비스 유형 전문가 검증
  const { data: responderProfile } = await supabase
    .from("profiles")
    .select("nickname, full_name, account_type, role")
    .eq("id", user.id)
    .maybeSingle()

  const accountType = responderProfile?.account_type
  const isAdminUser = responderProfile?.role === "admin" || responderProfile?.role === "superadmin"

  if (!isAdminUser && accountType !== reqRow.service_type) {
    return NextResponse.json(
      { error: "해당 서비스 유형의 전문가만 응답할 수 있습니다" },
      { status: 403 }
    )
  }

  // Bearer 토큰(모바일) → RLS 차단 → admin client 우회
  let writer: any = supabase
  if (tokenSource === "bearer") {
    try {
      writer = createAdminClient()
    } catch (e) {
      console.error("[service-request-responses] admin client unavailable", e)
    }
  }

  const { data, error } = await (writer as any)
    .from("service_request_responses")
    .insert({
      request_id: id,
      user_id: user.id,
      content: content.trim(),
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
      const name = responderProfile?.nickname || responderProfile?.full_name || "누군가"
      const expertLabel = SERVICE_TYPE_LABELS[reqRow.service_type] || "전문가"
      const admin = createAdminClient()
      await admin.from("notifications").insert({
        user_id: reqRow.user_id,
        type: "service_request_response",
        title: `${expertLabel}가 응답했습니다`,
        message: `${name}님이 회원님의 도와주세요 글에 응답했습니다`,
        link: `/service-requests/${id}`,
        actor_id: user.id,
        ...(plaza ? { plaza_id: plaza } : {}),
      })
    } catch (e) {
      console.error("Response notification error (non-fatal):", e)
    }
  }

  return NextResponse.json({ response: data })
}
