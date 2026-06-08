import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { banGuardResponse } from "@/lib/services/user-ban-guard"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100)
  const offset = parseInt(searchParams.get("offset") || "0")
  const category = searchParams.get("category")
  const district = searchParams.get("district")
  // 지역(시군) 필터 — region_id(uuid) 기준 (모바일과 동일). 기존 district(문자열) 와 별개·하위호환.
  const region = searchParams.get("region")
  // 정렬 — 미지정 시 기존 동작(effective_at desc) 보존
  const sort = searchParams.get("sort")

  // Parallelize plaza lookup + auth — both are independent of each other
  const [plaza, { user }] = await Promise.all([
    getCurrentPlaza(),
    getAuthedUser(supabase, request),
  ])

  if (!plaza) {
    return NextResponse.json({ error: "광장이 지정되지 않았습니다" }, { status: 400 })
  }

  let query = supabase
    .from("local_food")
    .select("id, title, description, category, unit, status, images, thumbnail, location, district, region_id, view_count, like_count, price, original_price, user_id, plaza_id, created_at, bumped_at, effective_at")
    .range(offset, offset + limit - 1)

  // 정렬 — sort 미지정/잘못된 값이면 기존 동작(effective_at desc) 그대로.
  // 로컬푸드는 좋아요/조회 컬럼명이 like_count/view_count.
  // price 는 nullable → 가격 정렬 시 NULL(가격문의) 은 nullsLast 로 항상 뒤로.
  switch (sort) {
    case "popular":
      query = query.order("like_count", { ascending: false }).order("view_count", { ascending: false }).order("effective_at", { ascending: false })
      break
    case "price_asc":
      query = query.order("price", { ascending: true, nullsFirst: false }).order("effective_at", { ascending: false })
      break
    case "price_desc":
      query = query.order("price", { ascending: false, nullsFirst: false }).order("effective_at", { ascending: false })
      break
    case "views":
      query = query.order("view_count", { ascending: false }).order("effective_at", { ascending: false })
      break
    default:
      query = query.order("effective_at", { ascending: false })
  }

  query = query.eq("plaza_id", plaza)
  if (category && category !== "전체") {
    query = query.eq("category", category)
  }

  if (district && district !== "전체" && district !== "춘천시 전체") {
    query = query.eq("district", district)
  }
  // 지역 필터 — region_id 일치
  if (region && region !== "all") query = query.eq("region_id", region)

  const { data: posts, error } = await query

  if (error) {
    console.error("Local food fetch error:", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  if (posts && posts.length > 0) {
    const userIds = [...new Set(posts.map((p: any) => p.user_id))]

    // Parallelize profiles + user-likes fetches
    const [{ data: profiles }, likesResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, nickname, avatar_url")
        .in("id", userIds),
      user
        ? supabase
            .from("local_food_likes")
            .select("local_food_id")
            .eq("user_id", user.id)
        : Promise.resolve({ data: null }),
    ])

    const profileMap = new Map(profiles?.map(p => [p.id, p]) || [])
    const likedIds = new Set((likesResult as any).data?.map((l: any) => l.local_food_id) || [])

    posts.forEach((post: any) => {
      post.author = profileMap.get(post.user_id) || null
      if (user) post.user_liked = likedIds.has(post.id)
    })
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

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 })
  }

  if (!body.title || typeof body.title !== 'string' || body.title.length > 200) {
    return NextResponse.json({ error: "제목이 올바르지 않습니다" }, { status: 400 })
  }
  if (body.description && body.description.length > 5000) {
    return NextResponse.json({ error: "설명이 너무 깁니다" }, { status: 400 })
  }
  if (body.images && (!Array.isArray(body.images) || body.images.some((i: any) => typeof i !== 'string'))) {
    return NextResponse.json({ error: "잘못된 이미지 형식" }, { status: 400 })
  }

  const plaza = await getCurrentPlaza()

  // 🅲 광장 격리 — plaza_profiles.account_type 우선 권한 확인
  const { data: profile } = await supabase
    .from("profiles")
    .select("account_type")
    .eq("id", user.id)
    .single()
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
  if (!effectiveAccountType || !["producer", "admin"].includes(effectiveAccountType)) {
    return NextResponse.json({ error: "생산자 또는 관리자 권한이 필요합니다" }, { status: 403 })
  }
  if (!plaza) {
    return NextResponse.json({ error: "광장 도메인에서 작성해주세요" }, { status: 400 })
  }

  // plaza_profiles 가 없으면 자동 가입 — RLS 가 user_in_plaza() 를 요구
  // service_role 로 우회 — 본인 신원은 위에서 이미 검증 완료
  try {
    const { getAdminWriteClient } = await import("@/lib/services/admin-auth")
    const admin = await getAdminWriteClient()
    if (admin) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("nickname")
        .eq("id", user.id)
        .maybeSingle()
      const { error: ppErr } = await admin
        .from("plaza_profiles")
        .upsert(
          {
            user_id: user.id,
            plaza_id: plaza,
            nickname: (prof as any)?.nickname ?? null,
            is_active: true,
          },
          { onConflict: "user_id,plaza_id" },
        )
      if (ppErr) console.error("[local-food POST] plaza_profiles upsert error:", ppErr)
    }
  } catch (e) {
    console.error("[local-food POST] plaza_profiles ensure failed:", e)
  }

  const basePayload: Record<string, any> = {
    plaza_id: plaza,
    title: body.title,
    description: body.description,
    content: body.content,
    price: body.price,
    original_price: body.original_price,
    unit: body.unit || "1kg",
    category: body.category || "채소",
    images: body.images || [],
    location: body.location,
    district: body.district,
    farm_name:
      typeof body.farm_name === "string" && body.farm_name.trim()
        ? body.farm_name.trim().slice(0, 60)
        : null,
    shipping_fee: body.free_shipping
      ? 0
      : Math.max(0, Math.floor(Number(body.shipping_fee) || 0)),
    free_shipping: !!body.free_shipping,
    sub_region: body.sub_region || null,
    user_id: user.id,
  }

  // Bearer 토큰(모바일) 경로에선 supabase client 가 anonymous 로 실행되어
  // RLS auth.uid() = user_id 가 null 로 실패 → service_role writer 사용.
  let writer: any = supabase
  if (tokenSource === "bearer") {
    const { getAdminWriteClient } = await import("@/lib/services/admin-auth")
    const wc = await getAdminWriteClient()
    if (!wc) {
      console.error("[local-food POST] service_role unavailable for bearer auth")
      return NextResponse.json(
        { error: "서버 설정 오류 (service_role 키 누락)" },
        { status: 500 },
      )
    }
    writer = wc
  }

  // 1차 시도: visibility 포함
  let { data, error } = await writer
    .from("local_food")
    .insert({
      ...basePayload,
      visibility: body.visibility === "national" ? "national" : "plaza",
    })
    .select()
    .single()

  // 2차 fallback: visibility 컬럼 없는 환경 — 마이그레이션 전 대비
  if (error && /visibility/i.test(error.message || "")) {
    console.warn("[local-food create] visibility 컬럼 없음 — fallback INSERT")
    const retry = await writer
      .from("local_food")
      .insert(basePayload)
      .select()
      .single()
    data = retry.data
    error = retry.error
  }

  if (error) {
    console.error("Local food create error:", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  const { awardPoints } = await import("@/lib/services/billing/award-helper")
  awardPoints({
    userId: user.id,
    plazaId: plaza,
    ruleId: "local_food.create",
    sourceId: data.id,
    qualityData: {
      length: (body.description || body.content || "").length,
      has_image: Array.isArray(body.images) && body.images.length > 0,
    },
  })

  return NextResponse.json({ post: data })
}
