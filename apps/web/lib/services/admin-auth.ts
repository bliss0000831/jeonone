/**
 * 어드민 권한 체크 통합 헬퍼.
 *
 * 3중 권한 시스템 (super-admin 쿠키 / legacy profiles.role / plaza_admins) 을
 * 일관되게 검증.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface AdminAuth {
  ok: boolean
  isLegacyAdmin: boolean      // profile.role IN (admin, superadmin)
  isLegacySuper: boolean      // profile.role = superadmin
  isSuperPlaza: boolean       // plaza_admins 의 super 권한
  isAnyPlazaAdmin: boolean    // plaza_admins 에 어떤 row 라도 있음
  isGodMode: boolean          // = isLegacySuper || isSuperPlaza
  plazaIds: string[]          // 이 user 가 admin 인 plaza 들
  /** 광장별 역할 맵: { "chuncheon": "owner", "nambu": "finance" } */
  plazaRoles: Record<string, string>
}

/**
 * Supabase user 의 어드민 권한 종합 체크.
 * 모든 admin 라우트에서 이 함수 한 번 호출하면 모든 정보 다 받음.
 */
export async function checkAdminAuth(
  supabase: SupabaseClient,
  userId: string,
): Promise<AdminAuth> {
  const [{ data: profile }, { data: pa }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', userId).maybeSingle(),
    supabase.from('plaza_admins').select('role, plaza_id').eq('user_id', userId),
  ])

  const isLegacyAdmin = !!profile && ['admin', 'superadmin'].includes(profile.role)
  const isLegacySuper = profile?.role === 'superadmin'
  const isSuperPlaza = (pa || []).some((r: any) => r.role === 'super')
  const isAnyPlazaAdmin = (pa || []).length > 0
  const isGodMode = isLegacySuper || isSuperPlaza
  const plazaIds = (pa || []).map((r: any) => r.plaza_id).filter(Boolean)
  const plazaRoles: Record<string, string> = {}
  for (const r of pa || []) {
    if (r.plaza_id) plazaRoles[r.plaza_id] = r.role
  }

  return {
    ok: isLegacyAdmin || isAnyPlazaAdmin,
    isLegacyAdmin,
    isLegacySuper,
    isSuperPlaza,
    isAnyPlazaAdmin,
    isGodMode,
    plazaIds,
    plazaRoles,
  }
}

/**
 * 특정 광장 admin 여부.
 * - super 면 모든 광장 통과
 * - 그 외엔 plaza_admins 에 그 plaza 가 있는지
 */
export function canAccessPlaza(auth: AdminAuth, plazaId: string | null): boolean {
  if (auth.isGodMode) return true
  if (!plazaId) return false
  return auth.plazaIds.includes(plazaId)
}

/**
 * 특정 광장에서의 실효 역할 반환.
 * super/legacy superadmin → 'super'
 * plaza_admins 에 row 있으면 → 해당 role
 * legacy admin (profiles.role = 'admin') → 'owner'
 */
export function getEffectiveRole(auth: AdminAuth, plazaId: string | null): string {
  if (auth.isGodMode) return 'super'
  if (plazaId && auth.plazaRoles[plazaId]) return auth.plazaRoles[plazaId]
  if (auth.isLegacyAdmin) return 'owner'
  return 'viewer'
}

/**
 * 관리자 mutation 용 service_role 클라이언트.
 * 호출 전 반드시 caller 가 admin 인지 검증해야 함 (그 외 사용 금지).
 * RLS 우회 — admin 이 다른 사용자 글을 수정/삭제할 때 사용.
 *
 * ⚠️ 모듈 레벨 캐싱 안전성:
 *   - service_role 키는 사용자별 세션이 없는 stateless HTTP 클라이언트
 *   - persistSession: false → 요청 간 사용자 데이터 교차 오염 불가
 *   - 서버리스 cold start 당 1회 생성 → 성능 최적화
 */
let cachedAdminClient: SupabaseClient | null = null

export async function getAdminWriteClient(): Promise<SupabaseClient | null> {
  if (cachedAdminClient) return cachedAdminClient
  const { createClient } = await import("@supabase/supabase-js")
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  cachedAdminClient = createClient(url, key, { auth: { persistSession: false } })
  return cachedAdminClient
}

/**
 * 관리자 override 액션 audit log.
 * admin 이 다른 사용자 글/리소스를 수정·삭제할 때 호출. 분쟁 추적용.
 * 실패해도 throw 안 함 (silent — 메인 액션 흐름 차단 안 하기 위함).
 */
export async function logAdminAction(opts: {
  adminId: string
  action: 'update' | 'delete' | 'hide' | 'restore' | 'force_status' | string
  targetTable: string
  targetId: string
  targetUserId?: string | null
  plazaId?: string | null
  beforeData?: unknown
  reason?: string | null
}): Promise<void> {
  try {
    const admin = await getAdminWriteClient()
    if (!admin) return
    await admin.from('admin_actions').insert({
      admin_id: opts.adminId,
      action: opts.action,
      target_table: opts.targetTable,
      target_id: opts.targetId,
      target_user_id: opts.targetUserId ?? null,
      plaza_id: opts.plazaId ?? null,
      before_data: opts.beforeData ?? null,
      reason: opts.reason ?? null,
    })
  } catch (e) {
    console.warn('[admin-auth] audit log insert failed:', e)
  }
}
