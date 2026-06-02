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
import { enforceRateLimit } from "@/lib/services/ratelimit"

export const dynamic = "force-dynamic"

// IP / UA 추출
async function captureCaller() {
  const h = await headers()
  const xff = h.get("x-forwarded-for") || ""
  const ip = xff.split(",")[0].trim() || h.get("x-real-ip") || null
  const ua = h.get("user-agent") || null
  return { ip, ua }
}

// audit_log 기록 (silent — 실패해도 메인 흐름 차단 X)
async function writeAuditLog(opts: {
  actor_id: string
  plaza_id: string
  action: string
  target_type?: string | null
  target_id?: string | null
  metadata?: unknown
  ip?: string | null
  user_agent?: string | null
}) {
  try {
    const admin = await getAdminWriteClient()
    if (!admin) return
    await admin.from("audit_log").insert({
      actor_id: opts.actor_id,
      plaza_id: opts.plaza_id,
      action: opts.action,
      target_type: opts.target_type ?? null,
      target_id: opts.target_id ?? null,
      metadata: opts.metadata ?? null,
      ip: opts.ip ?? null,
      user_agent: opts.user_agent ?? null,
    })
  } catch (e) {
    console.warn("[admin/users/ban audit_log]", e)
  }
}

// 공통 ensure — 현재 광장 admin
async function ensureBanWriter() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false as const, status: 401, error: "로그인 필요" }
  }
  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) {
    return { ok: false as const, status: 403, error: "권한 없음" }
  }
  const plaza = await getCurrentPlaza()
  if (!plaza) {
    return { ok: false as const, status: 400, error: "광장 컨텍스트 필요" }
  }
  if (!canAccessPlaza(auth, plaza)) {
    return { ok: false as const, status: 403, error: "이 광장에 대한 권한이 없습니다" }
  }
  return { ok: true as const, supabase, user, auth, plaza }
}

// ─── 정지/차단 ──────────────────────────────────────────────
// POST { reason?, scope?: 'suspend'|'ban', expires_at?: ISO }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const ctx = await ensureBanWriter()
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { user, plaza } = ctx
  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  if (id === user.id) {
    return NextResponse.json({ error: "자기 자신은 차단할 수 없습니다" }, { status: 400 })
  }

  let body: any = {}
  try {
    body = await request.json()
  } catch {
    /* 빈 body 허용 */
  }

  const { reason, scope, expires_at } = body || {}
  const validScope = scope === "ban" || scope === "suspend" ? scope : "suspend"
  if (expires_at !== undefined && expires_at !== null) {
    if (typeof expires_at !== "string" || isNaN(Date.parse(expires_at))) {
      return NextResponse.json({ error: "expires_at 형식 오류" }, { status: 400 })
    }
  }
  if (reason !== undefined && reason !== null && typeof reason !== "string") {
    return NextResponse.json({ error: "reason 형식 오류" }, { status: 400 })
  }

  const admin = await getAdminWriteClient()
  if (!admin) {
    return NextResponse.json({ error: "admin key missing" }, { status: 500 })
  }

  const { data: banRow, error } = await admin
    .from("user_bans")
    .insert({
      user_id: id,
      plaza_id: plaza,
      banned_by: user.id,
      reason: reason || null,
      scope: validScope,
      expires_at: expires_at || null,
    })
    .select()
    .single()

  if (error) {
    console.warn("[admin/users/ban POST]", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  const { ip, ua } = await captureCaller()
  await writeAuditLog({
    actor_id: user.id,
    plaza_id: plaza,
    action: "ban_user",
    target_type: "user",
    target_id: id,
    metadata: { ban_id: banRow.id, scope: validScope, expires_at: expires_at || null, reason: reason || null },
    ip,
    user_agent: ua,
  })

  return NextResponse.json({ ban: banRow }, { status: 201 })
}

// ─── ban 해제 ──────────────────────────────────────────────
// DELETE { reason? } — 현재 광장의 활성 ban 전체 해제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const ctx = await ensureBanWriter()
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { user, plaza } = ctx
  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  let body: any = {}
  try {
    body = await request.json()
  } catch {
    /* 빈 body 허용 */
  }
  const { reason } = body || {}
  if (reason !== undefined && reason !== null && typeof reason !== "string") {
    return NextResponse.json({ error: "reason 형식 오류" }, { status: 400 })
  }

  const admin = await getAdminWriteClient()
  if (!admin) {
    return NextResponse.json({ error: "admin key missing" }, { status: 500 })
  }

  const { data: lifted, error } = await admin
    .from("user_bans")
    .update({ lifted_at: new Date().toISOString(), lifted_by: user.id })
    .eq("user_id", id)
    .eq("plaza_id", plaza)
    .is("lifted_at", null)
    .select()

  if (error) {
    console.warn("[admin/users/ban DELETE]", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  const { ip, ua } = await captureCaller()
  await writeAuditLog({
    actor_id: user.id,
    plaza_id: plaza,
    action: "unban_user",
    target_type: "user",
    target_id: id,
    metadata: { lifted_count: lifted?.length ?? 0, reason: reason || null },
    ip,
    user_agent: ua,
  })

  return NextResponse.json({ success: true, lifted: lifted?.length ?? 0 })
}

// ─── 현재 광장 ban 목록 ──────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const ctx = await ensureBanWriter()
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { supabase, user, plaza } = ctx
  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  const { data, error } = await supabase
    .from("user_bans")
    .select("id, user_id, plaza_id, banned_by, reason, scope, starts_at, expires_at, lifted_at, lifted_by, created_at")
    .eq("user_id", id)
    .eq("plaza_id", plaza)
    .order("created_at", { ascending: false })

  if (error) {
    console.warn("[admin/users/ban GET]", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  const now = Date.now()
  const bans = (data || []).map((b: any) => ({
    ...b,
    active:
      b.lifted_at === null && (!b.expires_at || new Date(b.expires_at).getTime() > now),
  }))

  return NextResponse.json({ bans })
}
