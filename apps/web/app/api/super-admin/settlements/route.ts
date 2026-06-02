import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { createClient as createAdmin } from "@supabase/supabase-js"
import { verifySuperAdminToken, SUPER_ADMIN_COOKIE } from "@/lib/services/super-admin"
import { enforceRateLimit } from "@/lib/services/ratelimit"

/**
 * 슈퍼관리자 — 정산 관리
 *
 * GET  : 정산 대기 중인 주문 (status='confirmed') 을 판매자별로 그룹핑
 * POST : 선택한 주문들을 status='settled' 로 일괄 전환
 *
 * 송금은 운영자가 별도로(은행 앱·펌뱅킹 API) 처리한 뒤,
 * 이 페이지에서 "정산 완료 표시" 만 클릭.
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

export async function GET(request: NextRequest) {
  if (!(await requireSuper())) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 })
  }
  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 })

  const url = new URL(request.url)
  const plazaFilter = url.searchParams.get("plaza")    // 광장별 필터
  const statusFilter = url.searchParams.get("status") || "confirmed"  // 'confirmed' | 'settled' | 'all'

  let q: any = admin
    .from("local_food_orders")
    .select(`
      id, plaza_id, status, amount, fee_amount, settlement_amount,
      buyer_id, seller_id, paid_at, confirmed_at, settled_at, created_at,
      items:local_food_order_items(id, title, quantity, subtotal)
    `)
    .order("confirmed_at", { ascending: false, nullsFirst: false })

  if (statusFilter === "confirmed") q = q.eq("status", "confirmed")
  else if (statusFilter === "settled") q = q.eq("status", "settled")
  else q = q.in("status", ["confirmed", "settled"])

  if (plazaFilter) q = q.eq("plaza_id", plazaFilter)

  const { data: orders, error } = await q
  if (error) {
    console.error("[settlements GET]", error)
    return NextResponse.json({ error: "조회 실패" }, { status: 500 })
  }

  // 판매자 프로필 + 정산계좌 보강
  const sellerIds = Array.from(new Set((orders || []).map((o: any) => o.seller_id)))
  const [profilesRes, settlementsRes] = await Promise.all([
    sellerIds.length
      ? admin.from("profiles").select("id, nickname, full_name, phone").in("id", sellerIds)
      : Promise.resolve({ data: [] }),
    sellerIds.length
      ? admin
          .from("producer_settlements")
          .select("user_id, bank_name, bank_code, bank_account, account_holder, business_number")
          .in("user_id", sellerIds)
      : Promise.resolve({ data: [] }),
  ])
  const profileMap = new Map(((profilesRes.data || []) as any[]).map((p) => [p.id, p]))
  const settleMap = new Map(((settlementsRes.data || []) as any[]).map((s) => [s.user_id, s]))

  // 판매자별 그룹핑
  const groups = new Map<string, any>()
  for (const o of (orders || []) as any[]) {
    if (!groups.has(o.seller_id)) {
      groups.set(o.seller_id, {
        seller_id: o.seller_id,
        seller_profile: profileMap.get(o.seller_id) || null,
        settlement: settleMap.get(o.seller_id) || null,
        orders: [],
        total_settlement: 0,
        order_count: 0,
      })
    }
    const g = groups.get(o.seller_id)
    g.orders.push(o)
    g.total_settlement += o.settlement_amount || 0
    g.order_count += 1
  }

  return NextResponse.json({
    groups: Array.from(groups.values()).sort(
      (a, b) => b.total_settlement - a.total_settlement,
    ),
  })
}

export async function POST(request: NextRequest) {
  if (!(await requireSuper())) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 })
  }

  const limited = await enforceRateLimit(request, "admin-notify", "super-admin")
  if (limited) return limited

  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 })

  const body = await request.json().catch(() => null)
  const orderIds = Array.isArray(body?.order_ids) ? body.order_ids : []
  if (orderIds.length === 0) {
    return NextResponse.json({ error: "주문이 선택되지 않았습니다" }, { status: 400 })
  }

  // confirmed 상태인 것만 settled 로 — 동시성 가드
  const { data, error } = await admin
    .from("local_food_orders")
    .update({
      status: "settled",
      settled_at: new Date().toISOString(),
    })
    .in("id", orderIds)
    .eq("status", "confirmed")
    .select("id")

  if (error) {
    console.error("[settlements POST]", error)
    return NextResponse.json({ error: "처리 실패" }, { status: 500 })
  }
  return NextResponse.json({ updated: data?.length || 0 })
}
