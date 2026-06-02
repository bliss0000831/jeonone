import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/search/suggest?q=검색어&limit=3
 * pg_trgm similarity 로 유사 검색어 제안 (오타 교정)
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim()
  const limit = Math.max(1, Math.min(10, Number(req.nextUrl.searchParams.get("limit") || 3)))
  if (q.length < 2 || q.length > 100) return NextResponse.json({ suggestions: [] })

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("suggest_search_terms", {
    p_term: q,
    p_limit: limit,
  })
  if (error) {
    return NextResponse.json({ suggestions: [] })
  }
  return NextResponse.json({
    suggestions: (data || []).map((r: any) => ({
      term: r.term,
      similarity: r.similarity,
      count: r.count,
    })),
  }, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } })
}
