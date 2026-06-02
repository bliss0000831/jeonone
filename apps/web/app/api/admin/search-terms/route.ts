import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { checkAdminAuth, canAccessPlaza, type AdminAuth } from "@/lib/services/admin-auth"

type AdminCtx =
  | { ok: false; status: 401 | 403; supabase: Awaited<ReturnType<typeof createClient>> }
  | {
      ok: true
      status: 200
      user: { id: string; [k: string]: any }
      supabase: Awaited<ReturnType<typeof createClient>>
      auth: AdminAuth
    }

async function requireAdmin(): Promise<AdminCtx> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, supabase }
  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) {
    return { ok: false, status: 403, supabase }
  }
  return { ok: true, status: 200, user, supabase, auth }
}

// query 의 plaza 파라미터를 검증 — 본인 plaza 의 검색어만 보고/조작 가능
function resolvePlazaScope(
  req: NextRequest,
  auth: AdminAuth,
): { plaza: string | null; error?: string } {
  if (auth.isGodMode) {
    // superadmin/god-mode: ?plaza= 명시 시 그 광장만, 없으면 모든 광장
    return { plaza: req.nextUrl.searchParams.get("plaza") || null }
  }
  // 일반 plaza_admin — plaza param 필수, 자기 광장만
  const plaza = req.nextUrl.searchParams.get("plaza")
  if (!plaza) {
    return { plaza: null, error: "plaza param required" }
  }
  if (!canAccessPlaza(auth, plaza)) {
    return { plaza: null, error: "plaza scope denied" }
  }
  return { plaza }
}

/** GET /api/admin/search-terms?range=7&limit=100&plaza=...  — 전체 목록 + 블랙리스트 플래그 */
export async function GET(request: NextRequest) {
  const a = await requireAdmin()
  if (!a.ok) return NextResponse.json({ error: "forbidden" }, { status: a.status })
  const supabase = a.supabase

  const scope = resolvePlazaScope(request, a.auth)
  if (scope.error) return NextResponse.json({ error: scope.error }, { status: 403 })

  const range = Math.max(1, Math.min(365, Number(request.nextUrl.searchParams.get("range") || 7)))
  const limit = Math.max(1, Math.min(500, Number(request.nextUrl.searchParams.get("limit") || 100)))
  const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000).toISOString()

  let qb: any = supabase
    .from("search_queries")
    .select("term, count, last_searched_at, first_searched_at, plaza_id")
    .gte("last_searched_at", since)
    .order("count", { ascending: false })
    .limit(limit)
  if (scope.plaza) qb = qb.eq("plaza_id", scope.plaza)
  let blQ: any = supabase
    .from("search_term_blacklist")
    .select("term, reason, created_at, plaza_id")
  if (scope.plaza) blQ = blQ.eq("plaza_id", scope.plaza)
  const [{ data: queries }, { data: bl }] = await Promise.all([qb, blQ])

  const blMap = new Map<string, { reason: string | null; created_at: string }>(
    (bl || []).map((b: any) => [b.term, { reason: b.reason, created_at: b.created_at }]),
  )

  const items = (queries || []).map((q: any) => ({
    term: q.term,
    count: q.count,
    last_searched_at: q.last_searched_at,
    first_searched_at: q.first_searched_at,
    blacklisted: blMap.has(q.term),
    blacklist_reason: blMap.get(q.term)?.reason ?? null,
  }))
  // 블랙리스트에 있지만 최근 검색어엔 안 찍힌 것도 같이 노출
  const orphanBl = (bl || [])
    .filter((b: any) => !items.find((i: any) => i.term === b.term))
    .map((b: any) => ({
      term: b.term,
      count: 0,
      last_searched_at: null,
      first_searched_at: null,
      blacklisted: true,
      blacklist_reason: b.reason,
    }))

  return NextResponse.json({ items: [...items, ...orphanBl] })
}

/** DELETE /api/admin/search-terms?term=...&plaza=... — 누적 집계에서 제거 */
export async function DELETE(request: NextRequest) {
  const a = await requireAdmin()
  if (!a.ok) return NextResponse.json({ error: "forbidden" }, { status: a.status })
  const supabase = a.supabase

  const scope = resolvePlazaScope(request, a.auth)
  if (scope.error) return NextResponse.json({ error: scope.error }, { status: 403 })

  const term = (request.nextUrl.searchParams.get("term") || "").trim().toLowerCase()
  if (!term) return NextResponse.json({ error: "term required" }, { status: 400 })

  let dq: any = supabase.from("search_queries").delete().eq("term", term)
  if (scope.plaza) dq = dq.eq("plaza_id", scope.plaza)
  const { error } = await dq
  if (error) {
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

/** POST /api/admin/search-terms?plaza=...  body: { term, reason?, action? } — 블랙리스트 add/remove */
export async function POST(request: NextRequest) {
  const a = await requireAdmin()
  if (!a.ok) return NextResponse.json({ error: "forbidden" }, { status: a.status })
  const supabase = a.supabase
  const user = a.user

  const scope = resolvePlazaScope(request, a.auth)
  if (scope.error) return NextResponse.json({ error: scope.error }, { status: 403 })
  // POST 는 plaza scope 필수 — godMode 가 아닌데 plaza 없으면 위에서 차단됨
  // godMode 가 plaza 없이 POST 하면 전 광장 블랙리스트로 처리하지 않고 명시 요구
  if (!scope.plaza) {
    return NextResponse.json(
      { error: "plaza param required for blacklist actions" },
      { status: 400 },
    )
  }

  const body = await request.json().catch(() => ({}))
  const term = String(body.term || "").trim().toLowerCase()
  const reason = body.reason ? String(body.reason) : null
  const action = body.action === "remove" ? "remove" : "add"
  if (!term) return NextResponse.json({ error: "term required" }, { status: 400 })

  if (action === "remove") {
    const { error } = await (supabase as any)
      .from("search_term_blacklist")
      .delete()
      .eq("term", term)
      .eq("plaza_id", scope.plaza)
    if (error) return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
    return NextResponse.json({ ok: true, blacklisted: false })
  }

  const { error } = await supabase
    .from("search_term_blacklist")
    .upsert(
      { term, reason, plaza_id: scope.plaza, created_by: user.id },
      { onConflict: "term,plaza_id" },
    )
  if (error) return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  return NextResponse.json({ ok: true, blacklisted: true })
}
