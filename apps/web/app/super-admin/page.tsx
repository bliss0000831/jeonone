/**
 * 슈퍼 관리자 진입점 — gwangjang.app/admin (미들웨어가 /super-admin 으로 rewrite).
 *
 * 인증 안 됐으면 로그인 폼, 됐으면 대시보드.
 * 두 단계가 다른 컴포넌트로 분리돼있고 서버 측에서 쿠키 검증 → SSR 분기.
 */
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { verifySuperAdminToken, SUPER_ADMIN_COOKIE } from '@/lib/services/super-admin'
import { SuperAdminLogin } from '@/components/super-admin/login'
import { SuperAdminDashboard } from '@/components/super-admin/dashboard'

export const dynamic = 'force-dynamic'

export default async function SuperAdminPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SUPER_ADMIN_COOKIE)?.value
  const authed = await verifySuperAdminToken(token)

  if (!authed) {
    return <SuperAdminLogin />
  }

  // 인증됨 — 모든 지역 + 통계 fetch
  const supabase = await createClient()
  const [plazasRes, plazaAdminsRes] = await Promise.all([
    supabase
      .from('plazas')
      .select('id, name, parent_region, is_active, is_open_soon, sort_order, coverage')
      .order('sort_order', { ascending: true }),
    supabase
      .from('plaza_admins')
      .select('plaza_id, user_id, role'),
  ])

  return (
    <SuperAdminDashboard
      plazas={(plazasRes.data ?? []) as any[]}
      plazaAdmins={(plazaAdminsRes.data ?? []) as any[]}
    />
  )
}
