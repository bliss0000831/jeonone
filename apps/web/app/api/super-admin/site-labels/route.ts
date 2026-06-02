import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { verifySuperAdminToken, SUPER_ADMIN_COOKIE } from "@/lib/services/super-admin"
import { enforceRateLimit } from "@/lib/services/ratelimit"

export const dynamic = "force-dynamic"

// 슈퍼관리자 인증 검사
async function ensureSuperAdmin() {
  const c = await cookies()
  const token = c.get(SUPER_ADMIN_COOKIE)?.value
  return verifySuperAdminToken(token)
}

/**
 * GET — 모든 라벨 + 메타 반환 (슈퍼관리자 페이지용).
 */
export async function GET() {
  if (!(await ensureSuperAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("site_labels")
    .select("id, key, value, fallback, image_url, description, group_name, sort_order, updated_at")
    .order("group_name", { ascending: true })
    .order("sort_order", { ascending: true })
  if (error) {
    console.error("[site-labels GET]", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }
  return NextResponse.json({ items: data ?? [] })
}

/**
 * PUT — 단건 또는 일괄 업데이트.
 *   body: { updates: [{ key, value }, ...] }
 */
export async function PUT(request: NextRequest) {
  if (!(await ensureSuperAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const limited = await enforceRateLimit(request, "admin-notify", "super-admin")
  if (limited) return limited

  const body = await request.json().catch(() => ({}))
  const updates: { key: string; value: string }[] = Array.isArray(body?.updates)
    ? body.updates
    : []
  if (updates.length === 0) {
    return NextResponse.json({ error: "updates 배열이 필요합니다" }, { status: 400 })
  }
  const admin = createAdminClient()
  // 라벨 값 sanitization — 컨트롤 문자 제거 + 길이 cap (image url 도 들어가서 좀 길게)
  const cleanValue = (v: string) =>
    v.replace(/[\x00-\x08\x0b-\x1f]/g, "").slice(0, 2000)

  // 개별 업데이트 — upsert 가능하지만 fallback/description/group 변경은 막기 위해 update 만
  const changed: { key: string; before: string | null; after: string }[] = []
  for (const u of updates) {
    if (!u?.key || typeof u.value !== "string") continue
    const v = cleanValue(u.value)
    // 변경 전 값 조회 (감사 로그용)
    const { data: prev } = await admin
      .from("site_labels")
      .select("value")
      .eq("key", u.key)
      .maybeSingle()
    const beforeVal = (prev?.value ?? null) as string | null
    if (beforeVal === v) continue // 동일하면 skip

    const { error } = await admin
      .from("site_labels")
      .update({ value: v, updated_at: new Date().toISOString() })
      .eq("key", u.key)
    if (error) {
      console.error("[site-labels PUT]", u.key, error.message)
      return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
    }
    changed.push({ key: u.key, before: beforeVal, after: v })
  }

  // 감사 로그 — 슈퍼관리자가 어떤 라벨을 어떻게 바꿨는지 Vercel 로그에 추적.
  // (admin_actions 테이블은 admin_id NOT NULL 이라 슈퍼관리자 단일 ID 없음 → console 로 기록)
  if (changed.length > 0) {
    console.log(
      "[site-labels:audit]",
      JSON.stringify({
        ts: new Date().toISOString(),
        actor: "super-admin",
        changes: changed.map((c) => ({
          key: c.key,
          before: (c.before || "").slice(0, 80),
          after: c.after.slice(0, 80),
        })),
      }),
    )
  }

  return NextResponse.json({ success: true, updated: changed.length })
}

/**
 * POST { key } — 라벨을 fallback 값으로 초기화.
 */
export async function POST(request: NextRequest) {
  if (!(await ensureSuperAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const limited = await enforceRateLimit(request, "admin-notify", "super-admin")
  if (limited) return limited

  const body = await request.json().catch(() => ({}))
  const key = body?.key
  if (!key) return NextResponse.json({ error: "key 가 필요합니다" }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("site_labels")
    .select("fallback")
    .eq("key", key)
    .single()
  if (error || !data) {
    return NextResponse.json({ error: "라벨을 찾을 수 없습니다" }, { status: 404 })
  }
  // 변경 전 값 조회
  const { data: prev } = await admin
    .from("site_labels")
    .select("value")
    .eq("key", key)
    .maybeSingle()

  await admin
    .from("site_labels")
    .update({ value: data.fallback, updated_at: new Date().toISOString() })
    .eq("key", key)

  console.log(
    "[site-labels:audit]",
    JSON.stringify({
      ts: new Date().toISOString(),
      actor: "super-admin",
      action: "reset-to-fallback",
      key,
      before: ((prev?.value as string) || "").slice(0, 80),
      after: (data.fallback || "").slice(0, 80),
    }),
  )

  return NextResponse.json({ success: true, value: data.fallback })
}
