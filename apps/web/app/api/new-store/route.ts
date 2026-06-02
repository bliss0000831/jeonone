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
  const limit = parseInt(searchParams.get("limit") || "20")
  const offset = parseInt(searchParams.get("offset") || "0")
  const category = searchParams.get("category")

  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  if (!plaza) {
    return NextResponse.json({ error: "광장이 지정되지 않았습니다" }, { status: 400 })
  }

  let query = (supabase as any)
    .from("new_store_posts")
    .select("id, title, category, status, images, thumbnail, created_at, effective_at, user_id, plaza_id, price")
    .eq("status", "active")
    .order("effective_at", { ascending: false })
    .range(offset, offset + limit - 1)

  query = query.eq("plaza_id", plaza)
  if (category) {
    query = query.eq("category", category)
  }

  const { data: posts, error } = await query

  if (error) {
    console.error("[v0] New-store GET error:", error)
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

  const plaza = await getCurrentPlaza()
  // 🅲 광장 격리 — plaza_profiles.account_type 우선 권한 확인
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("account_type")
    .eq("id", user.id)
    .single()
  if (profileError) {
    console.error("[v0] Profile fetch error:", profileError)
    return NextResponse.json({ error: "프로필 정보를 불러올 수 없습니다" }, { status: 500 })
  }
  let effectiveAccountType: string | null = profile?.account_type ?? null
  if (plaza) {
    const { data: pp } = await supabase
      .from("plaza_profiles")
      .select("account_type")
      .eq("user_id", user.id)
      .eq("plaza_id", plaza)
      .maybeSingle()
    if ((pp as any)?.account_type) effectiveAccountType = (pp as any).account_type
  }
  if (effectiveAccountType !== "business") {
    console.error("[v0] Account type check failed. effectiveAccountType:", effectiveAccountType)
    return NextResponse.json({ error: "사장님 계정만 신장개업을 등록할 수 있습니다" }, { status: 403 })
  }

  const body = await request.json()
  const {
    store_name, description, category, address, phone,
    opening_date, opening_event, images, sub_region
  } = body

  if (!store_name || !description || !category || !address) {
    return NextResponse.json({ error: "필수 정보를 입력해주세요" }, { status: 400 })
  }

  if (images && (!Array.isArray(images) || images.some((i: any) => typeof i !== 'string'))) {
    return NextResponse.json({ error: "잘못된 이미지 형식" }, { status: 400 })
  }

  if (!plaza) {
    return NextResponse.json({ error: "광장 도메인에서 작성해주세요" }, { status: 400 })
  }

  // 키워드 필터
  const textForScan = [store_name, description, address, opening_event].filter(Boolean).join("\n")
  const matches = await findKeywordMatches(supabase, textForScan, "new-store", plaza)
  const kDecision = resolveStatusFromMatches(matches)

  if (kDecision.block) {
    return NextResponse.json(
      {
        error: `등록할 수 없는 내용이 포함되어 있습니다 (${kDecision.blockReason})`,
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
    .from("new_store_posts")
    .insert({
      plaza_id: plaza,
      user_id: user.id,
      store_name,
      description,
      category,
      address,
      phone,
      opening_date,
      opening_event,
      images,
      sub_region: sub_region || null,
      status: kDecision.status === "hidden" ? "hidden" : "active",
      hidden_reason: kDecision.hiddenReason
    })
    .select()
    .single()

  if (error) {
    console.error("[v0] New store insert error:", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  const { awardPoints } = await import("@/lib/services/billing/award-helper")
  awardPoints({
    userId: user.id,
    plazaId: plaza,
    ruleId: "new_store.create",
    sourceId: data.id,
    qualityData: {
      length: (description || "").length,
      has_image: Array.isArray(images) && images.length > 0,
    },
  })

  return NextResponse.json({ post: data }, { status: 201 })
}
