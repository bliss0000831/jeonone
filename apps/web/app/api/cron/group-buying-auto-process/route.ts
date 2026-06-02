import { NextResponse, type NextRequest } from "next/server"
import { createClient as createAdmin } from "@supabase/supabase-js"
import { verifyCronAuth } from "@/lib/security/cron-auth"
import { logErrorWithContext } from "@/lib/logger"

/**
 * GET /api/cron/group-buying-auto-process
 *
 * 마감일 지난 공구 글 자동 처리:
 *   - paid 주문 수 ≥ min_participants → 'confirmed' (성사)
 *   - 미달 → 'cancelled' + 주문 환불 ('refunded')
 *
 * 인증: CRON_SECRET 헤더 또는 Vercel cron (관례상 /api/cron/* 는 Vercel 스케줄러용).
 *
 * 호출 방법:
 *   1. Vercel Cron — vercel.json 에 schedule 추가 (예: "0 * * * *" 매시 정각)
 *   2. 외부 cron — Authorization: Bearer $CRON_SECRET 헤더로 호출
 *   3. 슈퍼관리자가 수동으로 호출 (UI 버튼)
 */
export async function GET(request: NextRequest) {
  // 인증 — verifyCronAuth (timing-safe + Vercel cron 자동 인식)
  if (!verifyCronAuth(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: "service-role 키 미설정" }, { status: 500 })
  }
  const admin = createAdmin(url, key, { auth: { persistSession: false } })

  const { data, error } = await admin.rpc("group_buying_auto_process")
  if (error) {
    logErrorWithContext("[cron] group-buying-auto-process failed", error, {
      cron: "group-buying-auto-process",
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

// 슈퍼관리자가 POST 로도 호출 가능 (수동 트리거)
export async function POST(request: NextRequest) {
  // 슈퍼관리자 쿠키 검증
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

  const { data, error } = await admin.rpc("group_buying_auto_process")
  if (error) {
    logErrorWithContext("[cron] group-buying-auto-process manual trigger failed", error, {
      cron: "group-buying-auto-process",
      trigger: "POST",
    })
    return NextResponse.json({ error: "처리 실패" }, { status: 500 })
  }
  return NextResponse.json({ processed: data || [], count: (data || []).length })
}
