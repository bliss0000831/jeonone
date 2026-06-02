import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { NextResponse } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { banGuardResponse } from "@/lib/services/user-ban-guard"

export const dynamic = 'force-dynamic'

const VALID_SERVICE_TYPES = ["interior", "moving", "cleaning", "repair"] as const

// GET: 도와주세요 요청 목록 조회 — 광장별 격리
export async function GET(request: Request) {
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status") // open/matched/closed
  const serviceType = searchParams.get("service_type")
  const district = searchParams.get("district")
  const mine = searchParams.get("mine") === "1"

  let query = (supabase as any)
    .from("service_requests")
    .select("id, user_id, plaza_id, title, content, region, district, dong, service_type, budget_min, budget_max, desired_date, status, views, created_at")
    .order("created_at", { ascending: false })
    .limit(100)

  if (plaza) query = query.eq("plaza_id", plaza)
  if (status) query = query.eq("status", status)
  if (serviceType) query = query.eq("service_type", serviceType)
  if (district) query = query.eq("district", district)

  if (mine) {
    const { user } = await getAuthedUser(supabase, request)
    if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 })
    query = query.eq("user_id", user.id)
  }

  const { data, error } = await query
  if (error) {
    console.error("Get service requests error:", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  // 작성자 프로필 병합
  const userIds = [...new Set((data ?? []).map((r: any) => r.user_id))] as string[]
  const profilesMap: Record<string, { id: string; nickname: string | null; full_name: string | null; avatar_url: string | null; account_type: string | null }> = {}
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, nickname, full_name, avatar_url, account_type")
      .in("id", userIds)
    profiles?.forEach((p) => { profilesMap[p.id] = p })
  }

  const withProfiles = (data ?? []).map((r: any) => ({
    ...r,
    author: profilesMap[r.user_id] ?? null,
  }))

  return NextResponse.json({ requests: withProfiles })
}

// POST: 새 도와주세요 요청 생성 (누구나 작성 가능)
export async function POST(request: Request) {
  const supabase = await createClient()
  const { user, tokenSource } = await getAuthedUser(supabase, request)

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  }

  // 차단 사용자 체크
  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  const body = await request.json()
  const {
    title,
    content,
    serviceType,
    region,
    district,
    dong,
    budgetMin,
    budgetMax,
    desiredDate,
  } = body

  if (!title || !content) {
    return NextResponse.json({ error: "제목과 내용은 필수입니다" }, { status: 400 })
  }

  if (!serviceType || !VALID_SERVICE_TYPES.includes(serviceType)) {
    return NextResponse.json(
      { error: "서비스 유형은 interior, moving, cleaning, repair 중 하나여야 합니다" },
      { status: 400 }
    )
  }

  const plaza = await getCurrentPlaza()
  if (!plaza) {
    return NextResponse.json({ error: "광장 도메인에서 작성해주세요" }, { status: 400 })
  }

  // Bearer 토큰(모바일) → supabase 가 anonymous 실행 → RLS 차단
  let writer: any = supabase
  if (tokenSource === "bearer") {
    const { getAdminWriteClient } = await import("@/lib/services/admin-auth")
    const wc = await getAdminWriteClient()
    if (!wc) {
      return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 })
    }
    writer = wc
  }

  const { data, error } = await writer
    .from("service_requests")
    .insert({
      plaza_id: plaza,
      user_id: user.id,
      title,
      content,
      service_type: serviceType,
      region: region || null,
      district: district || null,
      dong: dong || null,
      budget_min: budgetMin ?? null,
      budget_max: budgetMax ?? null,
      desired_date: desiredDate || null,
    })
    .select()
    .single()

  if (error) {
    console.error("Create service request error:", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  return NextResponse.json({ request: data })
}
