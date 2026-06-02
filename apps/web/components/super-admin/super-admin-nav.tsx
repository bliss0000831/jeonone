'use client'

/**
 * 슈퍼 어드민 좌측 네비게이션 — 화이트 기본 + 다크 토글 지원.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Crown,
  LayoutDashboard,
  CreditCard,
  Building2,
  Shield,
  Image as ImageIcon,
  Home,
  Type,
  Wallet,
  BarChart3,
  Settings,
  Percent,
  FileText,
} from 'lucide-react'
import { SuperAdminThemeToggle } from './theme-toggle'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  group?: string
}

const NAV: NavItem[] = [
  // 메인
  { href: '/super-admin',                          label: '통합 대시보드',    icon: <LayoutDashboard className="w-4 h-4" />, group: '메인' },
  // 수익 관리
  { href: '/super-admin/revenue',                  label: '전체 수익 현황',   icon: <Wallet className="w-4 h-4" />,          group: '수익 관리' },
  { href: '/super-admin/revenue/settlements',      label: '광장별 정산',      icon: <CreditCard className="w-4 h-4" />,     group: '수익 관리' },
  { href: '/super-admin/revenue/commission',       label: '수수료 설정',      icon: <Percent className="w-4 h-4" />,        group: '수익 관리' },
  { href: '/super-admin/revenue/statements',       label: '정산 내역서',      icon: <FileText className="w-4 h-4" />,       group: '수익 관리' },
  // 운영
  { href: '/super-admin/billing',                  label: '결제 / 정산',      icon: <CreditCard className="w-4 h-4" />,     group: '운영' },
  { href: '/super-admin/plaza-associations',       label: '광장 협회',        icon: <Building2 className="w-4 h-4" />,      group: '운영' },
  { href: '/super-admin/business-flags',           label: '업자 자동차단',    icon: <Shield className="w-4 h-4" />,         group: '운영' },
  // 통계
  { href: '/super-admin/stats',                    label: '전체 통계',        icon: <BarChart3 className="w-4 h-4" />,      group: '통계' },
  // 설정
  { href: '/super-admin/hub-background',           label: '허브 배경',        icon: <ImageIcon className="w-4 h-4" />,      group: '설정' },
  { href: '/super-admin/labels',                   label: '사이트 라벨',      icon: <Type className="w-4 h-4" />,           group: '설정' },
]

const GROUP_ORDER = ['메인', '수익 관리', '운영', '통계', '설정']

export function SuperAdminNav({ authed }: { authed: boolean }) {
  const pathname = usePathname()

  if (!authed) return null

  const grouped: Record<string, NavItem[]> = {}
  for (const item of NAV) {
    const g = item.group || '기타'
    if (!grouped[g]) grouped[g] = []
    grouped[g].push(item)
  }
  const groupOrder = GROUP_ORDER

  return (
    <aside className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hidden md:flex flex-col sticky top-0 h-screen">
      {/* 헤더 — 로고 + 테마 토글 */}
      <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-2">
        <Link href="/super-admin" className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm flex-shrink-0">
            <Crown className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight truncate">슈퍼 어드민</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight mt-0.5">본사 전용</p>
          </div>
        </Link>
        <SuperAdminThemeToggle />
      </div>

      {/* 네비게이션 — 그룹별 */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {groupOrder.filter((g) => grouped[g]).map((group) => (
          <div key={group}>
            <div className="px-3 mb-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">{group}</p>
            </div>
            <div className="space-y-0.5">
              {grouped[group].map((item) => {
                const active = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors',
                      active
                        ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold border border-amber-200 dark:border-amber-500/30'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100',
                    )}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* 하단 — 광장 admin 으로 돌아가기 */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-800">
        <Link
          href="/admin"
          className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          <Home className="w-3.5 h-3.5" />
          <span>광장 어드민으로</span>
        </Link>
      </div>
    </aside>
  )
}
