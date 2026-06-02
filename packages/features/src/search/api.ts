/**
 * 검색 API — 광장 web /api/search 엔드포인트 호출.
 *
 * fetcher 를 외부 주입 받아 RN 의 gwangjangFetch (Bearer token 자동) 와
 * 웹의 native fetch 모두 지원. 결과 타입은 packages/types/search 와 동일.
 */

import type { SearchCategory, SearchHit, SearchSort } from "@gwangjang/types/search"

export interface SearchResult {
  results: Record<SearchCategory, SearchHit[]>
  counts: Record<SearchCategory, number>
}

const EMPTY_BUCKET: Record<SearchCategory, SearchHit[]> = {
  properties: [],
  board: [],
  sharing: [],
  clubs: [],
  group_buying: [],
  local_food: [],
  services: [],
  new_store: [],
  profiles: [],
}

const ZERO_COUNTS: Record<SearchCategory, number> = {
  properties: 0,
  board: 0,
  sharing: 0,
  clubs: 0,
  group_buying: 0,
  local_food: 0,
  services: 0,
  new_store: 0,
  profiles: 0,
}

interface FetchAdapter {
  (input: string, init?: RequestInit): Promise<Response>
}

/**
 * 검색 실행.
 * @param fetcher RN 에선 gwangjangFetch, 웹에선 fetch.
 * @param scope "all" 또는 특정 카테고리 — limit 도 차등 (all=5/탭=30).
 */
export async function search(
  fetcher: FetchAdapter,
  args: {
    q: string
    scope: "all" | SearchCategory
    limit?: number
    sort?: SearchSort
    signal?: AbortSignal
  },
): Promise<SearchResult> {
  if (!args.q.trim()) {
    return { results: EMPTY_BUCKET, counts: ZERO_COUNTS }
  }
  const limit = args.limit ?? (args.scope === "all" ? 5 : 30)
  const sort = args.sort ?? "latest"
  const url = `/api/search?q=${encodeURIComponent(args.q)}&scope=${args.scope}&limit=${limit}&sort=${sort}`
  try {
    const r = await fetcher(url, { signal: args.signal })
    if (!r.ok) return { results: EMPTY_BUCKET, counts: ZERO_COUNTS }
    const data = await r.json()
    return {
      results: data.results ?? EMPTY_BUCKET,
      counts: data.counts ?? ZERO_COUNTS,
    }
  } catch (e: any) {
    if (e?.name === "AbortError") throw e
    return { results: EMPTY_BUCKET, counts: ZERO_COUNTS }
  }
}

/** 인기 검색어 */
export async function listTrendingTerms(fetcher: FetchAdapter): Promise<string[]> {
  try {
    const r = await fetcher("/api/search/trending")
    if (!r.ok) return []
    const data = await r.json()
    return Array.isArray(data.terms) ? data.terms : []
  } catch {
    return []
  }
}
