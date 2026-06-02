import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/health
 *
 * Vercel/Uptime 모니터링용 헬스체크.
 * Supabase 연결성 + 빌드 정보 반환.
 *
 * 200 = 전체 건강
 * 503 = 한 곳이라도 실패
 */
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  const checks: Record<string, { ok: boolean; ms?: number; error?: string }> = {}
  const startedAt = Date.now()

  // 1) Supabase 연결성 — 가벼운 SELECT
  const sbStart = Date.now()
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("plazas")
      .select("id", { head: true, count: "exact" })
      .limit(1)
    checks.supabase = error
      ? { ok: false, error: error.message.slice(0, 100), ms: Date.now() - sbStart }
      : { ok: true, ms: Date.now() - sbStart }
  } catch (e: any) {
    checks.supabase = {
      ok: false,
      error: (e?.message || "exception").slice(0, 100),
      ms: Date.now() - sbStart,
    }
  }

  const allOk = Object.values(checks).every((c) => c.ok)
  const status = allOk ? 200 : 503

  return NextResponse.json(
    {
      ok: allOk,
      checks,
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev",
      env: process.env.VERCEL_ENV || process.env.NODE_ENV,
      uptime_check_ms: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    },
    { status, headers: { "Cache-Control": "no-store" } },
  )
}
