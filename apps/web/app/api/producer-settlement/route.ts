import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { NextResponse, type NextRequest } from "next/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"

/**
 * GET /api/producer-settlement   본인 정산 계좌 조회
 * POST /api/producer-settlement  본인 정산 계좌 등록/수정
 *
 * ⚠️ KYC — bank_account 는 매우 민감. RLS 가 본인 only 로 격리.
 *    PortOne 본인인증/계좌인증 도입 시 is_verified=TRUE 로 전환.
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  const limited = await enforceRateLimit(request as any, 'search', user.id)
  if (limited) return limited

  const { data } = await supabase
    .from("producer_settlements")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle()

  return NextResponse.json({ settlement: data })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 })

  const bank_code = (body.bank_code || "").toString().slice(0, 10)
  const bank_name = (body.bank_name || "").toString().slice(0, 50)
  const bank_account = (body.bank_account || "").toString().replace(/[^0-9]/g, "").slice(0, 30)
  const account_holder = (body.account_holder || "").toString().slice(0, 50)
  const business_number = (body.business_number || "").toString().replace(/[^0-9]/g, "").slice(0, 12) || null

  if (!bank_code || !bank_account || !account_holder) {
    return NextResponse.json({ error: "은행/계좌번호/예금주 모두 필수" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("producer_settlements")
    .upsert({
      user_id: user.id,
      bank_code,
      bank_name,
      bank_account,
      account_holder,
      business_number,
      is_verified: false,        // 인증 도입 전이라 항상 false
    })
    .select()
    .single()

  if (error) {
    console.error("[producer-settlement POST]", error)
    return NextResponse.json({ error: "저장 실패" }, { status: 500 })
  }
  return NextResponse.json({ settlement: data })
}
