import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { NextResponse, type NextRequest } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { banGuardResponse } from "@/lib/services/user-ban-guard"
import {
  findKeywordMatches,
  resolveStatusFromMatches,
} from "@/lib/services/moderation"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100)
  const offset = parseInt(searchParams.get("offset") || "0")
  const status = searchParams.get("status")
  // 지역(시군) 필터 — region_id(uuid) 기준
  const region = searchParams.get("region")
  // 정렬 — 미지정 시 기존 동작(created_at desc) 보존
  const sort = searchParams.get("sort")

  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  if (!plaza) {
    return NextResponse.json({ error: "광장이 지정되지 않았습니다" }, { status: 400 })
  }

  let query = (supabase as any)
    .from("sharing_posts")
    .select("id, user_id, plaza_id, region_id, title, description, category, status, images, location, views, likes, created_at")
    .range(offset, offset + limit - 1)

  // 정렬 — sort 미지정/잘못된 값이면 기존 동작(created_at desc) 그대로.
  // 나눔은 무료 → 가격 정렬 없음 (price_asc/desc 는 created_at 폴백).
  switch (sort) {
    case "popular":
      query = query.order("likes", { ascending: false }).order("views", { ascending: false }).order("created_at", { ascending: false })
      break
    case "views":
      query = query.order("views", { ascending: false }).order("created_at", { ascending: false })
      break
    default:
      query = query.order("created_at", { ascending: false })
  }

  query = query.eq("plaza_id", plaza)
  if (status) {
    query = query.eq("status", status)
  }
  // 지역 필터 — region_id 일치
  if (region && region !== "all") query = query.eq("region_id", region)

  const { data: posts, error } = await query

  if (error) {
    console.error("[v0] Sharing GET error:", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  // Fetch profiles separately
  if (posts && posts.length > 0) {
    const userIds = [...new Set(posts.map((p: any) => p.user_id))]
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, nickname, avatar_url")
      .in("id", userIds as string[])

    const profileMap = new Map(profiles?.map((p) => [p.id, p]) || [])
    const postsWithProfiles = posts.map((post: any) => ({
      ...post,
      profiles: profileMap.get(post.user_id) || null
    }))

    return NextResponse.json({ posts: postsWithProfiles })
  }

  return NextResponse.json({ posts: posts || [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const { user, tokenSource } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  }

  // 차단 사용자 체크
  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  // Rate limit — 글 작성 도배 방지 (clubs/board 와 동일 패턴)
  const limited = await enforceRateLimit(request as NextRequest, "post", user.id)
  if (limited) return limited

  // Get user profile to check permissions
  const { error: profileError } = await supabase
    .from("profiles")
    .select("account_type")
    .eq("id", user.id)
    .single()

  if (profileError) {
    console.error("[v0] Profile error:", profileError)
    return NextResponse.json({ error: "프로필 정보를 불러올 수 없습니다" }, { status: 500 })
  }

  // Allow all users to share (공유 기능은 일반 사용자도 가능)
  const body = await request.json()
  const { title, description, category, images, location, sub_region } = body

  if (!title || !description) {
    return NextResponse.json({ error: "제목과 설명은 필수입니다" }, { status: 400 })
  }

  if (images && (!Array.isArray(images) || images.some((i: any) => typeof i !== 'string'))) {
    return NextResponse.json({ error: "잘못된 이미지 형식" }, { status: 400 })
  }

  const plaza = await getCurrentPlaza()
  if (!plaza) {
    return NextResponse.json({ error: "광장 도메인에서 작성해주세요" }, { status: 400 })
  }

  // 키워드 필터
  const textForScan = [title, description, location].filter(Boolean).join("\n")
  const matches = await findKeywordMatches(supabase, textForScan, "sharing", plaza)
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
  // 호출자 신원은 getAuthedUser 로 이미 검증 완료 → service_role writer 사용
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
    .from("sharing_posts")
    .insert({
      plaza_id: plaza,
      user_id: user.id,
      title,
      description,
      category: category || "기타",
      images,
      location,
      sub_region: sub_region || null,
      status: decision.status,
      hidden_reason: decision.hiddenReason,
    })
    .select()
    .single()

  if (error) {
    console.error("[v0] Sharing insert error:", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  // 포인트 적립 (Feature Flag OFF 시 silent no-op)
  const { awardPoints } = await import("@/lib/services/billing/award-helper")
  awardPoints({
    userId: user.id,
    plazaId: plaza,
    ruleId: "sharing.create",
    sourceId: data.id,
    qualityData: {
      length: (description || "").length,
      has_image: Array.isArray(images) && images.length > 0,
    },
  })

  return NextResponse.json({ post: data }, { status: 201 })
}
