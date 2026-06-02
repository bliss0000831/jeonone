import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"

/**
 * 이미 계정 유형이 승인된 사용자 목록.
 *
 * profiles.account_type 이 'agent' | 'business' | 'producer' | 'interior' |
 * 'moving' | 'cleaning' | 'repair' 중 하나면 승인된 계정으로 본다.
 * (일반 사용자는 'user' 또는 NULL)
 *
 * 각 사용자의 가장 최근 승인된 account_type_requests 행도 함께 반환해서
 * 어떤 사업자등록번호/상호로 승인됐는지 한 화면에서 확인할 수 있게 함.
 */

const APPROVED_TYPES = [
  "agent",
  "business",
  "producer",
  "interior",
  "moving",
  "cleaning",
  "repair",
] as const

async function requireAdmin(request: Request) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return { error: "로그인이 필요합니다", status: 401 as const }
  const { checkAdminAuth } = await import("@/lib/services/admin-auth")
  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) {
    return { error: "관리자 권한이 필요합니다", status: 403 as const }
  }
  return { supabase, user, auth }
}

/** GET /api/admin/approved-accounts?type=agent */
export async function GET(request: NextRequest) {
  const result = await requireAdmin(request)
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status })
  const { supabase, user, auth } = result

  const limited = await enforceRateLimit(request as any, 'default', user.id)
  if (limited) return limited

  const plaza = await getCurrentPlaza()

  // 허브 도메인에서 전체 조회는 god-mode 만 허용
  if (!plaza && !auth.isGodMode) {
    return NextResponse.json(
      { error: "허브에서 전체 승인 계정 조회는 슈퍼관리자만 가능합니다" },
      { status: 403 },
    )
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get("type") // 옵션: 단일 타입 필터
  const typeFilter = type && APPROVED_TYPES.includes(type as any) ? [type] : (APPROVED_TYPES as readonly string[])

  if (plaza) {
    // ── 광장 격리: plaza_profiles 로 소속 사용자 ID 먼저 확보 → profiles.account_type 필터 ──
    // account_type 은 profiles 테이블에만 있음 (plaza_profiles 에는 없음)
    const { data: ppRows, error: ppErr } = await (supabase as any)
      .from("plaza_profiles")
      .select("user_id, joined_at")
      .eq("plaza_id", plaza)
      .limit(1000)

    if (ppErr) {
      console.error("[approved-accounts] plaza_profiles query error:", ppErr)
      return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
    }
    if (!ppRows || ppRows.length === 0) return NextResponse.json({ accounts: [] })

    const plazaUserIds = ppRows.map((r: any) => r.user_id)
    const joinedMap = new Map<string, string>()
    ppRows.forEach((r: any) => joinedMap.set(r.user_id, r.joined_at))

    // profiles 에서 account_type 필터 (email 은 profiles 에 없음)
    const { data: profiles, error: profErr } = await (supabase as any)
      .from("profiles")
      .select("id, nickname, avatar_url, account_type, created_at")
      .in("id", plazaUserIds)
      .in("account_type", typeFilter)
      .order("created_at", { ascending: false })
      .limit(500)

    if (profErr) {
      console.error("[approved-accounts] profiles query error:", profErr)
      return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
    }
    if (!profiles || profiles.length === 0) return NextResponse.json({ accounts: [] })

    const userIds = profiles.map((p: any) => p.id)

    // 각 user 의 가장 최근 승인된 신청 row 1개씩
    const { data: requests } = await (supabase as any)
      .from("account_type_requests")
      .select("user_id, requested_type, business_name, business_number, registration_number, office_address, contact_phone, intro, business_cert_urls, license_urls, reviewed_at, submitted_at")
      .in("user_id", userIds)
      .eq("status", "approved")
      .order("reviewed_at", { ascending: false })
      .limit(500)

    const reqByUser = new Map<string, any>()
    ;(requests || []).forEach((r: any) => {
      if (!reqByUser.has(r.user_id)) reqByUser.set(r.user_id, r)
    })

    const accounts = profiles.map((p: any) => ({
      user_id: p.id,
      nickname: p.nickname ?? null,
      avatar_url: p.avatar_url ?? null,
      email: null,
      account_type: p.account_type,
      joined_at: joinedMap.get(p.id) ?? p.created_at,
      request: reqByUser.get(p.id) || null,
    }))

    return NextResponse.json({ accounts })
  }

  // ── 허브 (god-mode): 전역 profiles 기준 조회 ──
  const { data: profiles, error: pErr } = await (supabase as any)
    .from("profiles")
    .select("id, nickname, avatar_url, account_type, created_at")
    .in("account_type", typeFilter)
    .order("created_at", { ascending: false })
    .limit(500)

  if (pErr) return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  const userIds = (profiles || []).map((p: any) => p.id)
  if (userIds.length === 0) return NextResponse.json({ accounts: [] })

  const { data: requests } = await (supabase as any)
    .from("account_type_requests")
    .select("user_id, requested_type, business_name, business_number, registration_number, office_address, contact_phone, intro, business_cert_urls, license_urls, reviewed_at, submitted_at")
    .in("user_id", userIds)
    .eq("status", "approved")
    .order("reviewed_at", { ascending: false })
    .limit(500)

  const reqByUser = new Map<string, any>()
  ;(requests || []).forEach((r: any) => {
    if (!reqByUser.has(r.user_id)) reqByUser.set(r.user_id, r)
  })

  const accounts = (profiles || []).map((p: any) => ({
    user_id: p.id,
    nickname: p.nickname,
    avatar_url: p.avatar_url,
    email: p.email,
    account_type: p.account_type,
    joined_at: p.created_at,
    request: reqByUser.get(p.id) || null,
  }))

  return NextResponse.json({ accounts })
}

/**
 * POST /api/admin/approved-accounts
 * 직접 설정한 계정의 사업 정보를 입력/수정.
 * account_type_requests 에 approved 레코드를 생성(upsert).
 */
export async function POST(request: NextRequest) {
  const result = await requireAdmin(request)
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status })
  const { supabase, user } = result

  const limited = await enforceRateLimit(request as any, "mutate", user.id)
  if (limited) return limited

  const body = await request.json()
  const {
    user_id,
    business_name,
    business_number,
    registration_number,
    office_address,
    contact_phone,
    intro,
    reviewed_at,
  } = body

  if (!user_id || typeof user_id !== "string") {
    return NextResponse.json({ error: "user_id 필수" }, { status: 400 })
  }
  if (!business_name || typeof business_name !== "string" || !business_name.trim()) {
    return NextResponse.json({ error: "상호명은 필수입니다" }, { status: 400 })
  }
  if (!business_number || typeof business_number !== "string" || !business_number.trim()) {
    return NextResponse.json({ error: "사업자등록번호는 필수입니다" }, { status: 400 })
  }
  if (!office_address || typeof office_address !== "string" || !office_address.trim()) {
    return NextResponse.json({ error: "주소는 필수입니다" }, { status: 400 })
  }
  if (!contact_phone || typeof contact_phone !== "string" || !contact_phone.trim()) {
    return NextResponse.json({ error: "연락처는 필수입니다" }, { status: 400 })
  }

  // 대상 유저의 현재 account_type 확인
  const { data: profile } = await supabase
    .from("profiles")
    .select("account_type")
    .eq("id", user_id)
    .maybeSingle()

  if (!profile) {
    return NextResponse.json({ error: "회원을 찾을 수 없습니다" }, { status: 404 })
  }
  const accountType = profile.account_type
  if (!accountType || !APPROVED_TYPES.includes(accountType as any)) {
    return NextResponse.json({ error: "승인된 계정 유형이 아닙니다" }, { status: 400 })
  }

  // 기존 approved 레코드가 있으면 업데이트, 없으면 생성
  const { data: existing } = await (supabase as any)
    .from("account_type_requests")
    .select("id")
    .eq("user_id", user_id)
    .eq("status", "approved")
    .order("reviewed_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const payload = {
    user_id,
    requested_type: accountType,
    status: "approved" as const,
    business_name: business_name.trim(),
    business_number: (business_number || "").trim() || null,
    // 공인중개사(agent)만 등록번호 저장, 그 외 유형은 null
    registration_number: accountType === "agent" ? ((registration_number || "").toString().trim() || null) : null,
    office_address: office_address.trim(),
    contact_phone: (contact_phone || "").trim() || null,
    intro: (intro || "").trim() || null,
    reviewed_at: reviewed_at && typeof reviewed_at === "string" ? reviewed_at : new Date().toISOString(),
    reviewed_by: user.id,
    admin_note: "관리자 직접 입력",
  }

  if (existing?.id) {
    // 기존 레코드 업데이트
    const { error } = await (supabase as any)
      .from("account_type_requests")
      .update(payload)
      .eq("id", existing.id)
    if (error) {
      console.error("[approved-accounts POST] update error:", error)
      return NextResponse.json({ error: "저장에 실패했습니다" }, { status: 500 })
    }
  } else {
    // 신규 생성
    const { error } = await (supabase as any)
      .from("account_type_requests")
      .insert({
        ...payload,
        business_cert_urls: [],
        license_urls: [],
        extra_docs_urls: [],
      })
    if (error) {
      console.error("[approved-accounts POST] insert error:", error)
      return NextResponse.json({ error: "저장에 실패했습니다" }, { status: 500 })
    }
  }

  // 사업 정보 입력 → 사업자 인증 활성화
  await supabase
    .from("profiles")
    .update({ is_verified_business: true })
    .eq("id", user_id)

  return NextResponse.json({ ok: true })
}
