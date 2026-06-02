import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { checkAdminAuth, canAccessPlaza } from "@/lib/services/admin-auth"

export const dynamic = "force-dynamic"

// LIKE 인젝션 회피용 escape (%, _, \ 만)
function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`)
}

// GET /api/admin/search?q=keyword&limit=20
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 })
  }

  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 })
  }

  const plaza = await getCurrentPlaza()
  if (plaza && !canAccessPlaza(auth, plaza)) {
    return NextResponse.json({ error: "이 광장에 대한 권한이 없습니다" }, { status: 403 })
  }
  if (!plaza && !auth.isGodMode) {
    return NextResponse.json({ error: "허브 통합 검색은 슈퍼관리자만" }, { status: 403 })
  }

  const url = new URL(request.url)
  const q = (url.searchParams.get("q") || "").trim()
  const limit = Math.max(3, Math.min(parseInt(url.searchParams.get("limit") || "20"), 60))
  const per = Math.max(1, Math.floor(limit / 3))

  if (!q) {
    return NextResponse.json({ users: [], properties: [], posts: [] })
  }

  const like = `%${escapeLike(q)}%`

  // ─── users (profiles) ──────────────────────────────────────
  // 광장이면 plaza_profiles 로 제한, 허브+super 면 전체
  let userIdsFilter: string[] | null = null
  if (plaza) {
    const { data: members } = await supabase
      .from("plaza_profiles")
      .select("user_id")
      .eq("plaza_id", plaza)
    userIdsFilter = (members || []).map((m: any) => m.user_id)
  }

  const usersP = (async () => {
    let pq: any = supabase
      .from("profiles")
      .select("id, nickname, full_name, avatar_url, role, account_type, created_at")
      .or(`nickname.ilike.${like},full_name.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(per)
    if (userIdsFilter) {
      if (userIdsFilter.length === 0) return { data: [], error: null }
      pq = pq.in("id", userIdsFilter)
    }
    return await pq
  })()

  // ─── properties ────────────────────────────────────────────
  const propsP = (async () => {
    let pq: any = supabase
      .from("properties")
      .select("id, title, address, user_id, plaza_id, status, created_at")
      .or(`title.ilike.${like},address.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(per)
    if (plaza) pq = pq.eq("plaza_id", plaza)
    return await pq
  })()

  // ─── board_posts ───────────────────────────────────────────
  const postsP = (async () => {
    let pq: any = supabase
      .from("board_posts")
      .select("id, title, user_id, plaza_id, status, created_at")
      .ilike("title", like)
      .order("created_at", { ascending: false })
      .limit(per)
    if (plaza) pq = pq.eq("plaza_id", plaza)
    return await pq
  })()

  const [usersR, propsR, postsR] = await Promise.all([usersP, propsP, postsP])

  if (usersR.error) console.warn("[admin/search users]", usersR.error)
  if (propsR.error) console.warn("[admin/search properties]", propsR.error)
  if (postsR.error) console.warn("[admin/search posts]", postsR.error)

  return NextResponse.json({
    users: usersR.data || [],
    properties: propsR.data || [],
    posts: postsR.data || [],
  })
}
