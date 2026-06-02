import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCurrentPlaza } from "@/lib/plaza/server"

export const dynamic = 'force-dynamic'

/**
 * GET /api/search/trending
 * 최근 7일 간 누적 검색 횟수 Top 10 (블랙리스트 제외) — 광장별 격리
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  // 클라이언트가 선택한 광장(쿼리) 우선 — 없으면 host 기반 fallback (최근검색어와 동일 스코프)
  const plazaParam = new URL(request.url).searchParams.get("plaza")
  const plaza = plazaParam || (await getCurrentPlaza())
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // 블랙리스트 + 검색어 조회 병렬
  let trendingQ: any = supabase
    .from("search_queries")
    .select("term, count, last_searched_at")
    .gte("last_searched_at", since)
    .order("count", { ascending: false })
    .limit(30)
  if (plaza) trendingQ = trendingQ.eq("plaza_id", plaza)

  const [{ data: bl }, { data, error }] = await Promise.all([
    supabase.from("search_term_blacklist").select("term"),
    trendingQ,
  ])
  const blocked = new Set((bl || []).map((r: any) => r.term))

  if (error) {
    // 테이블이 아직 없을 수도 있으니 조용히 빈 배열
    return NextResponse.json({ terms: [] })
  }
  const terms = (data || [])
    .map((r: any) => r.term)
    .filter((t: string) => !blocked.has(t))
    .slice(0, 10)
  return NextResponse.json({ terms }, { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } })
}
