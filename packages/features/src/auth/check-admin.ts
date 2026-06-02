/**
 * checkIsAdmin — Supabase 기반 관리자 판별 순수 로직.
 *
 * 웹/모바일 공통. Hook 이 아니라 async 함수이므로
 * 각 앱에서 useIsAdmin hook 으로 감싸서 사용.
 *
 * 인정 케이스:
 *  1) profiles.role IN ('admin', 'superadmin')          → legacy 전역 관리자
 *  2) plaza_admins.role === 'super' (어떤 광장이든)       → cross-plaza 슈퍼
 *  3) plaza_admins.role IN ('admin','super') for plazaId → 현재 광장 관리자
 *  4) 그 외 → false
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export async function checkIsAdmin(
  supabase: SupabaseClient,
  userId: string,
  plazaId: string | null,
): Promise<boolean> {
  const [profileRes, paRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("plaza_admins")
      .select("role, plaza_id")
      .eq("user_id", userId),
  ])

  // 1) 슈퍼관리자만 전역 (admin은 광장별 격리)
  const role = (profileRes.data as any)?.role
  if (role === "superadmin") return true

  const rows = ((paRes.data as any[]) ?? []) as Array<{
    role: string
    plaza_id: string
  }>

  // 2) cross-plaza 슈퍼
  if (rows.some((r) => r?.role === "super")) return true

  // 3) 현재 광장 관리자
  if (plazaId) {
    const cur = rows.find((r) => r?.plaza_id === plazaId)
    if (cur?.role === "admin" || cur?.role === "super") return true
  }

  return false
}
