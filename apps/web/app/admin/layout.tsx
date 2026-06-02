'use client'

/**
 * 관리자 레이아웃 — Pro Admin Design.
 *
 * 사이드바: 다크 배경 + 미니멀 타이포, 그룹 헤딩 분리
 * 헤더: 슬림 + 검색 + 유저 pill
 * 본문: 밝은 회색 배경 (#fafafa / dark)
 */

import { useState, useEffect, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Settings,
  Users,
  FileText,
  Search,
  BarChart3,
  Moon,
  Sun,
  Home,
  Store,
  Menu,
  X,
  Loader2,
  Megaphone,
  Headphones,
  CreditCard,
  LogOut,
  ExternalLink,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import GlobalSearch from './global-search'
import PlazaSwitcher from './plaza-switcher'
import {
  hasPermission,
  getRoleLabel,
  getRoleBadgeColor,
  type AdminRole,
} from '@/lib/services/admin-permissions'

// ─── Menu Structure ─────────────────────────────────────────────
interface MenuItem {
  id: string
  label: string
  icon: React.ReactNode
  href?: string
  permKey: string
  children?: { id: string; label: string; href: string; permKey: string }[]
}

const menuItems: MenuItem[] = [
  {
    id: 'dashboard',
    label: '대시보드',
    icon: <LayoutDashboard className="w-[18px] h-[18px]" />,
    href: '/admin',
    permKey: 'dashboard',
  },
  {
    id: 'members',
    label: '회원 관리',
    icon: <Users className="w-[18px] h-[18px]" />,
    permKey: 'members',
    children: [
      { id: 'member-list',           label: '일반 회원',       href: '/admin/members',              permKey: 'members' },
      { id: 'member-business',       label: '비즈니스/업체',   href: '/admin/account-requests',     permKey: 'members' },
      { id: 'member-points',         label: '포인트 관리',     href: '/admin/members/point',        permKey: 'members' },
      { id: 'member-sanctions',      label: '제재 관리',       href: '/admin/members/sanctions',    permKey: 'members' },
      { id: 'member-visitors',       label: '방문자 통계',     href: '/admin/members/visitor-stats', permKey: 'members.view' },
      { id: 'member-communication',  label: '알림/메일 발송',  href: '/admin/members/communication', permKey: 'members' },
    ],
  },
  {
    id: 'billing',
    label: '결제·정산',
    icon: <CreditCard className="w-[18px] h-[18px]" />,
    permKey: 'billing',
    children: [
      { id: 'billing-overview',    label: '결제 내역',       href: '/admin/billing',             permKey: 'billing' },
      { id: 'billing-refunds',     label: '취소/환불',       href: '/admin/billing/refunds',     permKey: 'billing.refunds' },
      { id: 'billing-settlements', label: '업체별 정산',     href: '/admin/billing/settlements', permKey: 'billing.settlements' },
      { id: 'billing-stats',       label: '매출 통계',       href: '/admin/billing/stats',       permKey: 'billing.stats' },
      { id: 'billing-boosts',      label: '부스트/구독',     href: '/admin/billing/boosts',      permKey: 'billing.boosts' },
      { id: 'billing-points',      label: '포인트 시스템',   href: '/admin/points',              permKey: 'billing' },
    ],
  },
  {
    id: 'content',
    label: '콘텐츠',
    icon: <FileText className="w-[18px] h-[18px]" />,
    permKey: 'content',
    children: [
      { id: 'content-properties',  label: '부동산',                  href: '/admin/properties',            permKey: 'content' },
      { id: 'content-services',    label: '인테리어/이사/청소/수리', href: '/admin/service',               permKey: 'content' },
      { id: 'content-community',   label: '나눔/공구/모임/신장개업', href: '/admin/community',             permKey: 'content' },
      { id: 'content-boards',      label: '커뮤니티',                href: '/admin/board',                 permKey: 'content' },
      { id: 'content-reports',     label: '신고 처리',               href: '/admin/moderation/reports',    permKey: 'content.reports' },
      { id: 'content-keywords',    label: '금칙어 설정',             href: '/admin/moderation/keywords',   permKey: 'content.keywords' },
    ],
  },
  {
    id: 'promotion',
    label: '프로모션',
    icon: <Megaphone className="w-[18px] h-[18px]" />,
    permKey: 'promotion',
    children: [
      { id: 'promo-banners',  label: '배너 관리',          href: '/admin/settings/banner',  permKey: 'promotion' },
      { id: 'promo-popups',   label: '팝업 관리',          href: '/admin/settings/popup',   permKey: 'promotion' },
      { id: 'promo-boosts',   label: '부스트(상단노출)',   href: '/admin/promotion/boosts', permKey: 'promotion' },
      { id: 'promo-events',   label: '관광 달력',          href: '/admin/settings/events',  permKey: 'promotion' },
    ],
  },
  {
    id: 'support',
    label: '고객센터',
    icon: <Headphones className="w-[18px] h-[18px]" />,
    permKey: 'support',
    children: [
      { id: 'support-inquiry',  label: '1:1 문의',    href: '/admin/board/inquiry',  permKey: 'support' },
      { id: 'support-notice',   label: '공지사항',    href: '/admin/board/notice',   permKey: 'support' },
      { id: 'support-faq',      label: 'FAQ',         href: '/admin/board/faq',      permKey: 'support' },
    ],
  },
  {
    id: 'statistics',
    label: '통계',
    icon: <BarChart3 className="w-[18px] h-[18px]" />,
    permKey: 'stats',
    children: [
      { id: 'stats-overview',    label: '종합 대시보드',  href: '/admin/statistics/overview',       permKey: 'stats' },
      { id: 'stats-visitors',    label: '방문자 분석',    href: '/admin/statistics/visitors',       permKey: 'stats.visitors' },
      { id: 'stats-properties',  label: '매물 통계',      href: '/admin/statistics/properties',     permKey: 'stats.properties' },
      { id: 'stats-transactions',label: '거래 통계',      href: '/admin/statistics/transactions',   permKey: 'stats.transactions' },
      { id: 'stats-search',      label: '인기 검색어',    href: '/admin/statistics/popular-search', permKey: 'stats.search' },
      { id: 'stats-regions',     label: '지역별 분석',    href: '/admin/statistics/regions',        permKey: 'stats.regions' },
    ],
  },
  {
    id: 'settings',
    label: '설정',
    icon: <Settings className="w-[18px] h-[18px]" />,
    permKey: 'settings',
    children: [
      { id: 'settings-basic',        label: '기본 정보',        href: '/admin/settings/basic',        permKey: 'settings' },
      { id: 'settings-business',     label: '사업자 정보',      href: '/admin/settings/business',     permKey: 'settings' },
      { id: 'settings-theme',        label: '디자인/테마',      href: '/admin/theme',                 permKey: 'settings' },
      { id: 'settings-permissions',  label: '관리자 권한',      href: '/admin/settings/permissions',  permKey: 'settings' },
      { id: 'settings-multi-admin',  label: '다중 관리자',      href: '/admin/settings/multi-admin',  permKey: 'settings' },
      { id: 'settings-regions',      label: '지역/카테고리',    href: '/admin/settings/region',       permKey: 'settings' },
      { id: 'settings-legal',        label: '약관 관리',        href: '/admin/settings/legal',        permKey: 'settings' },
      { id: 'settings-seo',          label: 'SEO',              href: '/admin/seo',                   permKey: 'settings' },
      { id: 'settings-app-version',  label: '앱 버전 관리',     href: '/admin/settings/app-version',  permKey: 'settings' },
      { id: 'settings-maintenance',  label: '점검 모드',        href: '/admin/settings/maintenance',  permKey: 'settings' },
      { id: 'settings-cache',        label: '캐시 초기화',      href: '/admin/settings/cache-clear',  permKey: 'settings' },
      { id: 'settings-audit',        label: '감사 로그',        href: '/admin/audit-log',             permKey: 'settings' },
    ],
  },
]

// ═══════════════════════════════════════════════════════════════
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState<string[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [currentPlaza, setCurrentPlaza] = useState<string | null>(null)
  const [plazaName, setPlazaName] = useState<string>('')
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [adminRole, setAdminRole] = useState<AdminRole>('viewer')
  const [loading, setLoading] = useState(true)
  const [menuQuery, setMenuQuery] = useState('')

  const router = useRouter()
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const supabase = createClient()

  useEffect(() => {
    const loadAdminContext = async () => {
      try {
        const plaza = getCurrentPlazaClient()
        if (!plaza) { router.push('/'); return }
        setCurrentPlaza(plaza)

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/auth/login'); return }

        const [profileRes, paRes, plazaRes] = await Promise.all([
          supabase.from('profiles').select('id, role, nickname, avatar_url, account_type').eq('id', user.id).single(),
          supabase.from('plaza_admins').select('role, plaza_id').eq('user_id', user.id),
          supabase.from('plazas').select('name').eq('id', plaza).single(),
        ])

        const profile = profileRes.data
        if (!profile) { router.push('/'); return }

        const adminRows = paRes.data || []
        const isSuper = adminRows.some((r: any) => r.role === 'super')
        const isLegacySuperAdmin = profile.role === 'superadmin'

        const plazaSpecificRoles = adminRows
          .filter((r: any) => r.plaza_id === plaza || r.role === 'super')
          .map((r: any) => r.role as AdminRole)

        // 권한 게이트 — plaza_admins 도 아니고 legacy superadmin 도 아니면 관리자 페이지 접근 불가.
        // (이전엔 권한 없는 일반 회원도 viewer 로 기본 배정돼 admin 셸이 렌더됐음)
        if (!isLegacySuperAdmin && plazaSpecificRoles.length === 0) {
          router.push('/')
          return
        }

        const roleHierarchy: AdminRole[] = ['super', 'owner', 'admin', 'finance', 'content', 'moderator', 'support', 'viewer']
        const effectiveRole = isLegacySuperAdmin
          ? 'super' as AdminRole
          : roleHierarchy.find((r) => plazaSpecificRoles.includes(r)) || 'viewer'

        setIsSuperAdmin(isSuper || isLegacySuperAdmin)
        setAdminRole(effectiveRole)
        setCurrentUser(profile)
        setPlazaName(plazaRes.data?.name || plaza)
      } catch (error) {
        console.error('[admin layout] context load error:', error)
        router.push('/')
      } finally {
        setLoading(false)
      }
    }
    loadAdminContext()
  }, [])

  // ── 메뉴 로직 ──
  const toggleMenu = (menuId: string) => {
    setExpandedMenus(prev =>
      prev.includes(menuId) ? prev.filter(id => id !== menuId) : [...prev, menuId],
    )
  }

  const isMenuActive = (item: MenuItem) => {
    if (item.href) return pathname === item.href
    return item.children?.some(child => pathname === child.href)
  }

  const roleFilteredMenu = useMemo(() => {
    return menuItems
      .filter((item) => {
        if (hasPermission(adminRole, item.permKey)) return true
        return item.children?.some((c) => hasPermission(adminRole, c.permKey))
      })
      .map((item) => {
        if (!item.children) return item
        return { ...item, children: item.children.filter((c) => hasPermission(adminRole, c.permKey)) }
      })
  }, [adminRole])

  const filterMenu = (items: MenuItem[]): MenuItem[] => {
    const q = menuQuery.trim().toLowerCase()
    if (!q) return items
    return items
      .map((item) => {
        const labelMatch = item.label.toLowerCase().includes(q)
        if (!item.children) return labelMatch ? item : null
        const matchedChildren = item.children.filter((c) => c.label.toLowerCase().includes(q) || labelMatch)
        if (matchedChildren.length === 0 && !labelMatch) return null
        return { ...item, children: matchedChildren }
      })
      .filter(Boolean) as MenuItem[]
  }

  const filteredMain = filterMenu(roleFilteredMenu)
  const effectiveExpanded = menuQuery.trim()
    ? Array.from(new Set([...expandedMenus, ...filteredMain.filter(m => m.children).map(m => m.id)]))
    : expandedMenus

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Loading...</span>
        </div>
      </div>
    )
  }
  if (!currentUser) return null

  // ═══ Sidebar Render ═══════════════════════════════════════════
  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo / Brand */}
      <div className="h-14 flex items-center px-5 border-b border-white/[0.08] dark:border-white/[0.08] flex-shrink-0">
        <Link href="/admin" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
            <span className="text-sm font-bold text-white">N</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold text-white leading-none">{plazaName}</span>
            <span className="text-[10px] text-white/40 mt-0.5">Admin Console</span>
          </div>
        </Link>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-1 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
          <input
            type="text"
            value={menuQuery}
            onChange={(e) => setMenuQuery(e.target.value)}
            placeholder="Search menu..."
            className="w-full pl-8 pr-7 py-2 text-xs rounded-lg bg-white/[0.06] border border-white/[0.08] text-white placeholder:text-white/30 focus:outline-none focus:bg-white/[0.1] focus:border-white/[0.15] transition-colors"
          />
          {menuQuery && (
            <button
              type="button"
              onClick={() => setMenuQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-white/10"
            >
              <X className="w-3 h-3 text-white/40" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {filteredMain.length === 0 && (
          <p className="text-[11px] text-white/30 text-center py-8">검색 결과 없음</p>
        )}
        {filteredMain.map((item) => {
          const hasChildren = item.children && item.children.length > 0
          const isExpanded = effectiveExpanded.includes(item.id)
          const isActive = isMenuActive(item)

          return (
            <div key={item.id}>
              {hasChildren ? (
                <>
                  <button
                    onClick={() => toggleMenu(item.id)}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2 text-[13px] rounded-lg transition-colors',
                      isActive
                        ? 'bg-white/[0.12] text-white font-medium'
                        : 'text-white/50 hover:text-white/80 hover:bg-white/[0.06]',
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={cn(isActive ? 'text-white' : 'text-white/40')}>{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                    <ChevronRight className={cn(
                      'w-3.5 h-3.5 transition-transform duration-200',
                      isExpanded && 'rotate-90',
                    )} />
                  </button>
                  <div className={cn(
                    'overflow-hidden transition-all duration-200',
                    isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0',
                  )}>
                    <div className="ml-[18px] pl-3 border-l border-white/[0.08] mt-0.5 mb-1 space-y-0.5">
                      {item.children?.map(child => {
                        const childActive = pathname === child.href
                        return (
                          <Link
                            key={child.id}
                            href={child.href}
                            onClick={() => setMobileSidebarOpen(false)}
                            className={cn(
                              'block px-3 py-1.5 text-[12px] rounded-md transition-colors',
                              childActive
                                ? 'text-white bg-white/[0.1] font-medium'
                                : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]',
                            )}
                          >
                            {child.label}
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <Link
                  href={item.href || '#'}
                  onClick={() => setMobileSidebarOpen(false)}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-lg transition-colors',
                    isActive
                      ? 'bg-white/[0.12] text-white font-medium'
                      : 'text-white/50 hover:text-white/80 hover:bg-white/[0.06]',
                  )}
                >
                  <span className={cn(isActive ? 'text-white' : 'text-white/40')}>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              )}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-white/[0.08] flex-shrink-0 space-y-2">
        {/* Quick Links */}
        <div className="flex items-center gap-1">
          <Link href="/" className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors">
            <Home className="w-3 h-3" />
            <span>홈</span>
          </Link>
          <Link href="/properties" className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors">
            <Store className="w-3 h-3" />
            <span>매물</span>
          </Link>
          {isSuperAdmin && (
            <Link href="/super-admin" className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors">
              <ExternalLink className="w-3 h-3" />
              <span>총관리</span>
            </Link>
          )}
        </div>

        {/* User */}
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-white/[0.04]">
          <Avatar className="w-7 h-7">
            <AvatarFallback className="bg-white/10 text-white text-[11px] font-medium">
              {currentUser?.nickname?.[0] || 'A'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-white/80 truncate">
              {currentUser?.nickname || '관리자'}
            </div>
            <div className="text-[10px] text-white/30">{getRoleLabel(adminRole)}</div>
          </div>
        </div>
      </div>
    </div>
  )

  // ═══ Layout ═══════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-[#f7f8fa] dark:bg-[#0c0c0e]">
      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar — Desktop */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-full transition-all duration-300',
          'hidden lg:block',
          // 다크 사이드바 배경
          'bg-[#111113] dark:bg-[#0a0a0c]',
          sidebarOpen ? 'w-[250px]' : 'w-0 overflow-hidden',
        )}
      >
        <SidebarContent />
      </aside>

      {/* Sidebar — Mobile */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-full w-[250px] transition-transform duration-300 lg:hidden',
          'bg-[#111113] dark:bg-[#0a0a0c]',
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <SidebarContent />
      </aside>

      {/* Main area */}
      <div className={cn('transition-all duration-300', sidebarOpen ? 'lg:ml-[250px]' : 'lg:ml-0')}>
        {/* Header */}
        <header className="sticky top-0 z-30 h-14 bg-white/80 dark:bg-[#111113]/80 backdrop-blur-xl border-b border-border/50 flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-2">
            {/* Mobile toggle */}
            <button
              onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
              className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-accent transition-colors"
            >
              {mobileSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Desktop sidebar toggle */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="hidden lg:flex p-2 -ml-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            >
              {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
            </button>

            {/* Search */}
            <GlobalSearch />
          </div>

          <div className="flex items-center gap-1.5">
            {/* Plaza Switcher */}
            <PlazaSwitcher
              isSuper={isSuperAdmin}
              currentPlaza={currentPlaza}
              currentPlazaName={plazaName || null}
            />

            {/* Theme toggle */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Divider */}
            <div className="w-px h-5 bg-border mx-1" />

            {/* User pill */}
            <div className="flex items-center gap-2 pl-1">
              <Avatar className="w-7 h-7">
                <AvatarFallback className="bg-foreground/5 text-foreground text-[11px] font-medium">
                  {currentUser?.nickname?.[0] || 'A'}
                </AvatarFallback>
              </Avatar>
              <span className="text-[13px] font-medium hidden sm:inline">
                {currentUser?.nickname || '관리자'}
              </span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6 max-w-[1400px]">
          {children}
        </main>
      </div>
    </div>
  )
}
