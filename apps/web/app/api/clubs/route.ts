import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { NextResponse, type NextRequest } from "next/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { banGuardResponse } from "@/lib/services/user-ban-guard"
import {
  findKeywordMatches,
  resolveStatusFromMatches,
} from "@/lib/services/moderation"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  // 페이지네이션 — 정수 검증 + 상한 100건 (DoS 방어)
  const limit = Math.max(1, Math.min(parseInt(searchParams.get("limit") || "20") || 20, 100))
  const offset = Math.max(0, parseInt(searchParams.get("offset") || "0") || 0)
  const category = searchParams.get("category")
  const status = searchParams.get("status")

  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  let query = supabase
    .from("clubs")
    .select("id, user_id, plaza_id, title, description, content, category, sport_type, location, district, meeting_date, meeting_time, max_members, current_members, skill_level, images, status, view_count, like_count, created_at, updated_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (plaza) query = query.eq("plaza_id", plaza)
  if (category && category !== "전체") {
    query = query.eq("category", category)
  }
  if (status) {
    query = query.eq("status", status)
  }

  const { data: posts, error } = await query

  if (error) {
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  if (posts && posts.length > 0) {
    const userIds = [...new Set(posts.map((p) => p.user_id))]
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, nickname, avatar_url")
      .in("id", userIds)

    const profileMap = new Map(profiles?.map((p) => [p.id, p]) || [])

    const postsWithProfiles = posts.map((post) => ({
      ...post,
      profiles: profileMap.get(post.user_id) || null,
    }))

    return NextResponse.json({ posts: postsWithProfiles })
  }

  return NextResponse.json({ posts: posts || [] })
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

  // Rate limit — 유저당 10분 10개
  const limited = await enforceRateLimit(request, 'post', user.id)
  if (limited) return limited

  const body = await request.json()
  const {
    title, description, content, category, sport_type,
    location, district, meeting_date, meeting_time,
    max_members, skill_level, images, sub_region,
  } = body

  if (!title || !category) {
    return NextResponse.json({ error: "필수 정보를 입력해주세요" }, { status: 400 })
  }

  if (images && (!Array.isArray(images) || images.some((i: any) => typeof i !== 'string'))) {
    return NextResponse.json({ error: "잘못된 이미지 형식" }, { status: 400 })
  }

  const plaza = await getCurrentPlaza()
  if (!plaza) {
    return NextResponse.json({ error: "광장 도메인에서 작성해주세요" }, { status: 400 })
  }

  // 키워드 필터
  const textForScan = [title, description, content, location].filter(Boolean).join("\n")
  const matches = await findKeywordMatches(supabase, textForScan, "clubs", plaza)
  const decision = resolveStatusFromMatches(matches)

  if (decision.block) {
    return NextResponse.json(
      {
        error: `등록할 수 없는 내용이 포함되어 있습니다 (${decision.blockReason})`,
        code: "KEYWORD_BLOCKED",
      },
      { status: 400 },
    )
  }

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

  const { data, error } = await writer
    .from("clubs")
    .insert({
      plaza_id: plaza,
      user_id: user.id,
      title,
      description,
      content,
      category,
      sport_type,
      location,
      district,
      meeting_date,
      meeting_time,
      max_members: max_members || 10,
      skill_level: skill_level || "누구나",
      images,
      sub_region: sub_region || null,
      status: decision.status === "hidden" ? "hidden" : "recruiting",
      hidden_reason: decision.hiddenReason,
    })
    .select()
    .single()

  if (error) {
    console.error("[clubs] insert error:", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  const { awardPoints } = await import("@/lib/services/billing/award-helper")
  awardPoints({
    userId: user.id,
    plazaId: plaza,
    ruleId: "club.create",
    sourceId: data.id,
    qualityData: { length: (description || "").length },
  })

  return NextResponse.json({ post: data })
}
