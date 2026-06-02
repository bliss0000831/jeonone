import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { banGuardResponse } from "@/lib/services/user-ban-guard"
import { getCurrentPlaza } from "@/lib/plaza/server"

const ALLOWED_TYPES = [
  "agent", "business", "producer", "interior", "moving", "cleaning", "repair",
] as const

type RequestedType = (typeof ALLOWED_TYPES)[number]

/**
 * 업로드 URL 이 본인 폴더 소유인지 검증.
 * 패턴: `<base>/<folder>/<userId>/<filename>` — pathname 의 세그먼트 기준.
 * 쿼리스트링/프래그먼트에 자기 ID 끼워 넣어 우회하는 공격 차단.
 */
function isOwnedR2Url(url: string, userId: string): boolean {
  if (typeof url !== 'string' || !url) return false
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    // pathname 구조 검증: /<folder>/<userId>/<filename>
    // userId 가 정확히 두 번째 세그먼트에 위치해야 함 (폴더 뒤, 파일명 앞)
    const segments = u.pathname.split('/').filter(Boolean)
    // 최소 3 세그먼트 필요: folder / userId / filename
    if (segments.length < 3) return false
    // userId 가 두 번째 세그먼트(index 1)에 정확히 일치해야 함
    return segments[1] === userId
  } catch {
    return false
  }
}

function validateOwnedUrls(
  urls: unknown,
  userId: string,
): { ok: true; urls: string[] } | { ok: false; error: string } {
  if (urls == null) return { ok: true, urls: [] }
  if (!Array.isArray(urls)) return { ok: false, error: 'URL 배열 형식이 아닙니다' }
  for (const u of urls) {
    if (!isOwnedR2Url(u, userId)) {
      return { ok: false, error: '본인이 업로드한 파일만 첨부할 수 있습니다' }
    }
  }
  return { ok: true, urls: urls as string[] }
}

/** 내 신청 목록 — 최근 제출순 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })

  const { data, error } = await supabase
    .from("account_type_requests")
    .select("id, requested_type, previous_type, status, business_name, office_address, license_urls, intro, admin_note, submitted_at")
    .eq("user_id", user.id)
    .order("submitted_at", { ascending: false })

  if (error) return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  return NextResponse.json({ requests: data || [] })
}

/** 신청 생성 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { user, tokenSource } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })

  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  // Rate limit — 유저당 1시간 5개 (계정 승격 남용 방어, 전용 버킷)
  const limited = await enforceRateLimit(request, 'account_upgrade', user.id)
  if (limited) return limited

  // 현재 계정 유형 조회 (신규 신청 / 변경 신청 구분용)
  const { data: profile } = await supabase
    .from("profiles")
    .select("account_type, role")
    .eq("id", user.id)
    .maybeSingle()

  const currentType = (profile?.account_type || "user").toLowerCase() as string

  const body = await request.json().catch(() => ({}))
  const {
    requested_type,
    business_name,
    business_number,
    registration_number,
    office_address,
    contact_phone,
    intro,
    business_cert_urls,
    license_urls,
    extra_docs_urls,
  } = body ?? {}

  if (!ALLOWED_TYPES.includes(requested_type)) {
    return NextResponse.json({ error: "요청한 계정 유형이 올바르지 않습니다" }, { status: 400 })
  }
  // 이미 해당 유형 계정이면 신청 불필요
  if (currentType === requested_type) {
    return NextResponse.json(
      { error: "이미 해당 유형 계정입니다. 다른 유형을 선택해 주세요." },
      { status: 400 },
    )
  }
  if (!business_name || typeof business_name !== "string") {
    return NextResponse.json({ error: "사업장(상호)명을 입력해 주세요" }, { status: 400 })
  }
  if (business_name.length > 100) {
    return NextResponse.json({ error: "상호명이 너무 깁니다 (100자 이내)" }, { status: 400 })
  }
  if (typeof business_number === "string" && business_number.trim().length > 20) {
    return NextResponse.json({ error: "사업자등록번호가 너무 깁니다 (20자 이내)" }, { status: 400 })
  }
  if (typeof registration_number === "string" && registration_number.trim().length > 50) {
    return NextResponse.json({ error: "등록번호가 너무 깁니다 (50자 이내)" }, { status: 400 })
  }
  if (!office_address || typeof office_address !== "string") {
    return NextResponse.json({ error: "사무실/사업장 주소를 입력해 주세요" }, { status: 400 })
  }
  if (office_address.length > 200) {
    return NextResponse.json({ error: "주소가 너무 깁니다 (200자 이내)" }, { status: 400 })
  }
  // intro 길이 / contact_phone 형식 검증 (필드 자체는 선택)
  if (typeof intro === "string" && intro.length > 500) {
    return NextResponse.json({ error: "소개가 너무 깁니다 (500자 이내)" }, { status: 400 })
  }
  if (typeof contact_phone === "string" && contact_phone.trim().length > 0) {
    if (!/^[0-9+\-() ]{8,20}$/.test(contact_phone.trim())) {
      return NextResponse.json(
        { error: "연락처 형식이 올바르지 않습니다" },
        { status: 400 },
      )
    }
  }
  if (!Array.isArray(business_cert_urls) || business_cert_urls.length === 0) {
    return NextResponse.json({ error: "사업자등록증 사진을 1장 이상 업로드해 주세요" }, { status: 400 })
  }
  // 공인중개사는 자격증 + 등록번호 필수
  if (requested_type === "agent") {
    if (!Array.isArray(license_urls) || license_urls.length === 0) {
      return NextResponse.json({ error: "공인중개사 자격증 사진을 업로드해 주세요" }, { status: 400 })
    }
    if (!registration_number || typeof registration_number !== "string" || !registration_number.trim()) {
      return NextResponse.json({ error: "공인중개사 등록번호를 입력해 주세요" }, { status: 400 })
    }
  }

  // ── URL 소유권 검증 — 다른 사용자 폴더 URL 도용 차단
  const certCheck = validateOwnedUrls(business_cert_urls, user.id)
  if (!certCheck.ok) {
    return NextResponse.json({ error: certCheck.error }, { status: 400 })
  }
  const licCheck = validateOwnedUrls(license_urls, user.id)
  if (!licCheck.ok) {
    return NextResponse.json({ error: licCheck.error }, { status: 400 })
  }
  const extraCheck = validateOwnedUrls(extra_docs_urls, user.id)
  if (!extraCheck.ok) {
    return NextResponse.json({ error: extraCheck.error }, { status: 400 })
  }

  // 이미 동일 유형으로 pending 이 있으면 거부
  const { data: existing } = await supabase
    .from("account_type_requests")
    .select("id")
    .eq("user_id", user.id)
    .eq("requested_type", requested_type)
    .eq("status", "pending")
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: "이미 해당 계정 유형으로 심사 중인 신청이 있습니다" },
      { status: 409 },
    )
  }

  // 광장 ID 결정
  const plaza = await getCurrentPlaza()

  // Bearer 토큰(모바일) → RLS 차단 → admin client 우회
  let writer: any = supabase
  if (tokenSource === "bearer") {
    try {
      writer = createAdminClient()
    } catch (e) {
      console.error("[account-upgrade POST] admin client unavailable", e)
    }
  }

  const { data, error } = await writer
    .from("account_type_requests")
    .insert({
      user_id: user.id,
      requested_type: requested_type as RequestedType,
      previous_type: currentType,
      business_name: business_name.trim(),
      business_number: business_number?.toString().trim() || null,
      registration_number: requested_type === "agent" ? registration_number?.toString().trim() || null : null,
      office_address: office_address.trim(),
      contact_phone: contact_phone?.toString().trim() || null,
      intro: intro?.toString().trim() || null,
      business_cert_urls,
      license_urls: Array.isArray(license_urls) ? license_urls : [],
      extra_docs_urls: Array.isArray(extra_docs_urls) ? extra_docs_urls : [],
      status: "pending",
      ...(plaza ? { plaza_id: plaza } : {}),
    })
    .select()
    .single()

  if (error) {
    console.error("[account-upgrade POST] insert error:", error.message, error.details)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }
  return NextResponse.json({ request: data })
}

/** 본인 신청 취소 (pending → cancelled) */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id 가 필요합니다" }, { status: 400 })

  const { error } = await supabase
    .from("account_type_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "pending")

  if (error) return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  return NextResponse.json({ ok: true })
}
