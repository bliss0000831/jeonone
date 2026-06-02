/**
 * Auth — Supabase 호출 + 권한 체크 헬퍼.
 *
 * 점진 이전 — 현재는 lib/services/admin-auth.ts, lib/services/super-admin.ts 에 있음.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthProfile, AdminAuth } from './types'

export async function getCurrentProfile(_supabase: SupabaseClient): Promise<AuthProfile | null> {
  throw new Error('not implemented')
}

/**
 * 어드민 권한 종합 체크. (lib/services/admin-auth.ts:checkAdminAuth 와 동일)
 * 점진 이전 시 그대로 옮겨오기.
 */
export async function checkAdminAuth(
  _supabase: SupabaseClient,
  _userId: string,
): Promise<AdminAuth> {
  throw new Error('not implemented — use lib/services/admin-auth.ts (점진 이전)')
}

export function canAccessPlaza(_auth: AdminAuth, _plazaId: string | null): boolean {
  throw new Error('not implemented')
}

/**
 * 슈퍼 어드민 쿠키 검증 (서버 측만).
 */
export async function verifySuperAdmin(_token: string | undefined): Promise<boolean> {
  throw new Error('not implemented — use lib/services/super-admin.ts')
}
