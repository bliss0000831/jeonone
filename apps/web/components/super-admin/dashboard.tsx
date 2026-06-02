'use client'

import { useMemo, useState } from 'react'
import {
  Shield, LogOut, ExternalLink, Search, Users, MapPin, Lock,
  CheckCircle2, ArrowRight, Settings, Eye, Building2, Crown,
  CreditCard, Banknote, Tag, Megaphone, Briefcase,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { SuperAdminHubBranding } from '@/components/super-admin/hub-branding'

type Plaza = {
  id: string
  name: string
  parent_region: string | null
  is_active: boolean
  is_open_soon: boolean
  sort_order: number
  coverage: string[] | null
}

type AdminRow = {
  plaza_id: string
  user_id: string
  role: string
}

const REGION_ORDER = ['서울권', '경기권', '강원권', '충청권', '전라권', '경상권', '제주권']

export function SuperAdminDashboard({
  plazas,
  plazaAdmins,
}: {
  plazas: Plaza[]
  plazaAdmins: AdminRow[]
}) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  const stats = useMemo(() => {
    const total = plazas.length
    const open = plazas.filter((p) => p.is_active).length
    const soon = plazas.filter((p) => !p.is_active && p.is_open_soon).length
    return { total, open, soon }
  }, [plazas])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return plazas
    return plazas.filter((p) => {
      if (p.name.toLowerCase().includes(q)) return true
      if ((p.parent_region || '').toLowerCase().includes(q)) return true
      if (p.id.toLowerCase().includes(q)) return true
      if ((p.coverage || []).some((c) => c.toLowerCase().includes(q))) return true
      return false
    })
  }, [plazas, query])

  const grouped = useMemo(() => {
    const map = new Map<string, Plaza[]>()
    for (const p of filtered) {
      const r = p.parent_region || '기타'
      if (!map.has(r)) map.set(r, [])
      map.get(r)!.push(p)
    }
    return REGION_ORDER
      .filter((r) => map.has(r))
      .map((r) => ({ region: r, plazas: map.get(r)!.sort((a, b) => a.sort_order - b.sort_order) }))
  }, [filtered])

  // 광장당 admin 수 카운트
  const adminCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of plazaAdmins) {
      // 모든 역할의 관리자를 카운트 (super 제외 — 전체 광장 관리자)
      if (a.role !== 'super') m.set(a.plaza_id, (m.get(a.plaza_id) || 0) + 1)
    }
    return m
  }, [plazaAdmins])

  const buildPlazaAdminUrl = (plazaId: string): string => {
    if (typeof window === 'undefined') return '#'
    const host = window.location.host.split(':')[0]
    const protocol = window.location.protocol
    const port = window.location.port ? `:${window.location.port}` : ''
    const labels = host.split('.')
    let rootDomain: string
    if (host === 'localhost' || host === '127.0.0.1') {
      rootDomain = 'localhost'
    } else if (labels.length >= 2) {
      rootDomain = labels.slice(-2).join('.')
    } else {
      rootDomain = host
    }
    return `${protocol}//${plazaId}.${rootDomain}${port}/admin`
  }

  const logout = async () => {
    setBusy(true)
    await fetch('/api/super-admin/logout', { method: 'POST' })
    window.location.reload()
  }

  return (
    <div className="min-h-screen">
      {/* 헤더 — 라이트/다크 둘 다 지원 */}
      <header className="sticky top-0 z-20 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 dark:text-gray-100 leading-tight">슈퍼 관리자</h1>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">gwangjang.app · 본사 콘솔</p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50"
          >
            <LogOut className="w-4 h-4" />
            로그아웃
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* 통계 카드 — 깔끔한 그라데이션 */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={<MapPin className="w-5 h-5" />}
            value={stats.total}
            label="전체 광장"
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
          />
          <StatCard
            icon={<CheckCircle2 className="w-5 h-5" />}
            value={stats.open}
            label="운영중"
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
            highlight
          />
          <StatCard
            icon={<Building2 className="w-5 h-5" />}
            value={stats.soon}
            label="오픈 예정"
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
          />
        </section>

        {/* 검색 — 큰 입력창 */}
        <section>
          <div className="relative max-w-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="광장 검색 — 이름, 권역, ID, 커버리지 지역"
              className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 shadow-sm"
            />
          </div>
          {query && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 ml-1">
              "{query}" 검색 결과: <span className="font-semibold text-gray-900 dark:text-gray-100">{filtered.length}</span>개 광장
            </p>
          )}
        </section>

        {/* 수익 관리 바로가기 */}
        <section>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">수익 관리</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ToolLink href="/super-admin/revenue" icon={<Banknote className="w-4 h-4" />} label="전체 수익 현황" tone="amber" />
            <ToolLink href="/super-admin/revenue/settlements" icon={<CreditCard className="w-4 h-4" />} label="광장별 정산" tone="emerald" />
            <ToolLink href="/super-admin/revenue/commission" icon={<Settings className="w-4 h-4" />} label="수수료 설정" tone="blue" />
            <ToolLink href="/super-admin/revenue/statements" icon={<Tag className="w-4 h-4" />} label="정산 내역서" tone="purple" />
          </div>
        </section>

        {/* 운영 도구 바로가기 */}
        <section>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">운영 도구</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <ToolLink href="/super-admin/payments" icon={<CreditCard className="w-4 h-4" />} label="결제 설정" tone="amber" />
            <ToolLink href="/super-admin/settlements" icon={<Banknote className="w-4 h-4" />} label="정산 관리" tone="emerald" />
            <ToolLink href="/super-admin/billing" icon={<Tag className="w-4 h-4" />} label="요금제·크레딧" tone="blue" />
            <ToolLink href="/super-admin/labels" icon={<Megaphone className="w-4 h-4" />} label="사이트 라벨" tone="purple" />
            <ToolLink href="/super-admin/business-flags" icon={<Briefcase className="w-4 h-4" />} label="기능 플래그" tone="rose" />
          </div>
        </section>

        {/* 허브 브랜딩 — gwangjang.app 전용 */}
        <SuperAdminHubBranding />

        {/* 광장 리스트 */}
        <section className="space-y-8">
          {grouped.map(({ region, plazas: ps }) => (
            <div key={region}>
              <div className="flex items-baseline gap-3 mb-4 pb-2 border-b border-gray-200 dark:border-gray-800">
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">{region}</h2>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{ps.length}개</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {ps.map((p) => (
                  <PlazaRow
                    key={p.id}
                    plaza={p}
                    adminCount={adminCounts.get(p.id) || 0}
                    onOpen={() => window.open(buildPlazaAdminUrl(p.id), '_blank', 'noopener')}
                    onView={() => {
                      window.open(buildPlazaAdminUrl(p.id).replace('/admin', '/'), '_blank', 'noopener')
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>

        {grouped.length === 0 && (
          <div className="text-center py-16">
            <Shield className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">검색 결과가 없습니다</p>
          </div>
        )}

        <footer className="pt-8 pb-12 border-t border-gray-200 dark:border-gray-800 text-center text-xs text-gray-400 dark:text-gray-600">
          gwangjang.app · super admin console · {new Date().getFullYear()}
        </footer>
      </main>
    </div>
  )
}

const TOOL_TONES: Record<string, { bg: string; ring: string; text: string }> = {
  amber:   { bg: "bg-amber-50 dark:bg-amber-900/20",     ring: "border-amber-200 dark:border-amber-800/40",     text: "text-amber-700 dark:text-amber-300" },
  emerald: { bg: "bg-emerald-50 dark:bg-emerald-900/20", ring: "border-emerald-200 dark:border-emerald-800/40", text: "text-emerald-700 dark:text-emerald-300" },
  blue:    { bg: "bg-blue-50 dark:bg-blue-900/20",       ring: "border-blue-200 dark:border-blue-800/40",       text: "text-blue-700 dark:text-blue-300" },
  purple:  { bg: "bg-purple-50 dark:bg-purple-900/20",   ring: "border-purple-200 dark:border-purple-800/40",   text: "text-purple-700 dark:text-purple-300" },
  rose:    { bg: "bg-rose-50 dark:bg-rose-900/20",       ring: "border-rose-200 dark:border-rose-800/40",       text: "text-rose-700 dark:text-rose-300" },
}

function ToolLink({
  href,
  icon,
  label,
  tone,
}: {
  href: string
  icon: React.ReactNode
  label: string
  tone: keyof typeof TOOL_TONES
}) {
  const t = TOOL_TONES[tone] || TOOL_TONES.blue
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 px-3 py-3 rounded-lg border transition-colors",
        t.bg, t.ring, t.text,
        "hover:opacity-80",
      )}
    >
      {icon}
      <span className="text-sm font-medium">{label}</span>
      <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-60" />
    </Link>
  )
}

function StatCard({
  icon,
  value,
  label,
  iconBg,
  iconColor,
  highlight,
}: {
  icon: React.ReactNode
  value: number
  label: string
  iconBg: string
  iconColor: string
  highlight?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-5 bg-white dark:bg-gray-900 transition-shadow hover:shadow-md',
        highlight
          ? 'border-emerald-200 dark:border-emerald-500/30 shadow-sm ring-1 ring-emerald-100 dark:ring-emerald-500/20'
          : 'border-gray-200 dark:border-gray-800',
      )}
    >
      <div className={cn(
        'inline-flex items-center justify-center w-10 h-10 rounded-xl mb-3',
        iconBg,
        iconColor,
        'dark:bg-opacity-20',
      )}>
        {icon}
      </div>
      <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 leading-none">{value.toLocaleString()}</div>
      <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">{label}</div>
    </div>
  )
}

function PlazaRow({
  plaza,
  adminCount,
  onOpen,
  onView,
}: {
  plaza: Plaza
  adminCount: number
  onOpen: () => void
  onView: () => void
}) {
  const isOpen = plaza.is_active
  return (
    <div
      className={cn(
        'rounded-2xl border bg-white dark:bg-gray-900 p-5 transition-all',
        isOpen
          ? 'border-gray-200 dark:border-gray-800 hover:border-amber-300 dark:hover:border-amber-500/50 hover:shadow-md'
          : 'border-gray-100 dark:border-gray-800/50 bg-gray-50/50 dark:bg-gray-900/50',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            {isOpen ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">운영중</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <Lock className="w-2.5 h-2.5 text-gray-500 dark:text-gray-400" />
                <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-300">오픈예정</span>
              </span>
            )}
          </div>
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">{plaza.name}</h3>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 font-mono">{plaza.id}</p>
        </div>
      </div>

      {(plaza.coverage || []).length > 0 && (
        <div className="mb-3 pb-3 border-b border-gray-100 dark:border-gray-800">
          <p className="text-[11px] text-gray-600 dark:text-gray-400 line-clamp-2">
            <span className="text-gray-400 mr-1">📍</span>
            {(plaza.coverage || []).slice(0, 5).join(', ')}
            {(plaza.coverage || []).length > 5 && (
              <span className="text-gray-400 dark:text-gray-600"> 외 {(plaza.coverage || []).length - 5}개</span>
            )}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-4">
        <span className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          광장 admin <span className="font-semibold text-gray-700 dark:text-gray-200">{adminCount}</span>명
        </span>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-bold transition-all shadow-sm"
        >
          <Settings className="w-3.5 h-3.5" />
          관리자 콘솔
          <ExternalLink className="w-3 h-3 opacity-80" />
        </button>
        <button
          type="button"
          onClick={onView}
          className="flex items-center justify-center px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-medium transition"
          title="광장 사용자 화면"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
