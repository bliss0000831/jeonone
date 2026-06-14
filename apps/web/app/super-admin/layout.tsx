/**
 * 슈퍼 어드민 공통 레이아웃 — 본사 전용 페이지들에 통합 사이드바.
 *
 * 인증: SUPER_ADMIN_COOKIE 검증 (각 페이지에서도 한 번 더 체크).
 * 지역 어드민(/admin) 과 시각적으로 구분되도록 다크 톤 + 왕관 아이콘.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  verifySuperAdminToken,
  SUPER_ADMIN_COOKIE,
} from '@/lib/services/super-admin'
import { SuperAdminNav } from '@/components/super-admin/super-admin-nav'
import { SuperAdminThemeWrapper } from '@/components/super-admin/theme-wrapper'
import { SuperAdminLogin } from '@/components/super-admin/login'

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const token = cookieStore.get(SUPER_ADMIN_COOKIE)?.value
  const authed = await verifySuperAdminToken(token)

  if (!authed) {
    // 미인증 — 사이드바·하위 페이지 콘텐츠 노출하지 않고 로그인 폼만 렌더.
    // children 을 렌더하지 않으므로 모든 하위 경로(stats, billing 등)도 보호됨.
    return (
      <SuperAdminThemeWrapper>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
          <SuperAdminLogin />
        </div>
      </SuperAdminThemeWrapper>
    )
  }

  return (
    // 슈퍼어드민 전용 테마 — 지역 사이트는 화이트 강제, 슈퍼어드민만 토글 가능 (기본 화이트)
    <SuperAdminThemeWrapper>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex">
        <SuperAdminNav authed={authed} />
        <main className="flex-1 min-w-0 overflow-x-auto">{children}</main>
      </div>
    </SuperAdminThemeWrapper>
  )
}
