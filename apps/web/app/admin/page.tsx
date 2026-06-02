'use client'

/**
 * 관리자 대시보드 — Pro Redesign.
 *
 * /api/admin/dashboard-stats 1번 호출, 5분 폴링 + visibility 게이팅.
 * 프로페셔널 SaaS 어드민 스타일 UI.
 */

import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Heart,
  ShoppingCart,
  Leaf,
  Store,
  Users as UsersIcon,
  Building2,
  Wrench,
  MessageSquare,
  TrendingUp,
  Eye,
  FileText,
  UserPlus,
  BadgeCheck,
  Activity,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Clock,
  Zap,
  Globe,
  CreditCard,
  Headphones,
  Megaphone,
  BarChart3,
  Settings,
  AlertCircle,
  Flag,
  HelpCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useSiteBranding } from '@/components/site-branding-client'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────
interface DashboardStats {
  properties: { total: number; active: number; hidden: number }
  sharing: { total: number; active: number }
  groupBuying: { total: number }
  localFood: { total: number }
  newStore: { total: number }
  clubs: { total: number }
  boards: { free: number; restaurant: number; living: number; daily: number; qna: number }
  visitors: {
    current: number; today: number; yesterday: number; max: number; total: number
    last7: { date: string; count: number }[]
  }
  members: { total: number; new: number; agents: number; business: number; experts: number }
  posts: { total: number; today: number }
  comments: { total: number }
  verifications: { pending: number }
  reports: { pending: number }
  inquiries: { pending: number }
  billing: {
    boosts: { total: number; active: number }
    localFoodOrders: { total: number; today: number }
    groupBuyingOrders: { total: number }
    refundsPending: number
  }
}

interface RecentMember {
  id: string; nickname: string | null; email: string | null
  avatar_url: string | null; account_type: string | null; created_at: string
}
interface RecentProperty {
  id: string; title: string; price: number | null
  status: string | null; created_at: string; views: number | null
}
interface RecentPost {
  id: string; title: string; author_name: string | null
  comment_count: number | null; created_at: string
}
interface PendingVerification {
  id: string; requested_type: string; business_name: string | null
  user_id: string | null; submitted_at: string
}
interface RecentReport {
  id: string; target_type: string; reason: string
  status: string; created_at: string; target_id: string
}
interface RecentInquiry {
  id: string; subject: string; category: string | null
  status: string; name: string | null; created_at: string
}

const initialStats: DashboardStats = {
  properties: { total: 0, active: 0, hidden: 0 },
  sharing: { total: 0, active: 0 },
  groupBuying: { total: 0 }, localFood: { total: 0 }, newStore: { total: 0 }, clubs: { total: 0 },
  boards: { free: 0, restaurant: 0, living: 0, daily: 0, qna: 0 },
  visitors: { current: 0, today: 0, yesterday: 0, max: 0, total: 0, last7: [] },
  members: { total: 0, new: 0, agents: 0, business: 0, experts: 0 },
  posts: { total: 0, today: 0 }, comments: { total: 0 }, verifications: { pending: 0 },
  reports: { pending: 0 }, inquiries: { pending: 0 },
  billing: { boosts: { total: 0, active: 0 }, localFoodOrders: { total: 0, today: 0 }, groupBuyingOrders: { total: 0 }, refundsPending: 0 },
}

// ── Helpers ────────────────────────────────────────────────────
const fmtPrice = (p: number | null) => {
  if (!p) return '-'
  if (p >= 10000) return `${Math.floor(p / 10000).toLocaleString()}억`
  return `${p.toLocaleString()}만`
}
const fmtRelative = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '방금'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}일 전`
  return new Date(iso).toLocaleDateString('ko-KR')
}
const verificationTypeLabel = (type: string) =>
  ({ agent: '중개사', business: '사업자', service: '서비스 전문가', producer: '생산자' }[type] || type)
const accountTypeLabel = (type: string | null) =>
  type ? ({ individual: '개인', agent: '중개사', business: '사업자', interior: '인테리어', moving: '이사', cleaning: '청소', repair: '수리' }[type] || type) : '개인'
const reportReasonLabel = (reason: string) =>
  ({ spam: '스팸/광고', abuse: '욕설/비방', fraud: '사기/허위', inappropriate: '부적절', copyright: '저작권', other: '기타' }[reason] || reason)
const reportTargetLabel = (type: string) =>
  ({ post: '게시글', comment: '댓글', property: '매물', profile: '프로필' }[type] || type)
const inquiryCategoryLabel = (cat: string) =>
  ({ payment: '결제/환불', usage: '이용 문의', bug: '버그 신고', account: '계정', other: '기타' }[cat] || cat)

// ═══════════════════════════════════════════════════════════════
export default function AdminDashboardPage() {
  const { name: plazaName } = useSiteBranding()
  const [stats, setStats] = useState<DashboardStats>(initialStats)
  const [recentMembers, setRecentMembers] = useState<RecentMember[]>([])
  const [recentProperties, setRecentProperties] = useState<RecentProperty[]>([])
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>([])
  const [pendingVerifications, setPendingVerifications] = useState<PendingVerification[]>([])
  const [recentReports, setRecentReports] = useState<RecentReport[]>([])
  const [recentInquiries, setRecentInquiries] = useState<RecentInquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [showVisitorChart, setShowVisitorChart] = useState(false)

  const loadAll = async () => {
    try {
      const res = await fetch('/api/admin/dashboard-stats', { cache: 'default' })
      if (!res.ok) { setLoading(false); return }
      const json = await res.json()
      if (json?.stats) setStats(json.stats)
      if (json?.recent?.members) setRecentMembers(json.recent.members)
      if (json?.recent?.properties) setRecentProperties(json.recent.properties)
      if (json?.recent?.posts) setRecentPosts(json.recent.posts)
      if (json?.recent?.verifications) setPendingVerifications(json.recent.verifications)
      if (json?.recent?.reports) setRecentReports(json.recent.reports)
      if (json?.recent?.inquiries) setRecentInquiries(json.recent.inquiries)
      setLastUpdated(new Date(json?.generatedAt || Date.now()))
    } catch { /* keep existing */ } finally { setLoading(false) }
  }

  useEffect(() => {
    loadAll()
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadAll()
    }, 5 * 60 * 1000)
    const onVisible = () => { if (document.visibilityState === 'visible') loadAll() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  const visitorDelta = stats.visitors.yesterday
    ? Math.round(((stats.visitors.today - stats.visitors.yesterday) / stats.visitors.yesterday) * 100)
    : 0
  const max7 = Math.max(...stats.visitors.last7.map((x) => x.count), 1)

  return (
    <div className="space-y-6 pb-8">

      {/* ━━━ Header ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {plazaName} 운영 현황
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {lastUpdated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          <button
            onClick={() => { setLoading(true); loadAll() }}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
              'border border-border bg-background hover:bg-accent transition-colors',
            )}
          >
            <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
            새로고침
          </button>
        </div>
      </div>

      {/* ━━━ Quick Actions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section>
        <SectionHeader title="바로가기" />
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {[
            { href: '/admin/members', label: '회원', icon: UsersIcon },
            { href: '/admin/billing', label: '결제·정산', icon: CreditCard },
            { href: '/admin/properties', label: '콘텐츠', icon: FileText },
            { href: '/admin/settings/banner', label: '프로모션', icon: Megaphone },
            { href: '/admin/board/inquiry', label: '고객센터', icon: Headphones },
            { href: '/admin/statistics/overview', label: '통계', icon: BarChart3 },
            { href: '/admin/settings/basic', label: '설정', icon: Settings },
            { href: '/admin/moderation/reports', label: '신고처리', icon: Activity },
          ].map((q) => {
            const Icon = q.icon
            return (
              <Link key={q.href} href={q.href}>
                <div className="flex flex-col items-center gap-2 p-3 rounded-xl border border-border bg-card hover:border-foreground/20 hover:shadow-sm transition-all cursor-pointer">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-[10px] font-medium text-muted-foreground">{q.label}</span>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {/* ━━━ Alert Banners ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {stats.verifications.pending > 0 && (
        <Link
          href="/admin/account-requests"
          className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              {stats.verifications.pending}건의 인증 요청이 대기 중입니다
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-amber-600 dark:text-amber-400 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      )}

      {/* ━━━ Billing Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {(stats.billing.boosts.total > 0 || stats.billing.localFoodOrders.total > 0 || stats.billing.groupBuyingOrders.total > 0 || stats.billing.refundsPending > 0) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-[11px] font-medium text-muted-foreground mb-1">부스트</p>
            <p className="text-lg font-bold">{stats.billing.boosts.total}<span className="text-xs font-normal text-muted-foreground ml-1">건</span></p>
            <p className="text-[11px] text-emerald-600">{stats.billing.boosts.active}건 활성</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-[11px] font-medium text-muted-foreground mb-1">특산물 주문</p>
            <p className="text-lg font-bold">{stats.billing.localFoodOrders.total}<span className="text-xs font-normal text-muted-foreground ml-1">건</span></p>
            <p className="text-[11px] text-blue-600">오늘 +{stats.billing.localFoodOrders.today}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-[11px] font-medium text-muted-foreground mb-1">공구 주문</p>
            <p className="text-lg font-bold">{stats.billing.groupBuyingOrders.total}<span className="text-xs font-normal text-muted-foreground ml-1">건</span></p>
          </div>
          {stats.billing.refundsPending > 0 && (
            <Link href="/admin/billing" className="rounded-xl border border-orange-200 dark:border-orange-800/50 bg-orange-50/50 dark:bg-orange-950/20 p-4 hover:bg-orange-50 transition-colors">
              <p className="text-[11px] font-medium text-orange-600 mb-1">환불 대기</p>
              <p className="text-lg font-bold text-orange-700 dark:text-orange-400">{stats.billing.refundsPending}<span className="text-xs font-normal ml-1">건</span></p>
              <p className="text-[11px] text-orange-500">처리 필요</p>
            </Link>
          )}
        </div>
      )}

      {/* ━━━ KPI Cards ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 전체 회원 */}
        <KPICard
          label="전체 통합 회원"
          value={stats.members.total}
          sub={`오늘 +${stats.members.new}`}
          icon={<UsersIcon className="w-3.5 h-3.5" />}
          iconBg="bg-violet-500/10"
          iconColor="text-violet-600 dark:text-violet-400"
        />

        {/* 오늘 방문자 + 방문자 추이 토글 */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">오늘 방문자</span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums tracking-tight">
              {stats.visitors.today.toLocaleString()}
            </span>
            {visitorDelta !== 0 && (
              <span className={cn(
                'text-xs font-semibold inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md',
                visitorDelta > 0
                  ? 'text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/30'
                  : 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/30',
              )}>
                {visitorDelta > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {Math.abs(visitorDelta)}%
              </span>
            )}
          </div>
          {stats.visitors.last7.length > 1 && (
            <Sparkline data={stats.visitors.last7.map(d => d.count)} color="rgb(59,130,246)" />
          )}
          <button
            onClick={() => setShowVisitorChart(v => !v)}
            className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-medium pt-1"
          >
            방문자 추이
            <ChevronRight className={cn('w-3 h-3 transition-transform', showVisitorChart && 'rotate-90')} />
          </button>
        </div>

        {/* 현재 접속자 */}
        <KPICard
          label="현재 접속자"
          value={stats.visitors.current}
          sub="최근 5분 기준"
          icon={<Eye className="w-3.5 h-3.5" />}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-600 dark:text-emerald-400"
        />

        {/* 오늘 게시글 */}
        <KPICard
          label="오늘 게시글"
          value={stats.posts.today}
          sub={`누적 ${stats.posts.total.toLocaleString()}`}
          icon={<FileText className="w-3.5 h-3.5" />}
          iconBg="bg-orange-500/10"
          iconColor="text-orange-600 dark:text-orange-400"
        />
      </div>

      {/* ━━━ 방문자 추이 (펼침) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {showVisitorChart && stats.visitors.last7.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold">방문자 추이</h3>
              <p className="text-xs text-muted-foreground mt-0.5">최근 7일</p>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold tabular-nums">
                {Math.round(stats.visitors.last7.reduce((s, d) => s + d.count, 0) / Math.max(stats.visitors.last7.length, 1))}
              </div>
              <div className="text-[10px] text-muted-foreground">일평균</div>
            </div>
          </div>
          <VisitorLineChart data={stats.visitors.last7} />
        </div>
      )}

      {/* ━━━ 회원 구성 + 인증 요청 + 신고 처리 + 문의사항 ━━━━━━━━━ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* 회원 유형 */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-1">회원 구성</h3>
          <p className="text-xs text-muted-foreground mb-5">전체 {stats.members.total.toLocaleString()}명</p>
          <div className="space-y-4">
            {[
              { label: '중개사', value: stats.members.agents, icon: Building2, color: 'bg-blue-500' },
              { label: '사업자', value: stats.members.business, icon: Store, color: 'bg-emerald-500' },
              { label: '전문가', value: stats.members.experts, icon: Wrench, color: 'bg-orange-500' },
            ].map((row) => {
              const pct = stats.members.total > 0 ? Math.round((row.value / stats.members.total) * 100) : 0
              const Icon = row.icon
              return (
                <div key={row.label} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="font-medium">{row.label}</span>
                    </div>
                    <div className="text-sm tabular-nums">
                      <span className="font-semibold">{row.value.toLocaleString()}</span>
                      <span className="text-muted-foreground ml-1.5 text-xs">{pct}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all duration-500', row.color)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-5 pt-4 border-t border-border">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">일반 회원</span>
              <span className="font-semibold tabular-nums">
                {(stats.members.total - stats.members.agents - stats.members.business - stats.members.experts).toLocaleString()}명
              </span>
            </div>
          </div>
        </div>

        {/* 인증 대기 */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              인증 요청
              {stats.verifications.pending > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {stats.verifications.pending}
                </span>
              )}
            </h3>
            <Link href="/admin/account-requests" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              전체보기
            </Link>
          </div>
          <div className="px-5 pb-5">
            {pendingVerifications.length === 0 ? (
              <div className="py-8 text-center">
                <BadgeCheck className="w-8 h-8 mx-auto text-muted-foreground/20 mb-2" />
                <p className="text-xs text-muted-foreground">대기 중인 요청이 없습니다</p>
              </div>
            ) : (
              <div className="space-y-1">
                {pendingVerifications.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                      <BadgeCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{v.business_name || '-'}</div>
                      <div className="text-[11px] text-muted-foreground">{verificationTypeLabel(v.requested_type)}</div>
                    </div>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">{fmtRelative(v.submitted_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 신고 처리 */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              신고 처리
              {stats.reports.pending > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {stats.reports.pending}
                </span>
              )}
            </h3>
            <Link href="/admin/moderation/reports" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              전체보기
            </Link>
          </div>
          <div className="px-5 pb-5">
            {recentReports.length === 0 ? (
              <div className="py-8 text-center">
                <Flag className="w-8 h-8 mx-auto text-muted-foreground/20 mb-2" />
                <p className="text-xs text-muted-foreground">대기 중인 신고가 없습니다</p>
              </div>
            ) : (
              <div className="space-y-1">
                {recentReports.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                      <Flag className="w-4 h-4 text-red-600 dark:text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{reportReasonLabel(r.reason)}</div>
                      <div className="text-[11px] text-muted-foreground">{reportTargetLabel(r.target_type)}</div>
                    </div>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">{fmtRelative(r.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 문의 사항 */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              문의 사항
              {stats.inquiries.pending > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {stats.inquiries.pending}
                </span>
              )}
            </h3>
            <Link href="/admin/board/inquiry" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              전체보기
            </Link>
          </div>
          <div className="px-5 pb-5">
            {recentInquiries.length === 0 ? (
              <div className="py-8 text-center">
                <HelpCircle className="w-8 h-8 mx-auto text-muted-foreground/20 mb-2" />
                <p className="text-xs text-muted-foreground">대기 중인 문의가 없습니다</p>
              </div>
            ) : (
              <div className="space-y-1">
                {recentInquiries.map((q) => (
                  <div key={q.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                      <HelpCircle className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{q.subject}</div>
                      <div className="text-[11px] text-muted-foreground">{q.name || '익명'}{q.category ? ` · ${inquiryCategoryLabel(q.category)}` : ''}</div>
                    </div>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">{fmtRelative(q.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ━━━ 콘텐츠 + 게시판 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 콘텐츠 */}
        <div className="rounded-xl border border-border bg-card p-4">
          <SectionHeader title="콘텐츠" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { icon: Building2, label: '매물', value: stats.properties.total, href: '/admin/properties', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' },
              { icon: Heart, label: '나눔', value: stats.sharing.total, href: '/admin/community/sharing', color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10' },
              { icon: ShoppingCart, label: '공구', value: stats.groupBuying.total, href: '/admin/community/group-buying', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/10' },
              { icon: Leaf, label: '로컬푸드', value: stats.localFood.total, href: '/admin/community/local-food', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-500/10' },
              { icon: Store, label: '신장개업', value: stats.newStore.total, href: '/admin/community/new-store', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' },
              { icon: UsersIcon, label: '모임', value: stats.clubs.total, href: '/admin/community/clubs', color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-500/10' },
            ].map((item) => {
              const Icon = item.icon
              return (
                <Link key={item.label} href={item.href} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-accent/50 transition-colors">
                  <div className={cn('w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0', item.bg)}>
                    <Icon className={cn('w-3.5 h-3.5', item.color)} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold tabular-nums">{item.value.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">{item.label}</div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>

        {/* 게시판 */}
        <div className="rounded-xl border border-border bg-card p-4">
          <SectionHeader title="게시판" href="/admin/board" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { slug: 'free', label: '자유게시판' },
              { slug: 'restaurant', label: '맛집 추천' },
              { slug: 'living', label: '생활 정보' },
              { slug: 'daily', label: '일상 공유' },
              { slug: 'qna', label: '질문 답변' },
            ].map((board) => {
              const value = stats.boards[board.slug as keyof typeof stats.boards]
              return (
                <Link key={board.slug} href={`/admin/board/${board.slug}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-accent/50 transition-colors">
                  <span className="text-xs text-muted-foreground">{board.label}</span>
                  <span className="text-sm font-bold tabular-nums">{value.toLocaleString()}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* ━━━ 최근 게시글 · 최근 매물 · 최근 가입 (3열) ━━━━━━━━━━ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* 최근 게시글 */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 className="text-sm font-semibold">최근 게시글</h3>
            <Link href="/admin/board" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              전체보기
            </Link>
          </div>
          <div className="px-5 pb-5">
            {recentPosts.length === 0 ? (
              <div className="py-8 text-center">
                <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground/20 mb-2" />
                <p className="text-xs text-muted-foreground">게시글이 없습니다</p>
              </div>
            ) : (
              <div className="space-y-1">
                {recentPosts.map((p) => (
                  <div key={p.id} className="p-2.5 rounded-lg hover:bg-accent/50 transition-colors">
                    <div className="text-sm font-medium truncate">{p.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      <span>{p.author_name || '익명'}</span>
                      <span className="text-muted-foreground/40">·</span>
                      <span>댓글 {p.comment_count || 0}</span>
                      <span className="text-muted-foreground/40">·</span>
                      <span>{fmtRelative(p.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 최근 매물 */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 className="text-sm font-semibold">최근 매물</h3>
            <Link href="/admin/properties" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              전체보기
            </Link>
          </div>
          <div className="px-5 pb-5">
            {recentProperties.length === 0 ? (
              <div className="py-8 text-center">
                <Building2 className="w-8 h-8 mx-auto text-muted-foreground/20 mb-2" />
                <p className="text-xs text-muted-foreground">매물이 없습니다</p>
              </div>
            ) : (
              <div className="space-y-1">
                {recentProperties.map((p) => (
                  <div key={p.id} className="p-2.5 rounded-lg hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate flex-1">{p.title}</span>
                      {p.status === 'active' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      <span className="font-medium text-foreground/70">{fmtPrice(p.price)}</span>
                      <span className="text-muted-foreground/40">·</span>
                      <span>조회 {(p.views || 0).toLocaleString()}</span>
                      <span className="text-muted-foreground/40">·</span>
                      <span>{fmtRelative(p.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 최근 가입 */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 className="text-sm font-semibold">최근 가입</h3>
            <Link href="/admin/members" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              전체보기
            </Link>
          </div>
          <div className="px-5 pb-5">
            {recentMembers.length === 0 ? (
              <div className="py-8 text-center">
                <UsersIcon className="w-8 h-8 mx-auto text-muted-foreground/20 mb-2" />
                <p className="text-xs text-muted-foreground">최근 가입한 회원이 없습니다</p>
              </div>
            ) : (
              <div className="space-y-1">
                {recentMembers.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors">
                    <Avatar className="w-8 h-8">
                      {m.avatar_url && <AvatarImage src={m.avatar_url} />}
                      <AvatarFallback className="text-[10px] bg-muted font-medium">
                        {m.nickname?.[0] || m.email?.[0] || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{m.nickname || m.email || '익명'}</div>
                      <div className="text-[11px] text-muted-foreground">{accountTypeLabel(m.account_type)}</div>
                    </div>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">{fmtRelative(m.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────

function KPICard({ label, value, sub, icon, iconBg, iconColor }: {
  label: string; value: number; sub: string
  icon: React.ReactNode; iconBg: string; iconColor: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', iconBg)}>
          <span className={iconColor}>{icon}</span>
        </div>
      </div>
      <div className="text-3xl font-bold tabular-nums tracking-tight">{value.toLocaleString()}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  )
}

function SectionHeader({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h2>
      {href && (
        <Link href={href} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
          전체 <ChevronRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  )
}

function VisitorLineChart({ data }: { data: { date: string; count: number }[] }) {
  if (data.length < 2) return null
  const counts = data.map(d => d.count)
  const max = Math.max(...counts, 1)
  const min = 0
  const range = max - min || 1
  const w = 600
  const h = 180
  const padX = 30
  const padTop = 16
  const padBot = 34
  const chartH = h - padTop - padBot
  const chartW = w - padX * 2
  const todayStr = `${new Date().getMonth() + 1}/${new Date().getDate()}`

  const points = data.map((d, i) => {
    const x = padX + (i / (data.length - 1)) * chartW
    const y = padTop + chartH - ((d.count - min) / range) * chartH
    return { x, y, ...d }
  })

  const lineD = points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(' ')
  const areaD = lineD + ` L${points[points.length - 1].x},${padTop + chartH} L${points[0].x},${padTop + chartH} Z`

  return (
    <div className="w-full overflow-x-auto -mx-2 px-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full min-w-[320px]" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="visitGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(59,130,246)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="rgb(59,130,246)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#visitGrad)" />
        <path d={lineD} fill="none" stroke="rgb(59,130,246)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p) => {
          const isToday = p.date === todayStr
          return (
            <g key={p.date}>
              <circle cx={p.x} cy={p.y} r={isToday ? 5 : 3.5} fill={isToday ? 'rgb(59,130,246)' : '#fff'} stroke="rgb(59,130,246)" strokeWidth="2" />
              <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="11" fontWeight={isToday ? '700' : '500'} fill={isToday ? 'rgb(30,64,175)' : '#6b7280'}>
                {p.count}
              </text>
              <text x={p.x} y={padTop + chartH + 18} textAnchor="middle" fontSize="10" fontWeight={isToday ? '700' : '400'} fill={isToday ? '#111' : '#9ca3af'}>
                {p.date}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const w = 120
  const h = 28
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * (h - 4) - 2
    return [x, y]
  })

  const pathD = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ')
  const areaD = pathD + `L${points[points.length - 1][0]},${h} L${points[0][0]},${h} Z`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-7">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#sparkGrad)" />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle
        cx={points[points.length - 1][0]}
        cy={points[points.length - 1][1]}
        r="2"
        fill={color}
      />
    </svg>
  )
}
