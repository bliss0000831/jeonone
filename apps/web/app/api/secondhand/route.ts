import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { NextResponse, type NextRequest } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import {
  countUserPostsToday,
  DAILY_POST_LIMIT,
  findKeywordMatches,
  resolveStatusFromMatches,
} from "@/lib/services/moderation"
import { banGuardResponse } from "@/lib/services/user-ban-guard"

// ─── 중고거래 목록 조회 ──────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100)
  const offset = parseInt(searchParams.get("offset") || "0")
  const status = searchParams.get("status")
  const category = searchParams.get("category")
  // 검색어 — Supabase .or() filter injection 방지
  const q = searchParams
    .get("q")
    ?.replace(/[\\%_,();:.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)

  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  if (!plaza) {
    return NextResponse.json({ error: "광장이 지정되지 않았습니다" }, { status: 400 })
  }

  let query = (supabase as any)
    .from("secondhand_posts")
    .select("id, user_id, plaza_id, title, description, category, price, is_price_negotiable, images, location, condition, brand, model_name, model_year, usage_hours, horsepower, listing_type, status, effective_at, bumped_at, created_at, views, likes")
    .neq("status", "hidden")
    .order("effective_at", { ascending: false })
    .range(offset, offset + limit - 1)

  query = query.eq("plaza_id", plaza)
  if (status && status !== "all") query = query.eq("status", status)
  if (category && category !== "전체") query = query.eq("category", category)
  if (q) {
    const safeQ = q.replace(/[,()]/g, '').slice(0, 100)
    if (safeQ) query = query.or(`title.ilike.%${safeQ}%,description.ilike.%${safeQ}%`)
  }

  const { data: posts, error } = await query
  if (error) {
    console.error("[secondhand] GET error:", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  // profile join
  if (posts && posts.length > 0) {
    const userIds = Array.from(new Set((posts as any[]).map((p: any) => p.user_id))) as string[]
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, nickname, avatar_url")
      .in("id", userIds)
    const pmap = new Map(profiles?.map((p) => [p.id, p]) || [])
    return NextResponse.json({
      posts: posts.map((p: any) => ({ ...p, profiles: pmap.get(p.user_id) || null })),
    })
  }
  return NextResponse.json({ posts: posts || [] })
}

// ─── 중고거래 작성 ──────────────────────────────────────
export async function POST(request: Request) {
  const supabase = await createClient()
  const { user, tokenSource } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  }

  // 차단 사용자 체크
  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  // Rate limit — 글 작성 도배 방지
  const limited = await enforceRateLimit(request as NextRequest, "post", user.id)
  if (limited) return limited

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 })
  }

  const {
    title,
    description,
    category,
    price,
    isPriceNegotiable,
    images,
    location,
    condition,
    sub_region,
    // 농기구 전용 필드
    brand,
    model_name,
    model_year,
    usage_hours,
    horsepower,
    listing_type,
  } = body

  const toInt = (v: any): number | null => {
    const n = parseInt(v, 10)
    return Number.isFinite(n) && n >= 0 ? n : null
  }
  const toStr = (v: any, max = 40): string | null =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null

  if (!title || !description) {
    return NextResponse.json(
      { error: "제목과 설명은 필수입니다" },
      { status: 400 },
    )
  }
  if (typeof price !== "number" || price < 0) {
    return NextResponse.json(
      { error: "가격을 올바르게 입력해주세요 (0 = 가격제안/나눔)" },
      { status: 400 },
    )
  }

  // ─── Rate limit (하루 3건) ────────────────────────
  const todayCount = await countUserPostsToday(supabase, user.id, "secondhand_posts")
  if (todayCount >= DAILY_POST_LIMIT) {
    return NextResponse.json(
      {
        error: `하루 ${DAILY_POST_LIMIT}건까지만 등록할 수 있습니다 (현재 ${todayCount}건)`,
        code: "RATE_LIMIT",
      },
      { status: 429 },
    )
  }

  const plaza = await getCurrentPlaza()
  if (!plaza) {
    return NextResponse.json({ error: "광장 도메인에서 작성해주세요" }, { status: 400 })
  }

  // ─── 키워드 필터 ───────────────────────────────────
  const textForScan = [title, description, location].filter(Boolean).join("\n")
  const matches = await findKeywordMatches(supabase, textForScan, "secondhand", plaza)
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
    .from("secondhand_posts")
    .insert({
      plaza_id: plaza,
      user_id: user.id,
      title,
      description,
      category: category || "기타",
      price,
      is_price_negotiable: !!isPriceNegotiable,
      images,
      location,
      condition:
        typeof condition === "string" && condition.trim()
          ? condition.trim().slice(0, 20)
          : null,
      sub_region: sub_region || null,
      brand: toStr(brand),
      model_name: toStr(model_name),
      model_year: toInt(model_year),
      usage_hours: toInt(usage_hours),
      horsepower: toInt(horsepower),
      listing_type: ["sale", "rental", "auction"].includes(listing_type) ? listing_type : "sale",
      status: decision.status,
      hidden_reason: decision.hiddenReason,
    })
    .select()
    .single()

  if (error) {
    console.error("[secondhand] insert error:", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  // 포인트 적립 — flagged 가 아닐 때만 (자동 숨김 안 된 경우)
  if (decision.status !== "hidden") {
    const { awardPoints } = await import("@/lib/services/billing/award-helper")
    awardPoints({
      userId: user.id,
      plazaId: plaza,
      ruleId: "secondhand.create",
      sourceId: data.id,
      qualityData: {
        length: (description || "").length,
        has_image: Array.isArray(images) && images.length > 0,
      },
    })
  }

  return NextResponse.json(
    {
      post: data,
      flagged: decision.status === "hidden",
      flagReason: decision.hiddenReason,
    },
    { status: 201 },
  )
}
