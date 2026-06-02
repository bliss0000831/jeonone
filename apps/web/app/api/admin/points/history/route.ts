import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { checkAdminAuth, getAdminWriteClient } from "@/lib/services/admin-auth"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/points/history?userId=...
 * 특정 회원의 포인트 거래 내역 조회 (service role).
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 })

  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) return NextResponse.json({ error: "권한 없음" }, { status: 403 })

  const plaza = await getCurrentPlaza()
  if (!plaza) return NextResponse.json({ error: "광장 컨텍스트 필요" }, { status: 400 })

  const admin = await getAdminWriteClient()
  if (!admin) return NextResponse.json({ error: "Service role 미설정" }, { status: 500 })

  const { searchParams } = new URL(request.url)
  const userId = searchParams.get("userId")

  // 광장 격리 해제 — plaza_id 필터 제거 (user_id 기준 조회)
  let q = admin
    .from("point_transactions")
    .select("id, user_id, amount, type, source, status, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(50)

  if (userId) q = q.eq("user_id", userId)

  const { data, error } = await q
  if (error) {
    console.error("[points/history]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 관리자 ID → 닉네임 resolve
  const adminIds = new Set<string>()
  for (const tx of data ?? []) {
    const aid = (tx.metadata as any)?.admin_id
    if (aid) adminIds.add(aid)
  }

  const adminMap: Record<string, string> = {}
  if (adminIds.size > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, nickname")
      .in("id", Array.from(adminIds))
    for (const p of profiles ?? []) {
      adminMap[p.id] = p.nickname || "관리자"
    }
  }

  return NextResponse.json({ transactions: data ?? [], adminMap })
}
