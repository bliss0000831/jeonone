import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { createClient as createAdmin } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { checkAdminAuth, canAccessPlaza, logAdminAction } from "@/lib/services/admin-auth"
import { enforceRateLimit } from "@/lib/services/ratelimit"

export const dynamic = 'force-dynamic'

// /api/reports POST 의 TARGET_TABLE 과 1:1 동기화 — 누락 시 admin UI 에서 target=null 로 보임
const TARGET_TABLE: Record<string, string> = {
  secondhand: "secondhand_posts",
  jobs: "jobs_posts",
  sharing: "sharing_posts",
  clubs: "clubs",
  "new-store": "new_store_posts",
  board: "board_posts",
  property: "properties",
  group_buying: "group_buying_posts",
  local_food: "local_food",
  interior: "interior_posts",
  moving: "moving_posts",
  cleaning: "cleaning_posts",
  repair: "repair_posts",
  requests: "propertyrequests",
}

function getAdmin() {
  const k =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  if (!k || !u) return null
  return createAdmin(u, k, { auth: { persistSession: false } })
}

async function ensureAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, isAdmin: false, auth: null }
  // legacy + plaza_admins 통합 권한
  const auth = await checkAdminAuth(supabase, user.id)
  return {
    user,
    isAdmin: auth.ok,
    auth,
  }
}

// ─── 검토 큐 ───────────────────────────────────────────
// GET /api/admin/moderation/reports?status=pending
// 각 신고에 대해 피신고 게시글 정보도 같이 내려줌
export async function GET(request: Request) {
  const { user, isAdmin } = await ensureAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: "관리자 전용" }, { status: 403 })
  }
  const limited = await enforceRateLimit(request as any, 'mutate', user?.id)
  if (limited) return limited
  const status = new URL(request.url).searchParams.get("status") || "pending"
  const admin = getAdmin()
  if (!admin) {
    return NextResponse.json({ error: "admin key missing" }, { status: 500 })
  }

  const plaza = await getCurrentPlaza()
  let reportsQ: any = admin
    .from("post_reports")
    .select("id, status, plaza_id, target_type, target_id, reporter_id, reason, created_at, resolved_by, resolved_at")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(200)
  if (plaza) reportsQ = reportsQ.eq("plaza_id", plaza)
  const { data: reports, error } = await reportsQ
  if (error) {
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  // 신고자 닉네임 조인
  const reporterIds = [...new Set(reports?.map((r: any) => r.reporter_id) || [])]
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, nickname")
    .in("id", reporterIds)
  const pmap = new Map(profiles?.map((p: any) => [p.id, p.nickname]) || [])

  // N+1 제거: target_type 별로 id 목록을 모아 테이블당 1번만 조회
  const byType = new Map<string, { table: string; ids: string[]; indexMap: Map<string, any[]> }>()
  for (const r of reports || []) {
    const table = TARGET_TABLE[r.target_type]
    if (!table) continue
    if (!byType.has(r.target_type)) {
      byType.set(r.target_type, { table, ids: [], indexMap: new Map() })
    }
    const entry = byType.get(r.target_type)!
    entry.ids.push(r.target_id)
    if (!entry.indexMap.has(r.target_id)) entry.indexMap.set(r.target_id, [])
  }

  // 각 target_type 마다 .in() 으로 일괄 조회
  const targetMaps = new Map<string, Map<string, any>>() // target_type → (target_id → row)
  await Promise.all(
    Array.from(byType.entries()).map(async ([targetType, { table, ids }]) => {
      const uniqueIds = [...new Set(ids)]
      const { data: rows } = await admin
        .from(table)
        .select("id, title, user_id, status, report_count")
        .in("id", uniqueIds)
      const rowMap = new Map((rows || []).map((row: any) => [row.id, row]))
      targetMaps.set(targetType, rowMap)
    }),
  )

  const enriched = (reports || []).map((r: any) => {
    const rowMap = targetMaps.get(r.target_type)
    const target = rowMap ? (rowMap.get(r.target_id) ?? null) : null
    return { ...r, reporter_nickname: pmap.get(r.reporter_id), target }
  })

  return NextResponse.json({ reports: enriched })
}

// ─── 신고 처리 ─────────────────────────────────────────
// PATCH { reportId, action: 'hide_post' | 'restore_post' | 'dismiss' | 'delete_post' }
export async function PATCH(request: Request) {
  const { user, isAdmin, auth } = await ensureAdmin()
  if (!isAdmin || !user) {
    return NextResponse.json({ error: "관리자 전용" }, { status: 403 })
  }
  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited
  const body = await request.json()
  const { reportId, action } = body
  if (!reportId || !action) {
    return NextResponse.json(
      { error: "reportId, action 필요" },
      { status: 400 },
    )
  }
  const admin = getAdmin()
  if (!admin) {
    return NextResponse.json({ error: "admin key missing" }, { status: 500 })
  }

  const plaza = await getCurrentPlaza()
  let reportQ: any = admin.from("post_reports").select("*").eq("id", reportId)
  if (plaza) reportQ = reportQ.eq("plaza_id", plaza)
  const { data: report } = await reportQ.maybeSingle()
  if (!report) {
    return NextResponse.json({ error: "신고 찾을 수 없음" }, { status: 404 })
  }
  // ── 광장 admin 인 경우, 자기 광장 신고만 처리 가능
  if (auth && !auth.isLegacySuper && !canAccessPlaza(auth, (report as any).plaza_id ?? null)) {
    return NextResponse.json({ error: "다른 광장의 신고는 처리할 수 없습니다" }, { status: 403 })
  }
  const table = TARGET_TABLE[report.target_type]

  // 포인트 회수 헬퍼 (target_type → 적립 시 사용한 source 매핑)
  const SOURCE_MAP: Record<string, string> = {
    secondhand: 'secondhand.create',
    sharing: 'sharing.create',
    jobs: 'jobs.create',
    board: 'post.create',
  }
  const pointSource = SOURCE_MAP[report.target_type]

  if (action === "hide_post" && table) {
    await admin
      .from(table)
      .update({
        status: "hidden",
        hidden_reason: `관리자 숨김 처리 (신고 #${reportId})`,
      })
      .eq("id", report.target_id)
    // 포인트 회수
    if (pointSource) {
      const { revertBySource } = await import('@/lib/services/billing/points')
      await revertBySource(pointSource, report.target_id, '관리자 숨김').catch(() => {})
    }
  } else if (action === "restore_post" && table) {
    await admin
      .from(table)
      .update({ status: "active", hidden_reason: null })
      .eq("id", report.target_id)
  } else if (action === "delete_post" && table) {
    await admin.from(table).delete().eq("id", report.target_id)
    // 포인트 회수
    if (pointSource) {
      const { revertBySource } = await import('@/lib/services/billing/points')
      await revertBySource(pointSource, report.target_id, '관리자 삭제').catch(() => {})
    }
  } else if (action === "dismiss") {
    // dismiss: 신고 기각 — 게시글은 건드리지 않고 신고만 dismissed 처리
  } else {
    return NextResponse.json({ error: "알 수 없는 action" }, { status: 400 })
  }

  const reportStatus = action === "dismiss" ? "dismissed" : "resolved"
  await admin
    .from("post_reports")
    .update({
      status: reportStatus,
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
      ...(action === "dismiss" && body.admin_note ? { admin_note: body.admin_note } : {}),
    })
    .eq("id", reportId)

  // 관리자 조치 감사 로그 — 신고 처리 기록 (비동기, non-fatal)
  void logAdminAction({
    adminId: user.id,
    action: action === 'dismiss' ? 'dismiss_report'
      : action === 'hide_post' ? 'hide'
      : action === 'restore_post' ? 'restore'
      : action === 'delete_post' ? 'delete'
      : action,
    targetTable: table || 'post_reports',
    targetId: report.target_id || reportId,
    targetUserId: null,
    plazaId: plaza,
    beforeData: { report_id: reportId, target_type: report.target_type, status: report.status },
    reason: body.admin_note || null,
  })

  return NextResponse.json({ success: true })
}
