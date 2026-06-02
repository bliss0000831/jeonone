import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import {
  checkAdminAuth,
  canAccessPlaza,
  getAdminWriteClient,
} from "@/lib/services/admin-auth"
import { enforceRateLimit } from "@/lib/services/ratelimit"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/sanctions
 * List all bans for the current plaza (with profile nicknames).
 * service role 로 RLS 우회.
 */
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
  if (!plaza) {
    return NextResponse.json(
      { error: "광장 컨텍스트 필요" },
      { status: 400 },
    )
  }
  if (!canAccessPlaza(auth, plaza)) {
    return NextResponse.json(
      { error: "이 광장에 대한 권한이 없습니다" },
      { status: 403 },
    )
  }

  const limited = await enforceRateLimit(request as any, "default", user.id)
  if (limited) return limited

  // service role 클라이언트 — RLS 우회
  const admin = await getAdminWriteClient()
  if (!admin) {
    return NextResponse.json({ error: "Service role key 미설정" }, { status: 500 })
  }

  // Fetch bans for this plaza, joining profile nickname
  const { data, error } = await admin
    .from("user_bans")
    .select(
      "id, user_id, banned_by, reason, scope, starts_at, expires_at, lifted_at, lifted_by, created_at",
    )
    .eq("plaza_id", plaza)
    .order("created_at", { ascending: false })
    .limit(200)

  if (error) {
    console.warn("[admin/sanctions GET]", error)
    return NextResponse.json(
      { error: `조회 실패: ${error.message}` },
      { status: 500 },
    )
  }

  // 닉네임 resolve — user_id 목록으로 profiles 조회
  const userIds = [...new Set((data || []).map((b: any) => b.user_id))]
  let profileMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, nickname, full_name")
      .in("id", userIds)
    for (const p of profiles ?? []) {
      profileMap[p.id] = p.nickname || p.full_name || p.id?.slice(0, 8) || ""
    }
  }

  const now = Date.now()
  const sanctions = (data || []).map((b: any) => ({
    id: b.id,
    user_id: b.user_id,
    nickname: profileMap[b.user_id] || b.user_id?.slice(0, 8) || "",
    scope: b.scope,
    reason: b.reason || "-",
    starts_at: b.starts_at || b.created_at,
    expires_at: b.expires_at,
    lifted_at: b.lifted_at,
    created_at: b.created_at,
    active:
      b.lifted_at === null &&
      (!b.expires_at || new Date(b.expires_at).getTime() > now),
  }))

  return NextResponse.json({ sanctions })
}
