import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { getCurrentPlaza } from "@/lib/plaza/server"
import {
  checkAdminAuth,
  canAccessPlaza,
  getAdminWriteClient,
} from "@/lib/services/admin-auth"

export const dynamic = "force-dynamic"

const ALLOWED_ACTIONS = new Set([
  "update",
  "delete",
  "hide",
  "restore",
  "force_status",
  "ban_user",
  "unban_user",
  "force_signout",
  "approve",
  "reject",
  "hide_post",
  "restore_post",
  "dismiss",
  "delete_post",
])

// ─── audit_log + admin_actions 통합 조회 ─────────────────────
// GET /api/admin/audit-log?from=ISO&to=ISO&actor=uid&action=str&limit=50&offset=0
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
  // 광장 도메인이면 그 광장 admin 여부, 허브면 god 만
  if (plaza && !auth.isGodMode && !canAccessPlaza(auth, plaza)) {
    return NextResponse.json({ error: "이 광장에 대한 권한이 없습니다" }, { status: 403 })
  }
  if (!plaza && !auth.isGodMode) {
    return NextResponse.json({ error: "허브에서는 슈퍼관리자만 조회 가능" }, { status: 403 })
  }

  const url = new URL(request.url)
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")
  const actor = url.searchParams.get("actor")
  const action = url.searchParams.get("action")
  const limit = Math.max(1, Math.min(parseInt(url.searchParams.get("limit") || "50"), 200))
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0"))

  if (action && !ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: "잘못된 action 값" }, { status: 400 })
  }

  // ── 1) audit_log 쿼리 (기존) ──
  // pagination 없이 전체 fetch 후 admin_actions 와 합산하여 정렬
  // 성능: 날짜 필터가 적용되므로 대량 데이터 방지
  let qAudit: any = supabase
    .from("audit_log")
    .select("id, created_at, actor_id, plaza_id, action, target_type, target_id, metadata, ip, user_agent", {
      count: "exact",
    })
    .order("created_at", { ascending: false })

  if (plaza) qAudit = qAudit.eq("plaza_id", plaza)
  if (from) qAudit = qAudit.gte("created_at", from)
  if (to) qAudit = qAudit.lte("created_at", to)
  if (actor) qAudit = qAudit.eq("actor_id", actor)
  if (action) qAudit = qAudit.eq("action", action)

  // ── 2) admin_actions 쿼리 (콘텐츠 관리 감사 로그) ──
  let qAdmin: any = supabase
    .from("admin_actions")
    .select("id, created_at, admin_id, plaza_id, action, target_table, target_id, target_user_id, before_data, reason", {
      count: "exact",
    })
    .order("created_at", { ascending: false })

  if (plaza) qAdmin = qAdmin.eq("plaza_id", plaza)
  if (from) qAdmin = qAdmin.gte("created_at", from)
  if (to) qAdmin = qAdmin.lte("created_at", to)
  if (actor) qAdmin = qAdmin.eq("admin_id", actor)
  if (action) qAdmin = qAdmin.eq("action", action)

  // 두 테이블 동시 조회
  const [auditResult, adminResult] = await Promise.all([qAudit, qAdmin])

  if (auditResult.error) {
    console.warn("[admin/audit-log GET] audit_log error:", auditResult.error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }
  if (adminResult.error) {
    console.warn("[admin/audit-log GET] admin_actions error:", adminResult.error)
    // admin_actions 실패 시에도 audit_log 만으로 진행 (graceful)
  }

  // ── 3) admin_actions → audit_log 형식으로 매핑 ──
  const auditRows = (auditResult.data || []).map((row: any) => ({
    ...row,
    _source: "audit_log" as const,
  }))

  const adminRows = (adminResult.data || []).map((row: any) => ({
    id: `aa_${row.id}`,                // prefix 로 id 충돌 방지
    created_at: row.created_at,
    actor_id: row.admin_id,
    plaza_id: row.plaza_id,
    action: row.action,
    target_type: row.target_table,      // target_table → target_type
    target_id: row.target_id,
    metadata: {
      ...(row.reason ? { reason: row.reason } : {}),
      ...(row.before_data ? { before_data: row.before_data } : {}),
      ...(row.target_user_id ? { target_user_id: row.target_user_id } : {}),
      _source: "admin_actions",
    },
    ip: null,
    user_agent: null,
    _source: "admin_actions" as const,
  }))

  // ── 4) 병합 + 정렬 + 페이지네이션 ──
  const merged = [...auditRows, ...adminRows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  const total = merged.length
  const paged = merged.slice(offset, offset + limit)

  // _source 필드 제거 (프론트에 불필요)
  const logs = paged.map(({ _source, ...rest }) => rest)

  return NextResponse.json({ logs, total, limit, offset })
}

// ─── audit_log 기록 ─────────────────────────────────────────
// POST { action, target_type?, target_id?, metadata? }
export async function POST(request: NextRequest) {
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
    return NextResponse.json({ error: "광장 컨텍스트 필요" }, { status: 400 })
  }
  if (!canAccessPlaza(auth, plaza)) {
    return NextResponse.json({ error: "이 광장에 대한 권한이 없습니다" }, { status: 403 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 })
  }

  const { action, target_type, target_id, metadata } = body || {}
  if (!action || typeof action !== "string") {
    return NextResponse.json({ error: "action 필요" }, { status: 400 })
  }
  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: "잘못된 action 값" }, { status: 400 })
  }

  // IP / UA 캡처
  const h = await headers()
  const xff = h.get("x-forwarded-for") || ""
  const ip = xff.split(",")[0].trim() || h.get("x-real-ip") || null
  const ua = h.get("user-agent") || null

  // service_role 로 기록 (RLS 안전망 — 권한 체크는 위에서 이미 끝남)
  const admin = await getAdminWriteClient()
  if (!admin) {
    return NextResponse.json({ error: "admin key missing" }, { status: 500 })
  }

  const { data, error } = await admin
    .from("audit_log")
    .insert({
      actor_id: user.id,
      plaza_id: plaza,
      action,
      target_type: target_type || null,
      target_id: target_id ? String(target_id) : null,
      metadata: metadata ?? null,
      ip,
      user_agent: ua,
    })
    .select()
    .single()

  if (error) {
    console.warn("[admin/audit-log POST]", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  return NextResponse.json({ log: data }, { status: 201 })
}
