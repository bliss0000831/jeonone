import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { checkAdminAuth, getAdminWriteClient } from "@/lib/services/admin-auth"
import { enforceRateLimit } from "@/lib/services/ratelimit"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/points/members?search=...
 *
 * 광장 소속 회원 + user_points 잔액을 서버사이드에서 조회.
 * 모든 쿼리를 service role 로 실행 (RLS 우회).
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 })

  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) return NextResponse.json({ error: "권한 없음" }, { status: 403 })

  const limited = await enforceRateLimit(request as any, "default", user.id)
  if (limited) return limited

  const plaza = await getCurrentPlaza()
  if (!plaza) {
    return NextResponse.json({ error: "광장 컨텍스트가 필요합니다" }, { status: 400 })
  }

  // service role 클라이언트 — RLS 완전 우회
  const admin = await getAdminWriteClient()
  if (!admin) {
    return NextResponse.json({ error: "Service role key 미설정" }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const search = (searchParams.get("search") || "").trim()

  // 1) 광장 소속 회원 ID 목록
  const { data: ppRows, error: ppErr } = await admin
    .from("plaza_profiles")
    .select("user_id")
    .eq("plaza_id", plaza)
    .limit(2000)

  if (ppErr) {
    console.error("[points/members] plaza_profiles error:", ppErr)
    return NextResponse.json({ error: `조회 실패: ${ppErr.message}` }, { status: 500 })
  }
  if (!ppRows || ppRows.length === 0) {
    return NextResponse.json({ users: [] })
  }

  const userIds: string[] = ppRows.map((r: any) => r.user_id)

  // 2) profiles 조회
  let profQ = admin
    .from("profiles")
    .select("id, nickname, full_name, avatar_url")
    .in("id", userIds)
    .order("created_at", { ascending: false })
    .limit(2000)

  if (search) {
    profQ = profQ.or(`nickname.ilike.%${search}%,full_name.ilike.%${search}%`)
  }

  const { data: profiles, error: profErr } = await profQ
  if (profErr) {
    console.error("[points/members] profiles error:", profErr)
    return NextResponse.json({ error: `조회 실패: ${profErr.message}` }, { status: 500 })
  }

  // 3) user_points 잔액 — 광장 격리 해제됨 (user_id 만 PK)
  const { data: pointsData, error: ptErr } = await admin
    .from("user_points")
    .select("user_id, available")
    .in("user_id", userIds)

  if (ptErr) {
    console.error("[points/members] user_points error:", ptErr)
  }

  const balanceMap = new Map<string, number>()
  for (const p of pointsData ?? []) {
    balanceMap.set(p.user_id, p.available ?? 0)
  }

  // 4) 합치기 — 잔액 내림차순
  const users = (profiles ?? []).map((p: any) => ({
    id: p.id,
    nickname: p.nickname,
    full_name: p.full_name,
    avatar_url: p.avatar_url,
    balance: balanceMap.get(p.id) ?? 0,
  }))
  users.sort((a: any, b: any) => b.balance - a.balance)

  return NextResponse.json({ users })
}
