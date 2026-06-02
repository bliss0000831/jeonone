import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { NextResponse } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { checkAdminAuth, getAdminWriteClient } from "@/lib/services/admin-auth"

export const dynamic = 'force-dynamic'

/** PostgREST .or() 안에 삽입되는 문자열에서 예약 문자를 이스케이프 */
function escapePostgrestLike(s: string): string {
  return s.replace(/[\\%_,().;:]/g, '')
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  const { user } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 })
  }

  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 })
  }

  // 허브 도메인(plaza == null) 에서 전체 profiles 노출은 god-mode (legacy super / plaza super) 만 허용.
  if (!plaza && !auth.isGodMode) {
    return NextResponse.json(
      { error: "허브에서 전체 회원 조회는 슈퍼관리자만 가능합니다" },
      { status: 403 },
    )
  }

  // 페이지네이션 — 최대 200건 (보안: 무한 fetch 방지)
  const url = new URL(request.url)
  const limit = Math.max(1, Math.min(parseInt(url.searchParams.get("limit") || "50"), 200))
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0"))
  const search = (url.searchParams.get("search") || "").trim()

  if (!plaza) {
    // 허브 도메인 — 기존 profiles 직접 조회 (god-mode)
    let q: any = supabase
      .from("profiles")
      .select("id, nickname, full_name, avatar_url, role, account_type, location, created_at, phone, last_seen, points, is_verified_phone, notif_marketing", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (search) {
      const s = escapePostgrestLike(search)
      q = q.or(`nickname.ilike.%${s}%,full_name.ilike.%${s}%,phone.ilike.%${s}%`)
    }

    const { data: profiles, error, count } = await q
    if (error) {
      return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
    }

    // 게시글 수 + 신고 횟수 enrichment
    const userIds = (profiles || []).map((p: any) => p.id)
    const enriched = await enrichUserStats(supabase, profiles || [], userIds)

    return NextResponse.json({ users: enriched, total: count ?? 0, limit, offset })
  }

  // ─── 광장 통합 프로필 — plaza_profiles에서 멤버 목록(account_type), profiles에서 표시 필드 ───
  // plaza_profiles 에서 멤버 user_id + account_type 가져온 뒤
  // profiles 에서 닉네임, 아바타 등 표시 필드를 join.
  let ppQ: any = supabase
    .from("plaza_profiles")
    .select("user_id, account_type", { count: "exact" })
    .eq("plaza_id", plaza)
    .order("joined_at", { ascending: false })

  const ppQPaged = ppQ.range(offset, offset + limit - 1)
  const { data: ppRows, error: ppError, count: ppCount } = await ppQPaged

  if (ppError) {
    console.error("[admin/users] plaza_profiles error:", ppError)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  const ppArr = (ppRows || []) as Array<{
    user_id: string
    account_type: string | null
  }>

  if (ppArr.length === 0) {
    const stats = search ? undefined : await getPlazaStats(supabase, plaza)
    return NextResponse.json({ users: [], total: ppCount ?? 0, limit, offset, stats })
  }

  // profiles join — 표시 필드 + 광장 무관 필드
  const userIds = ppArr.map((p) => p.user_id)
  const { data: globals } = await supabase
    .from("profiles")
    .select("id, nickname, avatar_url, full_name, phone, location, role, created_at, last_seen, points, is_verified_phone, notif_marketing")
    .in("id", userIds)

  const gmap = new Map<string, any>(((globals as any[]) || []).map((g) => [g.id, g]))

  // 검색 필터는 profiles 필드 기준으로 클라이언트사이드 적용
  const ppAccountMap = new Map(ppArr.map((pp) => [pp.user_id, pp.account_type]))
  let users = ppArr
    .map((pp) => {
      const g = gmap.get(pp.user_id)
      if (!g) return null
      return {
        id: pp.user_id,
        nickname: g.nickname,
        avatar_url: g.avatar_url,
        account_type: pp.account_type,
        location: g.location,
        phone: g.phone,
        full_name: g.full_name,
        role: g.role,
        created_at: g.created_at,
        last_seen: g.last_seen,
        points: g.points,
        is_verified_phone: g.is_verified_phone,
        notif_marketing: g.notif_marketing,
      }
    })
    .filter((x): x is NonNullable<typeof x> => !!x)

  if (search) {
    const s = search.toLowerCase()
    users = users.filter(
      (u) =>
        (u.nickname && u.nickname.toLowerCase().includes(s)) ||
        (u.full_name && u.full_name.toLowerCase().includes(s)) ||
        (u.phone && u.phone.includes(s)),
    )
  }

  // 게시글 수 + 신고 횟수 enrichment
  const enrichedUsers = await enrichUserStats(supabase, users, users.map(u => u.id), plaza)

  // 통계 — 검색 없을 때만 전체 통계 제공
  const stats = search ? undefined : await getPlazaStats(supabase, plaza)

  return NextResponse.json({
    users: enrichedUsers,
    total: ppCount ?? 0,
    limit,
    offset,
    stats,
  })
}

/** 게시글 수 + 신고 횟수 + 이메일 + 메모를 각 유저에 붙여서 반환 */
async function enrichUserStats(supabase: any, users: any[], userIds: string[], plaza?: string | null) {
  if (userIds.length === 0) return users

  // 병렬: 게시글, 신고, 이메일, 메모
  const admin = await getAdminWriteClient()

  const [postRows, reportRows, authUsers, memoRows] = await Promise.all([
    // 게시글 수
    supabase
      .from("board_posts")
      .select("author_id")
      .in("author_id", userIds)
      .then((r: any) => r?.data || []),
    // 신고 횟수
    supabase
      .from("post_reports")
      .select("target_user_id")
      .in("target_user_id", userIds)
      .then((r: any) => r?.data || []),
    // 이메일 — auth.admin (service role 필요)
    (async () => {
      if (!admin) return []
      try {
        // listUsers 는 전체를 가져오므로 비효율적 → getUserById 개별 호출 대신
        // 50건 이하이므로 병렬 getUserById
        const results = await Promise.all(
          userIds.slice(0, 50).map(async (uid) => {
            try {
              const { data } = await admin.auth.admin.getUserById(uid)
              return data?.user ? { id: uid, email: data.user.email } : null
            } catch { return null }
          })
        )
        return results.filter(Boolean)
      } catch { return [] }
    })(),
    // 관리자 메모
    supabase
      .from("admin_user_memos")
      .select("user_id, memo")
      .in("user_id", userIds)
      .then((r: any) => r?.data || [])
      .catch(() => []),
  ])

  const postCountMap = new Map<string, number>()
  ;(postRows as any[]).forEach((r: any) => {
    postCountMap.set(r.author_id, (postCountMap.get(r.author_id) || 0) + 1)
  })

  const reportCountMap = new Map<string, number>()
  ;(reportRows as any[]).forEach((r: any) => {
    reportCountMap.set(r.target_user_id, (reportCountMap.get(r.target_user_id) || 0) + 1)
  })

  const emailMap = new Map<string, string>()
  ;(authUsers as any[]).forEach((u: any) => {
    if (u?.email) emailMap.set(u.id, u.email)
  })

  const memoMap = new Map<string, string>()
  ;(memoRows as any[]).forEach((m: any) => {
    if (m?.memo) memoMap.set(m.user_id, m.memo)
  })

  return users.map((u: any) => ({
    ...u,
    post_count: postCountMap.get(u.id) || 0,
    report_count: reportCountMap.get(u.id) || 0,
    email: emailMap.get(u.id) || null,
    admin_memo: memoMap.get(u.id) || null,
  }))
}

/** 광장 전체 회원 통계 (account_type 별 카운트) — head-count 병렬 쿼리 (perf fix) */
async function getPlazaStats(supabase: any, plaza: string) {
  const serviceTypes = ["interior", "moving", "cleaning", "repair"]

  const countByType = (types: string[]) =>
    supabase
      .from("plaza_profiles")
      .select("*", { count: "exact", head: true })
      .eq("plaza_id", plaza)
      .in("account_type", types)
      .then((r: any) => r?.count ?? 0)

  const countExact = (type: string) =>
    supabase
      .from("plaza_profiles")
      .select("*", { count: "exact", head: true })
      .eq("plaza_id", plaza)
      .eq("account_type", type)
      .then((r: any) => r?.count ?? 0)

  const countTotal = () =>
    supabase
      .from("plaza_profiles")
      .select("*", { count: "exact", head: true })
      .eq("plaza_id", plaza)
      .then((r: any) => r?.count ?? 0)

  const [total, agents, business, producers, services] = await Promise.all([
    countTotal(),
    countExact("agent"),
    countExact("business"),
    countExact("producer"),
    countByType(serviceTypes),
  ])

  const individuals = Math.max(0, total - agents - business - producers - services)
  return { total, agents, business, producers, services, individuals }
}
