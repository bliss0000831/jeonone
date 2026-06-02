/**
 * 관리자 역할별 권한 매트릭스 유틸리티.
 *
 * 광장 관리자 역할:
 *   super  — 모든 광장 + 슈퍼관리자 페이지
 *   owner  — 해당 광장 모든 메뉴 + 다른 관리자 관리 + 설정
 *   finance — 대시보드(결제), 결제/정산, 매출통계, 프로모션
 *   content — 대시보드(콘텐츠), 콘텐츠 관리, 프로모션, 통계
 *   support — 대시보드(문의), 고객센터, 회원 기본 조회
 *   viewer  — 대시보드, 통계 (읽기 전용)
 *
 * 레거시 호환:
 *   admin     → owner와 동일 취급
 *   moderator → content와 동일 취급
 */

export type AdminRole =
  | 'super'
  | 'owner'
  | 'admin'      // 레거시 → owner
  | 'moderator'  // 레거시 → content
  | 'finance'
  | 'content'
  | 'support'
  | 'viewer'

/**
 * 권한 패턴 매칭.
 * - '*'       → 모든 경로 허용
 * - 'billing' → 정확히 'billing' 경로만
 * - 'billing.*' → 'billing' + 'billing/xxx' 하위 전부
 * - 'members.view' → 회원 조회만 (수정/제재 불가)
 */
const ROLE_PERMISSIONS: Record<string, string[]> = {
  super:     ['*'],
  owner:     ['*'],
  admin:     ['*'],  // 레거시 → owner 동일
  finance:   [
    'dashboard', 'dashboard.billing',
    'billing', 'billing.*',
    'stats', 'stats.*',
    'promotion', 'promotion.*',
  ],
  content:   [
    'dashboard', 'dashboard.content',
    'content', 'content.*',
    'promotion', 'promotion.*',
    'stats', 'stats.*',
  ],
  moderator: [  // 레거시 → content 동일
    'dashboard', 'dashboard.content',
    'content', 'content.*',
    'promotion', 'promotion.*',
    'stats', 'stats.*',
  ],
  support:   [
    'dashboard', 'dashboard.support',
    'support', 'support.*',
    'members.view',
  ],
  viewer:    [
    'dashboard',
    'stats', 'stats.*',
  ],
}

/**
 * 역할이 특정 경로에 접근 가능한지 확인.
 *
 * @param role - 관리자 역할 (plaza_admins.role)
 * @param path - 체크할 경로 (예: 'billing', 'content.reports', 'stats.visitors')
 * @returns 접근 허용 여부
 *
 * @example
 *   hasPermission('finance', 'billing')        // true
 *   hasPermission('finance', 'billing.refunds') // true
 *   hasPermission('finance', 'content')         // false
 *   hasPermission('support', 'members.view')    // true
 *   hasPermission('support', 'members')         // false (members.view만 허용)
 */
export function hasPermission(role: string, path: string): boolean {
  const perms = ROLE_PERMISSIONS[role]
  if (!perms) return false
  if (perms.includes('*')) return true

  return perms.some((p) => {
    // 정확 매칭
    if (p === path) return true
    // 와일드카드 매칭: 'billing.*' → 'billing' + 'billing/xxx'
    if (p.endsWith('.*')) {
      const base = p.slice(0, -2) // 'billing'
      return path === base || path.startsWith(base + '.')
    }
    return false
  })
}

/**
 * 역할의 표시 이름.
 */
export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    super: '슈퍼관리자',
    owner: '최고관리자',
    admin: '관리자',
    moderator: '모더레이터',
    finance: '재무담당',
    content: '콘텐츠관리자',
    support: 'CS담당',
    viewer: '통계열람',
  }
  return labels[role] || role
}

/**
 * 역할의 뱃지 색상 클래스.
 */
export function getRoleBadgeColor(role: string): string {
  const colors: Record<string, string> = {
    super: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    owner: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    finance: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    content: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    support: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    viewer: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    moderator: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  }
  return colors[role] || 'bg-gray-100 text-gray-600'
}

/** URL 경로를 권한 경로로 변환 (레거시 경로도 매핑) */
export function urlToPermissionPath(pathname: string): string {
  // /admin/billing/refunds → billing.refunds
  // /admin/content/reports → content.reports
  const match = pathname.match(/^\/admin\/(.+)/)
  if (!match) return 'dashboard'

  const raw = match[1].replace(/\//g, '.')

  // 레거시 경로 → 신규 권한 키 매핑
  const LEGACY_MAP: Record<string, string> = {
    // 콘텐츠
    'properties':             'content',
    'properties.highlight':   'content',
    'properties.reported':    'content.reports',
    'board':                  'content',
    'board.free':             'content',
    'board.daily':            'content',
    'board.living':           'content',
    'board.restaurant':       'content',
    'board.qna':              'content',
    'community':              'content',
    'service':                'content',
    'moderation.reports':     'content.reports',
    'moderation.keywords':    'content.keywords',
    // 프로모션
    'settings.banner':        'promotion',
    'settings.popup':         'promotion',
    'settings.events':        'promotion',
    'banners':                'promotion',
    // 고객센터
    'board.inquiry':          'support',
    'board.notice':           'support',
    'board.faq':              'support',
    // 통계
    'statistics.overview':    'stats',
    'statistics.visitors':    'stats.visitors',
    'statistics.properties':  'stats.properties',
    'statistics.transactions':'stats.transactions',
    'statistics.popular-search':'stats.search',
    'statistics.regions':     'stats.regions',
    // 회원
    'account-requests':       'members',
    'members.point':          'members',
    'members.visitor-stats':  'members.view',
    'members.communication':  'members',
    'members.mail':           'members',
    'members.notify':         'members',
    // 설정
    'theme':                  'settings',
    'theme.basic-info':       'settings',
    'theme.footer':           'settings',
    'theme.menu':             'settings',
    'theme.slider':           'settings',
    'seo':                    'settings',
    'seo.basic':              'settings',
    'seo.meta':               'settings',
    'seo.sitemap':            'settings',
    'appearance':             'settings',
    'homepage-content':       'settings',
    'page-heroes':            'settings',
    'audit-log':              'settings',
    'system-health':          'settings',
    'sessions':               'settings',
    'backup':                 'settings',
    'permissions':            'settings',
    'points':                 'billing',
  }

  return LEGACY_MAP[raw] || raw
}

/**
 * 사이드바 메뉴 필터링 — 역할별로 접근 가능한 메뉴만 반환.
 */
export function filterMenuByRole<T extends { permKey: string; children?: T[] }>(
  items: T[],
  role: string,
): T[] {
  return items
    .map((item) => {
      // 부모 메뉴에 권한이 있으면 전체 표시
      if (hasPermission(role, item.permKey)) {
        return item
      }
      // 자식 중 접근 가능한 것만 필터
      if (item.children) {
        const filtered = item.children.filter((c) => hasPermission(role, c.permKey))
        if (filtered.length > 0) {
          return { ...item, children: filtered }
        }
      }
      return null
    })
    .filter(Boolean) as T[]
}
