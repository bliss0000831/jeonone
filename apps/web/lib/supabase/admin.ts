import { createClient } from '@supabase/supabase-js'
import type { Database } from '@gwangjang/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 서비스 롤 키로 생성된 관리자 클라이언트 (RLS 우회).
 * ⚠️ 서버 측에서만 사용할 것.
 *
 * 모듈 레벨 싱글턴 — cold start 당 1회만 생성.
 * service_role 키는 stateless (세션·사용자 바인딩 없음) 이므로
 * 요청 간 재사용해도 사용자 데이터 교차 오염 불가.
 */
let _cachedAdmin: SupabaseClient<Database> | null = null

export function createAdminClient(): SupabaseClient<Database> {
  if (_cachedAdmin) return _cachedAdmin

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('Supabase admin 환경 변수 누락')
  }

  _cachedAdmin = createClient<Database>(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
  return _cachedAdmin
}
