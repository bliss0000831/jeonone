import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { createClient as createAdmin } from "@supabase/supabase-js"
import { verifySuperAdminToken, SUPER_ADMIN_COOKIE } from "@/lib/services/super-admin"

/**
 * 슈퍼관리자 — 광장별 PortOne / 사업자 정보 조회·수정
 *
 * 보안: SUPER_ADMIN_COOKIE 검증 + service-role 키로 plazas 직접 update
 */
function getAdmin() {
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY
  if (!u || !k) return null
  return createAdmin(u, k, { auth: { persistSession: false } })
}

async function requireSuper() {
  const c = await cookies()
  const token = c.get(SUPER_ADMIN_COOKIE)?.value
  return await verifySuperAdminToken(token)
}

export async function GET() {
  if (!(await requireSuper())) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 })
  }
  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 })
  const { data, error } = await admin
    .from("plazas")
    .select(
      "id, name, parent_region, sort_order, is_active, " +
      "pg_provider, portone_store_id, portone_channel_key, " +
      "business_number, business_name, business_holder, settlement_email, payments_enabled",
    )
    .order("sort_order", { ascending: true })
  if (error) return NextResponse.json({ error: "조회 실패" }, { status: 500 })
  return NextResponse.json({ plazas: data || [] })
}

export async function PATCH(request: NextRequest) {
  if (!(await requireSuper())) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 })
  }
  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 })

  const body = await request.json().catch(() => null)
  if (!body || !body.plaza_id) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 })
  }

  const fields: any = {}
  for (const k of [
    "pg_provider",
    "portone_store_id",
    "portone_channel_key",
    "business_number",
    "business_name",
    "business_holder",
    "settlement_email",
    "payments_enabled",
  ]) {
    if (k in body) fields[k] = body[k]
  }

  const { data, error } = await admin
    .from("plazas")
    .update(fields)
    .eq("id", body.plaza_id)
    .select()
    .single()

  if (error) {
    console.error("[plaza-payments PATCH]", error)
    return NextResponse.json({ error: "저장 실패" }, { status: 500 })
  }

  // 감사 로그 — 슈퍼관리자 PG/사업자 정보 변경 추적
  console.log(
    "[plaza-payments:audit]",
    JSON.stringify({
      ts: new Date().toISOString(),
      actor: "super-admin",
      action: "update-plaza-payments",
      plaza_id: body.plaza_id,
      fields: Object.keys(fields),
    }),
  )

  return NextResponse.json({ plaza: data })
}
