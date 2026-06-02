import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { checkAdminAuth, getAdminWriteClient, logAdminAction } from "@/lib/services/admin-auth"
import { enforceRateLimit } from "@/lib/services/ratelimit"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/maintenance
 * Any admin can view the current maintenance state.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user } = await getAuthedUser(supabase, request)

    if (!user) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 })
    }

    const auth = await checkAdminAuth(supabase, user.id)
    if (!auth.ok) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })
    }

    const { data, error } = await supabase
      .from("site_settings")
      .select("key, value")
      .in("key", ["maintenance_mode", "maintenance_settings"])

    if (error) {
      console.error("[admin/maintenance GET]", error)
      return NextResponse.json({ error: "설정을 불러올 수 없습니다." }, { status: 500 })
    }

    const result: Record<string, unknown> = {}
    for (const row of data ?? []) {
      try {
        result[row.key] =
          typeof row.value === "string" ? JSON.parse(row.value) : row.value
      } catch {
        result[row.key] = row.value
      }
    }

    return NextResponse.json({
      enabled: result.maintenance_mode ?? false,
      settings: result.maintenance_settings ?? null,
    })
  } catch (e: any) {
    console.error("[admin/maintenance GET]", e)
    return NextResponse.json({ error: "처리에 실패했습니다." }, { status: 500 })
  }
}

/**
 * POST /api/admin/maintenance
 * Only god-mode (super admin) can toggle maintenance mode.
 * Body: { enabled: boolean, message?: string, allowed_ips?: string[], settings?: object }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user } = await getAuthedUser(supabase, request)

    if (!user) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 })
    }

    const auth = await checkAdminAuth(supabase, user.id)
    if (!auth.ok) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })
    }

    if (!auth.isGodMode) {
      return NextResponse.json(
        { error: "슈퍼관리자만 공사중 모드를 변경할 수 있습니다." },
        { status: 403 }
      )
    }

    const limited = await enforceRateLimit(request as any, "mutate", user.id)
    if (limited) return limited

    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 })
    }

    const { enabled, message, allowed_ips, settings } = body ?? {}

    if (typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "enabled (boolean) 필드가 필요합니다." },
        { status: 400 }
      )
    }

    const admin = await getAdminWriteClient()
    if (!admin) {
      return NextResponse.json({ error: "서버 설정 오류 (admin key)" }, { status: 500 })
    }

    // Build the maintenance_settings value.
    // If the client sent the full settings object, use it; otherwise build from individual fields.
    const maintenanceSettings = settings
      ? { ...settings, enabled }
      : { enabled, message: message ?? "", allowed_ips: allowed_ips ?? [] }

    const now = new Date().toISOString()

    // Upsert maintenance_mode (the boolean flag read by the mobile app)
    const { error: modeError } = await admin
      .from("site_settings")
      .upsert(
        { key: "maintenance_mode", value: JSON.stringify(enabled), updated_at: now },
        { onConflict: "key" }
      )

    if (modeError) {
      console.error("[admin/maintenance POST] maintenance_mode upsert", modeError)
      return NextResponse.json({ error: "maintenance_mode 저장 실패" }, { status: 500 })
    }

    // Upsert maintenance_settings (full settings object)
    const { error: settingsError } = await admin
      .from("site_settings")
      .upsert(
        {
          key: "maintenance_settings",
          value: JSON.stringify(maintenanceSettings),
          updated_at: now,
        },
        { onConflict: "key" }
      )

    if (settingsError) {
      console.error("[admin/maintenance POST] maintenance_settings upsert", settingsError)
      return NextResponse.json({ error: "maintenance_settings 저장 실패" }, { status: 500 })
    }

    // 감사 로그 — 점검 모드 토글은 플랫폼 전체 영향이므로 반드시 기록
    void logAdminAction({
      adminId: user.id,
      action: enabled ? 'maintenance_on' : 'maintenance_off',
      targetTable: 'site_settings',
      targetId: 'maintenance_mode',
      beforeData: { enabled, settings: maintenanceSettings },
    })

    return NextResponse.json({
      success: true,
      enabled,
      settings: maintenanceSettings,
    })
  } catch (e: any) {
    console.error("[admin/maintenance POST]", e)
    return NextResponse.json({ error: "처리에 실패했습니다." }, { status: 500 })
  }
}
