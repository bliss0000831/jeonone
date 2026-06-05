/**
 * 검색 — supabase 직접 쿼리 (web /api/search 미러).
 *
 * RN 에서 web API 로 cross-origin 호출 시 CORS 가 안 풀려있어
 * Expo web 에서 fetch 가 차단됨. APK (native) 는 CORS 무관해 web API 도 OK 지만,
 * dev/preview 단계에서도 동일 동작 보장하려고 supabase 클라이언트 직접 사용.
 *
 * 광장 격리 — selected.plaza (cached) 로 plaza_id 필터.
 */

import type { SearchCategory, SearchHit, SearchSort } from "@gwangjang/types/search"
import { getSupabase } from "./supabase"
import { getCachedPlaza } from "./plaza"

export interface SearchResult {
  results: Record<SearchCategory, SearchHit[]>
  counts: Record<SearchCategory, number>
}

const EMPTY_BUCKET: Record<SearchCategory, SearchHit[]> = {
  board: [],
  sharing: [],
  local_food: [],
  profiles: [],
}
const ZERO_COUNTS: Record<SearchCategory, number> = {
  board: 0,
  sharing: 0,
  local_food: 0,
  profiles: 0,
}

function firstImage(images: unknown): string | null {
  if (Array.isArray(images) && images.length > 0 && typeof images[0] === "string") {
    return images[0]
  }
  return null
}

interface CatCfg {
  category: SearchCategory
  table: string
  select: string
  searchFields: string[]
  popularColumn?: string
  /**
   * 가시성 필터 — web /api/search 가 적용하는 status 필터 미러.
   * 빈 배열이면 status 제약 없음 (profiles 같은 경우).
   * 여러 값이면 .in() 으로 OR.
   */
  visibleStatuses?: string[]
  map: (r: any) => Omit<SearchHit, "category">
}

const CATEGORIES: CatCfg[] = [
  {
    category: "board",
    table: "board_posts",
    select: "id, title, content, thumbnail_url, images, view_count, like_count, comment_count, created_at",
    searchFields: ["title", "content"],
    popularColumn: "view_count",
    visibleStatuses: ["published"],
    map: (r) => ({
      id: r.id,
      title: r.title,
      summary: r.content ? String(r.content).replace(/\s+/g, " ").slice(0, 120) : null,
      thumbnail: r.thumbnail_url || firstImage(r.images),
      location: null,
      status: null,
      href: `/board/${r.id}`,
      createdAt: r.created_at,
      meta: { view_count: r.view_count, like_count: r.like_count, comment_count: r.comment_count },
    }),
  },
  {
    category: "sharing",
    table: "sharing_posts",
    select: "id, title, description, images, status, location, views, likes, created_at",
    searchFields: ["title", "description", "location"],
    popularColumn: "views",
    visibleStatuses: ["active"],
    map: (r) => ({
      id: r.id,
      title: r.title,
      summary: r.description || null,
      thumbnail: firstImage(r.images),
      location: r.location || null,
      status: r.status || null,
      href: `/sharing/${r.id}`,
      createdAt: r.created_at,
      meta: {},
    }),
  },
  {
    category: "local_food",
    table: "local_food",
    select: "id, title, description, images, status, price, created_at",
    searchFields: ["title", "description"],
    visibleStatuses: ["available", "active"],
    map: (r) => ({
      id: r.id,
      title: r.title,
      summary: r.description || null,
      thumbnail: firstImage(r.images),
      location: null,
      status: r.status || null,
      href: `/local-food/${r.id}`,
      createdAt: r.created_at,
      meta: { price: r.price },
    }),
  },
  {
    category: "profiles",
    table: "profiles",
    select: "id, nickname, full_name, bio, avatar_url, location, created_at",
    searchFields: ["nickname", "full_name", "bio", "location"],
    map: (r) => ({
      id: r.id,
      title: r.nickname || r.full_name || "이름 없음",
      summary: r.bio || null,
      thumbnail: r.avatar_url || null,
      location: r.location || null,
      status: null,
      href: `/profile/${r.id}`,
      createdAt: r.created_at,
      meta: {},
    }),
  },
]

export async function searchDirect(args: {
  q: string
  scope: "all" | SearchCategory
  limit?: number
  sort?: SearchSort
  signal?: AbortSignal
}): Promise<SearchResult> {
  const q = args.q.trim()
  if (!q) return { results: { ...EMPTY_BUCKET }, counts: { ...ZERO_COUNTS } }

  const supabase = getSupabase()
  const plaza = getCachedPlaza().id
  const limit = args.limit ?? (args.scope === "all" ? 5 : 30)
  const sort: SearchSort = args.sort ?? "latest"

  const targets =
    args.scope === "all"
      ? CATEGORIES
      : CATEGORIES.filter((c) => c.category === args.scope)

  const results: Record<SearchCategory, SearchHit[]> = { ...EMPTY_BUCKET }
  const counts: Record<SearchCategory, number> = { ...ZERO_COUNTS }

  await Promise.all(
    targets.map(async (cfg) => {
      try {
        const orExpr = cfg.searchFields
          .map((f) => `${f}.ilike.%${q.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9\s]/g, " ").trim()}%`)
          .join(",")
        let query: any = (supabase as any).from(cfg.table).select(cfg.select).or(orExpr).limit(limit)
        if (plaza && cfg.category !== "profiles") {
          query = query.eq("plaza_id", plaza)
        }
        // 가시성 필터 제거 — web /api/search 는 status 필터 없음 (route.ts:71-98)
        // mobile 만 적용하면 web 에서 보이는 글이 mobile 에서 누락되는 drift 발생
        const orderCol =
          sort === "popular" && cfg.popularColumn ? cfg.popularColumn : "created_at"
        query = query.order(orderCol, { ascending: false, nullsFirst: false })
        if (args.signal) query = query.abortSignal(args.signal)
        const { data, error } = await query
        if (error) {
          console.warn(`[searchDirect] ${cfg.category} failed:`, error.message)
          return
        }
        const hits: SearchHit[] = (data ?? []).map((r: any) => ({
          category: cfg.category,
          ...cfg.map(r),
        }))
        results[cfg.category] = hits
        counts[cfg.category] = hits.length
      } catch (e: any) {
        if (e?.name === "AbortError") throw e
        console.warn(`[searchDirect] ${cfg.category} error:`, e?.message)
      }
    }),
  )

  // 검색 로그 (best-effort) — web logSearch 미러
  if (args.scope === "all" && q.length >= 2) {
    supabase
      .rpc("log_search_query", { p_term: q })
      .then(() => {}, () => {})
  }

  return { results, counts }
}

/**
 * 트렌딩 검색어 — web /api/search/trending 과 동일한 로직.
 *   - search_queries 테이블에서 최근 7일 + count desc + plaza-scope
 *   - search_term_blacklist 의 단어 제외
 *   - 최대 10개 반환
 */
export async function listTrendingTermsDirect(): Promise<string[]> {
  try {
    const supabase = getSupabase()
    const plaza = getCachedPlaza().id
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // 블랙리스트 먼저 조회 (없을 수 있으니 silent 처리)
    const { data: bl } = await supabase
      .from("search_term_blacklist")
      .select("term")
    const blocked = new Set((bl || []).map((r: any) => r.term))

    let q: any = supabase
      .from("search_queries")
      .select("term, count, last_searched_at")
      .gte("last_searched_at", since)
      .order("count", { ascending: false })
      .limit(30)
    if (plaza) q = q.eq("plaza_id", plaza)
    const { data } = await q
    if (!Array.isArray(data)) return []
    return data
      .map((r: any) => r.term as string)
      .filter(
        (t: string) =>
          // 깨진 글자(U+FFFD), 빈/공백, 너무 짧음, 블랙리스트 모두 제외
          t &&
          !t.includes("�") &&
          t.trim().length >= 2 &&
          !blocked.has(t),
      )
      .slice(0, 10)
  } catch {
    return []
  }
}

/**
 * 검색어 자동완성 제안 — web /api/search/suggest 의 RN 직접 호출 버전.
 * pg_trgm similarity RPC (suggest_search_terms) 호출. 결과 없으면 빈 배열.
 */
export interface SuggestTerm {
  term: string
  similarity: number
  count: number
}
export async function suggestSearchTermsDirect(
  q: string,
  limit = 3,
): Promise<SuggestTerm[]> {
  const term = (q || "").trim()
  if (term.length < 2) return []
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase.rpc("suggest_search_terms", {
      p_term: term,
      p_limit: Math.max(1, Math.min(10, limit)),
    })
    if (error) return []
    return ((data ?? []) as any[]).map((r) => ({
      term: r.term,
      similarity: r.similarity,
      count: r.count,
    }))
  } catch {
    return []
  }
}
