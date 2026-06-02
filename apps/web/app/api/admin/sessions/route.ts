import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { checkAdminAuth, getAdminWriteClient } from "@/lib/services/admin-auth"
import { enforceRateLimit } from "@/lib/services/ratelimit"

export const dynamic = "force-dynamic"

// super 권한 (legacy super 또는 plaza super) 만 통과
async function ensureSuper() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false as const, status: 401, error: "로그인 필요" }
  }
  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.isGodMode) {
    return { ok: false as const, status: 403, error: "슈퍼관리자 전용" }
  }
  return { ok: true as const, supabase, user, auth }
}

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
    console.warn("[admin/sessions audit_log]", e)
  }
}

// ─── 최근 활동 사용자 ──────────────────────────────────────
// GET /api/admin/sessions?limit=50
export async function GET(request: NextRequest) {
  const ctx = await ensureSuper()
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const limited = await enforceRateLimit(request as any, 'mutate', ctx.user.id)
  if (limited) return limited

  const url = new URL(request.url)
  const limit = Math.max(1, Math.min(parseInt(url.searchParams.get("limit") || "50"), 200))

  const admin = await getAdminWriteClient()
  if (!admin) {
    return NextResponse.json({ error: "admin key missing" }, { status: 500 })
  }

  // auth.admin.listUsers — page 1, perPage=limit. last_sign_in_at 기준 정렬은 클라이언트.
  try {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: limit })
    if (error) {
      console.warn("[admin/sessions GET]", error)
      return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
    }
    const users = (data?.users || [])
      .map((u: any) => ({
        id: u.id,
        email: u.email,
        last_sign_in_at: u.last_sign_in_at,
        created_at: u.created_at,
        confirmed_at: u.confirmed_at,
        banned_until: u.banned_until,
      }))
      .sort((a: { last_sign_in_at: string | null }, b: { last_sign_in_at: string | null }) => {
        const av = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0
        const bv = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0
        return bv - av
      })
      .slice(0, limit)

    return NextResponse.json({ users, total: users.length })
  } catch (e: any) {
    console.warn("[admin/sessions GET ex]", e)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }
}

// ─── 강제 로그아웃 ────────────────────────────────────────
// DELETE { user_id }
export async function DELETE(request: NextRequest) {
  const ctx = await ensureSuper()
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const limited = await enforceRateLimit(request as any, 'mutate', ctx.user.id)
  if (limited) return limited
  const { user } = ctx

  let body: any = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 })
  }
  const { user_id } = body || {}
  if (!user_id || typeof user_id !== "string") {
    return NextResponse.json({ error: "user_id 필요" }, { status: 400 })
  }

  const admin = await getAdminWriteClient()
  if (!admin) {
    return NextResponse.json({ error: "admin key missing" }, { status: 500 })
  }

  try {
    // supabase-js v2: signOut(jwt, scope) — admin SDK 에선 user 의 모든 refresh token 무효화
    const { error } = await admin.auth.admin.signOut(user_id, "global")
    if (error) {
      console.warn("[admin/sessions DELETE]", error)
      return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
    }
  } catch (e: any) {
    console.warn("[admin/sessions DELETE ex]", e)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  // audit — plaza 컨텍스트 있으면 그 광장, 없으면 'hub' 마커
  const plaza = (await getCurrentPlaza()) || "hub"
  const h = await headers()
  const xff = h.get("x-forwarded-for") || ""
  const ip = xff.split(",")[0].trim() || h.get("x-real-ip") || null
  const ua = h.get("user-agent") || null
  await writeAuditLog({
    actor_id: user.id,
    plaza_id: plaza,
    action: "force_signout",
    target_type: "user",
    target_id: user_id,
    metadata: { scope: "global" },
    ip,
    user_agent: ua,
  })

  return NextResponse.json({ success: true })
}
