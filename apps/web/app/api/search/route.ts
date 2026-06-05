import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { getCurrentPlaza } from "@/lib/plaza/server"
import type { SearchCategory, SearchHit, SearchSort } from "@gwangjang/types/search"

export type { SearchCategory, SearchHit }

/**
 * 통합 검색 API
 *
 * GET /api/search?q=키워드&scope=all&limit=10&sort=latest
 *
 * scope:
 *  - all : 전체 카테고리에서 각 limit 건씩 (미리보기)
 *  - board | sharing | local_food | profiles
 *
 * sort:
 *  - latest  : 최신순 (default)
 *  - popular : 조회수/좋아요 기준
 */

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50

const EMPTY_RESULTS: Record<SearchCategory, SearchHit[]> = {
  secondhand: [], local_food: [], sharing: [], jobs: [], board: [], profiles: [],
}
const EMPTY_COUNTS: Record<SearchCategory, number> = {
  secondhand: 0, local_food: 0, sharing: 0, jobs: 0, board: 0, profiles: 0,
}

/**
 * Supabase `.or()` filter 에 들어갈 검색어를 안전하게 escape.
 *
 * 위험 문자:
 *   - `,` `(` `)` : 필터 구문 종결자/그룹화 — operator injection
 *   - `%` `_` : SQL LIKE wildcard — 사용자가 와일드카드 의도 차단
 *   - `\` : escape 자체 — 백슬래시 깨면 다 깨짐
 *   - `;` `:` : 안전 차원 (Postgres 식 구분자)
 */
function esc(term: string) {
  return term
    .replace(/[\\%_,();:.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function firstImage(images: unknown): string | null {
  if (Array.isArray(images) && images.length > 0 && typeof images[0] === "string") {
    return images[0]
  }
  return null
}

type CategoryConfig = {
  category: SearchCategory
  table: string
  select: string
  searchFields: string[]
  /** 정렬 컬럼: latest = created_at, popular = 아래 지정 컬럼 (없으면 created_at 으로 폴백) */
  popularColumn?: string
  map: (r: any) => Omit<SearchHit, "category">
}

const PROFILE_SEARCH_FIELDS = ["nickname", "full_name", "bio", "location"]

async function runCategory(
  supabase: any,
  cfg: CategoryConfig,
  q: string,
  limit: number,
  sort: SearchSort,
  plaza: string | null,
): Promise<[SearchCategory, SearchHit[]]> {
  const like = `%${q}%`
  const orExpr = cfg.searchFields.map((f) => `${f}.ilike.${like}`).join(",")
  let query = supabase.from(cfg.table).select(cfg.select).or(orExpr).limit(limit)
  // profiles 는 광장 cross-cutting (사용자는 여러 광장 가능). 그 외 콘텐츠는 광장 격리.
  if (plaza && cfg.category !== "profiles") {
    query = query.eq("plaza_id", plaza)
  }
  const orderCol = sort === "popular" && cfg.popularColumn ? cfg.popularColumn : "created_at"
  query = query.order(orderCol, { ascending: false, nullsFirst: false })
  const { data, error } = await query
  if (error) {
    console.error(`[search] ${cfg.category} failed:`, error.message)
    return [cfg.category, []]
  }
  const hits: SearchHit[] = (data || []).map((r: any) => ({
    category: cfg.category,
    ...cfg.map(r),
  }))
  return [cfg.category, hits]
}

const CATEGORIES: CategoryConfig[] = [
  {
    category: "secondhand",
    table: "secondhand_posts",
    select: "id, title, description, category, images, price, status, location, views, created_at",
    searchFields: ["title", "description", "category"],
    popularColumn: "views",
    map: (r) => ({
      id: r.id,
      title: r.title,
      summary: r.description || null,
      thumbnail: firstImage(r.images),
      location: r.location || null,
      status: r.status || null,
      href: `/secondhand/${r.id}`,
      createdAt: r.created_at,
      meta: { category: r.category, price: r.price, views: r.views },
    }),
  },
  {
    category: "jobs",
    table: "jobs_posts",
    select: "id, title, description, category, images, status, location, views, created_at",
    searchFields: ["title", "description", "category"],
    popularColumn: "views",
    map: (r) => ({
      id: r.id,
      title: r.title,
      summary: r.description || null,
      thumbnail: firstImage(r.images),
      location: r.location || null,
      status: r.status || null,
      href: `/jobs/${r.id}`,
      createdAt: r.created_at,
      meta: { category: r.category, views: r.views },
    }),
  },
  {
    category: "board",
    table: "board_posts",
    select: "id, title, content, thumbnail_url, images, author_name, view_count, like_count, comment_count, created_at",
    searchFields: ["title", "content"],
    popularColumn: "view_count",
    map: (r) => ({
      id: r.id,
      title: r.title,
      summary: r.content ? String(r.content).replace(/\s+/g, " ").slice(0, 120) : null,
      thumbnail: r.thumbnail_url || firstImage(r.images),
      location: null,
      status: null,
      href: `/board/${r.id}`,
      createdAt: r.created_at,
      meta: {
        author_name: r.author_name,
        view_count: r.view_count,
        like_count: r.like_count,
        comment_count: r.comment_count,
      },
    }),
  },
  {
    category: "sharing",
    table: "sharing_posts",
    select: "id, title, description, category, images, status, location, views, likes, created_at",
    searchFields: ["title", "description", "location"],
    popularColumn: "views",
    map: (r) => ({
      id: r.id,
      title: r.title,
      summary: r.description || null,
      thumbnail: firstImage(r.images),
      location: r.location || null,
      status: r.status || null,
      href: `/sharing/${r.id}`,
      createdAt: r.created_at,
      meta: { category: r.category, views: r.views, likes: r.likes },
    }),
  },
  {
    category: "local_food",
    table: "local_food",
    select: "id, title, description, content, category, images, status, location, district, price, unit, view_count, like_count, created_at",
    searchFields: ["title", "description", "content", "category", "location", "district"],
    popularColumn: "view_count",
    map: (r) => ({
      id: r.id,
      title: r.title,
      summary: r.description || (r.content ? String(r.content).slice(0, 120) : null),
      thumbnail: firstImage(r.images),
      location: r.location || r.district || null,
      status: r.status || null,
      href: `/local-food/${r.id}`,
      createdAt: r.created_at,
      meta: {
        category: r.category,
        price: r.price,
        unit: r.unit,
        district: r.district,
      },
    }),
  },
  {
    category: "profiles",
    table: "profiles",
    select: "id, nickname, full_name, bio, location, avatar_url, account_type",
    searchFields: PROFILE_SEARCH_FIELDS,
    map: (r) => ({
      id: r.id,
      title: r.nickname || r.full_name || "(이름 없음)",
      summary: r.bio || null,
      thumbnail: r.avatar_url || null,
      location: r.location || null,
      status: null,
      href: `/profile/${r.id}`,
      createdAt: null,
      meta: {
        account_type: r.account_type,
        full_name: r.full_name,
      },
    }),
  },
]

/**
 * 검색 로그 (best-effort) — 집계는 search_queries 테이블에 upsert
 */
async function logSearch(supabase: any, term: string) {
  try {
    await supabase.rpc("log_search_query", { p_term: term })
  } catch {
    /* 로깅 실패는 무시 */
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const qRaw = (searchParams.get("q") || "").trim()
  const scope = (searchParams.get("scope") || "all") as SearchCategory | "all"
  const sort = ((searchParams.get("sort") || "latest") as SearchSort) === "popular" ? "popular" : "latest"
  const limitRaw = parseInt(searchParams.get("limit") || "", 10)
  const limit = Math.min(
    Math.max(Number.isFinite(limitRaw) ? limitRaw : DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  )

  // 과도하게 긴 검색어 → DB ILIKE 부하 방어
  if (qRaw.length > 100) {
    return NextResponse.json({ error: "검색어가 너무 깁니다 (100자 이내)" }, { status: 400 })
  }

  if (!qRaw || qRaw.length < 1) {
    return NextResponse.json({
      q: "",
      results: EMPTY_RESULTS,
      counts: EMPTY_COUNTS,
    })
  }

  // Rate limit — IP/유저당 1분 30개 (검색 스크래핑 방어)
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  const limited = await enforceRateLimit(request, 'search', user?.id)
  if (limited) return limited

  const q = esc(qRaw)
  const plaza = await getCurrentPlaza()

  const wants = (cat: SearchCategory) => scope === "all" || scope === cat
  const tasks: Array<Promise<[SearchCategory, SearchHit[]]>> = []

  for (const cfg of CATEGORIES) {
    if (wants(cfg.category)) {
      tasks.push(runCategory(supabase, cfg, q, limit, sort, plaza))
    }
  }

  const settled = await Promise.all(tasks)

  const results: Record<SearchCategory, SearchHit[]> = { ...EMPTY_RESULTS }
  for (const [cat, hits] of settled) {
    results[cat] = hits
  }
  const counts: Record<SearchCategory, number> = { ...EMPTY_COUNTS }
  for (const cat of Object.keys(results) as SearchCategory[]) {
    counts[cat] = results[cat].length
  }

  // 검색어 집계 (fire-and-forget, 전체 범위일 때만)
  if (scope === "all" && qRaw.length >= 2) {
    logSearch(supabase, qRaw).catch(() => {})
  }

  return NextResponse.json({ q: qRaw, results, counts })
}
