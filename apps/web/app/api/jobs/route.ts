import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { NextResponse } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import {
  countUserPostsToday,
  DAILY_POST_LIMIT,
  findKeywordMatches,
  resolveStatusFromMatches,
} from "@/lib/services/moderation"
import { banGuardResponse } from "@/lib/services/user-ban-guard"

// ─── 구인구직 목록 ─────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100)
  const offset = parseInt(searchParams.get("offset") || "0")
  const kind = searchParams.get("kind") // hiring | seeking
  const category = searchParams.get("category")
  const status = searchParams.get("status")
  // 검색어 — Supabase .or() filter injection 방지 (`,` `(` `)` `%` `_` `\` 차단)
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

  let query = supabase
    .from("jobs_posts")
    .select("id, title, category, status, images, created_at, effective_at, user_id, plaza_id")
    .neq("status", "hidden")
    .order("effective_at", { ascending: false })
    .range(offset, offset + limit - 1)

  query = query.eq("plaza_id", plaza)
  if (kind) query = query.eq("kind", kind)
  if (category && category !== "전체") query = query.eq("category", category)
  if (status && status !== "all") query = query.eq("status", status)
  if (q) {
    // PostgREST .or() 가 ',' '(' ')' 를 syntax 로 해석 → 사용자 입력 sanitize
    const safeQ = q.replace(/[,()]/g, '').slice(0, 100)
    if (safeQ) query = query.or(`title.ilike.%${safeQ}%,description.ilike.%${safeQ}%`)
  }

  const { data: posts, error } = await query
  if (error) {
    console.error("[jobs] GET error:", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  if (posts && posts.length > 0) {
    const userIds = [...new Set(posts.map((p) => p.user_id))]
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, nickname, avatar_url")
      .in("id", userIds)
    const pmap = new Map(profiles?.map((p) => [p.id, p]) || [])
    return NextResponse.json({
      posts: posts.map((p) => ({ ...p, profiles: pmap.get(p.user_id) || null })),
    })
  }
  return NextResponse.json({ posts: posts || [] })
}

// ─── 구인구직 작성 ─────────────────────────────────────
export async function POST(request: Request) {
  const supabase = await createClient()
  const { user, tokenSource } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  }

  // 차단 사용자 체크
  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 })

  const {
    kind,
    title,
    description,
    category,
    workType,
    hourlyWage,
    workDays,
    workHours,
    location,
    contact,
    images,
    sub_region,
  } = body

  if (!title || !description) {
    return NextResponse.json(
      { error: "제목과 설명은 필수입니다" },
      { status: 400 },
    )
  }
  if (typeof hourlyWage !== "number" || hourlyWage < 0) {
    return NextResponse.json(
      { error: "시급을 입력해주세요 (원 단위, 시급 협의 시 0)" },
      { status: 400 },
    )
  }
  if (kind && kind !== "hiring" && kind !== "seeking") {
    return NextResponse.json(
      { error: "kind 는 hiring 또는 seeking" },
      { status: 400 },
    )
  }

  // Rate limit
  const todayCount = await countUserPostsToday(supabase, user.id, "jobs_posts")
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

  // 키워드 필터
  const textForScan = [title, description, location, contact].filter(Boolean).join("\n")
  const matches = await findKeywordMatches(supabase, textForScan, "jobs", plaza)
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
    .from("jobs_posts")
    .insert({
      plaza_id: plaza,
      user_id: user.id,
      kind: kind || "hiring",
      title,
      description,
      category: category || "기타",
      work_type: workType,
      hourly_wage: hourlyWage,
      work_days: workDays,
      work_hours: workHours,
      location,
      contact,
      images,
      sub_region: sub_region || null,
      status: decision.status,
      hidden_reason: decision.hiddenReason,
    })
    .select()
    .single()

  if (error) {
    console.error("[jobs] insert error:", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  if (decision.status !== "hidden") {
    const { awardPoints } = await import("@/lib/services/billing/award-helper")
    awardPoints({
      userId: user.id,
      plazaId: plaza,
      ruleId: "jobs.create",
      sourceId: data.id,
      qualityData: { length: (description || "").length },
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
