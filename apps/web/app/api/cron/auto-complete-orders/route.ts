import { NextResponse, type NextRequest } from "next/server"
import { createClient as createAdmin } from "@supabase/supabase-js"
import { verifyCronAuth } from "@/lib/security/cron-auth"
import { logErrorWithContext } from "@/lib/logger"

/**
 * GET /api/cron/auto-complete-orders
 *
 * 수령 후 7일 (또는 발송 후 14일) 지난 주문을 자동으로 status='completed' 처리.
 *   - local_food_orders
 *   - group_buying_orders
 *   - group_buying_participants
 *
 * SQL 함수 auto_complete_orders() 가 모든 도메인을 한 번에 처리.
 *
 * 인증: Vercel Cron 또는 CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: "service-role 키 미설정" }, { status: 500 })
  }
  const admin = createAdmin(url, key, { auth: { persistSession: false } })

  const { data, error } = await admin.rpc("auto_complete_orders")
  if (error) {
    logErrorWithContext("[cron] auto-complete-orders failed", error, {
      cron: "auto-complete-orders",
      trigger: "GET",
    })
    return NextResponse.json({ error: "처리 실패" }, { status: 500 })
  }
  return NextResponse.json({
    processed: data || [],
    count: (data || []).length,
    timestamp: new Date().toISOString(),
  })
}

// 슈퍼관리자 수동 트리거
export async function POST(request: NextRequest) {
  const { cookies } = await import("next/headers")
  const { verifySuperAdminToken, SUPER_ADMIN_COOKIE } = await import("@/lib/services/super-admin")
  const c = await cookies()
  const token = c.get(SUPER_ADMIN_COOKIE)?.value
  const ok = await verifySuperAdminToken(token)
  if (!ok) return NextResponse.json({ error: "권한 없음" }, { status: 403 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: "service-role 키 미설정" }, { status: 500 })
  }
  const admin = createAdmin(url, key, { auth: { persistSession: false } })

  const { data, error } = await admin.rpc("auto_complete_orders")
  if (error) {
    logErrorWithContext("[cron] auto-complete-orders manual trigger failed", error, {
      cron: "auto-complete-orders",
      trigger: "POST",
    })
    return NextResponse.json({ error: "처리 실패" }, { status: 500 })
  }
  return NextResponse.json({ processed: data || [], count: (data || []).length })
}
