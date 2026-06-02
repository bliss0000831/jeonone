'use client'

/**
 * 상단노출(부스트) 관리 페이지.
 * 프리미엄/부스트 매물 목록 및 현황 관리.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AdminPageHeader } from '@/components/admin/page-header'
import { cn } from '@/lib/utils'
import {
  Zap, Loader2, RotateCcw, Search, Filter,
  TrendingUp, Clock, CalendarDays, DollarSign,
  ChevronDown, ChevronUp, Rocket, Timer, Ban,
  ArrowUpRight, BarChart3, Building2, Package,
} from 'lucide-react'

type StatusFilter = 'all' | 'active' | 'expired' | 'pending'

interface BoostOrder {
  id: string
  user_id: string
  business_name?: string
  target_type: string
  target_id: string
  tier: string
  amount: number
  starts_at: string
  ends_at: string
  status: string
  created_at: string
}

const STATUS_CONFIG: Record<string, {
  label: string
  icon: typeof Zap
  color: string
  bgColor: string
  borderColor: string
  dotColor: string
}> = {
  active: {
    label: '활성',
    icon: Zap,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-200 dark:border-emerald-900/50',
    dotColor: 'bg-emerald-500',
  },
  expired: {
    label: '만료',
    icon: Timer,
    color: 'text-gray-500',
    bgColor: 'bg-gray-50 dark:bg-gray-900/50',
    borderColor: 'border-gray-200 dark:border-gray-800',
    dotColor: 'bg-gray-400',
  },
  pending: {
    label: '대기',
    icon: Clock,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-200 dark:border-amber-900/50',
    dotColor: 'bg-amber-500',
  },
}

const TIER_LABEL: Record<string, string> = {
  premium: '프리미엄',
  standard: '스탠다드',
  basic: '베이직',
}

const TIER_COLOR: Record<string, string> = {
  premium: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  standard: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  basic: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
}

const TARGET_LABEL: Record<string, string> = {
  property: '부동산',
  secondhand: '중고거래',
  jobs: '구인구직',
  food: '먹거리',
  service: '서비스',
}

function getDaysRemaining(endsAt: string): number {
  const end = new Date(endsAt).getTime()
  const now = Date.now()
  return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)))
}

function getDuration(startsAt: string, endsAt: string): number {
  const start = new Date(startsAt).getTime()
  const end = new Date(endsAt).getTime()
  return Math.round((end - start) / (1000 * 60 * 60 * 24))
}

export default function PromotionBoostsPage() {
  const [loading, setLoading] = useState(true)
  const [boosts, setBoosts] = useState<BoostOrder[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'created' | 'amount' | 'ends'>('created')
  const supabase = createClient()
  const plaza = getCurrentPlazaClient()

  const loadData = useCallback(async () => {
    if (!plaza) return
    setLoading(true)
    try {
      const { data } = await supabase
        .from('boost_orders')
        .select('*')
        .eq('plaza_id', plaza)
        .order('created_at', { ascending: false })
        .limit(200)
      setBoosts((data as BoostOrder[]) || [])
    } catch (e) {
      console.error('Failed to load boost data:', e)
    } finally {
      setLoading(false)
    }
  }, [plaza])

  useEffect(() => { loadData() }, [loadData])

  // 통계 계산
  const stats = useMemo(() => {
    const now = new Date()
    const active = boosts.filter(b => b.status === 'active')
    const pending = boosts.filter(b => b.status === 'pending')
    const expired = boosts.filter(b => b.status === 'expired')

    const thisMonthRevenue = boosts
      .filter(b => {
        const d = new Date(b.created_at)
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      })
      .reduce((sum, b) => sum + (b.amount || 0), 0)

    const lastMonthRevenue = boosts
      .filter(b => {
        const d = new Date(b.created_at)
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        return d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear()
      })
      .reduce((sum, b) => sum + (b.amount || 0), 0)

    const avgDuration = active.length > 0
      ? Math.round(
          active.reduce((sum, b) => sum + getDuration(b.starts_at, b.ends_at), 0) / active.length
        )
      : 0

    const totalRevenue = boosts.reduce((sum, b) => sum + (b.amount || 0), 0)

    return {
      active: active.length,
      pending: pending.length,
      expired: expired.length,
      total: boosts.length,
      thisMonthRevenue,
      lastMonthRevenue,
      avgDuration,
      totalRevenue,
      revenueGrowth: lastMonthRevenue > 0
        ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
        : 0,
    }
  }, [boosts])

  // 필터링 + 정렬
  const filtered = useMemo(() => {
    let result = boosts.filter(b => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return (
          (b.business_name || '').toLowerCase().includes(q) ||
          b.target_type.toLowerCase().includes(q) ||
          b.target_id.toLowerCase().includes(q)
        )
      }
      return true
    })

    result.sort((a, b) => {
      switch (sortBy) {
        case 'amount':
          return b.amount - a.amount
        case 'ends':
          return new Date(a.ends_at).getTime() - new Date(b.ends_at).getTime()
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
    })

    return result
  }, [boosts, statusFilter, searchQuery, sortBy])

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <AdminPageHeader
        title="상단노출(부스트) 관리"
        description="프리미엄 상단노출 매물 현황을 모니터링하고 관리합니다"
        icon={<Rocket className="w-6 h-6" />}
        badge={
          stats.active > 0 ? (
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              {stats.active}건 활성
            </span>
          ) : null
        }
        actions={
          <Button variant="outline" size="sm" onClick={loadData} className="gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" />
            새로고침
          </Button>
        }
      />

      {/* 통계 카드 5개 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
              <Zap className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <div className="text-2xl font-bold">{stats.active}</div>
          <div className="text-xs text-muted-foreground mt-0.5">현재 활성</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
          </div>
          <div className="text-2xl font-bold">{stats.pending}</div>
          <div className="text-xs text-muted-foreground mt-0.5">대기중</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-blue-600">{stats.thisMonthRevenue.toLocaleString()}<span className="text-sm font-normal">원</span></div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-muted-foreground">이번달 수익</span>
            {stats.revenueGrowth !== 0 && (
              <span className={cn(
                "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                stats.revenueGrowth > 0
                  ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
                  : "bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400"
              )}>
                {stats.revenueGrowth > 0 ? '+' : ''}{stats.revenueGrowth}%
              </span>
            )}
          </div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-violet-600" />
            </div>
          </div>
          <div className="text-2xl font-bold">{stats.totalRevenue.toLocaleString()}<span className="text-sm font-normal">원</span></div>
          <div className="text-xs text-muted-foreground mt-0.5">누적 수익</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <CalendarDays className="w-4 h-4 text-gray-500" />
            </div>
          </div>
          <div className="text-2xl font-bold">{stats.avgDuration}<span className="text-sm font-normal">일</span></div>
          <div className="text-xs text-muted-foreground mt-0.5">평균 기간</div>
        </div>
      </div>

      {/* 부스트 종류 안내 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-900/50">
          <div className="flex items-center gap-2 mb-1">
            <Rocket className="w-4 h-4 text-violet-600" />
            <span className="text-sm font-semibold text-violet-700 dark:text-violet-300">프리미엄</span>
          </div>
          <p className="text-xs text-violet-600/80 dark:text-violet-400/60">최상단 고정 + 강조 뱃지 + 추천 영역 노출</p>
        </div>
        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50">
          <div className="flex items-center gap-2 mb-1">
            <ArrowUpRight className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">스탠다드</span>
          </div>
          <p className="text-xs text-blue-600/80 dark:text-blue-400/60">상단 노출 + 강조 뱃지 표시</p>
        </div>
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">베이직</span>
          </div>
          <p className="text-xs text-gray-500/80 dark:text-gray-400/60">일반 게시글 대비 우선 노출</p>
        </div>
      </div>

      {/* 검색 + 필터 + 정렬 */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="업체명 또는 매물 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-10 px-3 rounded-md border border-input bg-background text-sm"
          >
            <option value="all">모든 상태</option>
            <option value="active">활성</option>
            <option value="pending">대기</option>
            <option value="expired">만료</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="h-10 px-3 rounded-md border border-input bg-background text-sm"
          >
            <option value="created">최신순</option>
            <option value="amount">금액순</option>
            <option value="ends">종료임박순</option>
          </select>
        </div>
      </div>

      {/* 부스트 목록 */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-sm">부스트 목록을 불러오는 중...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Rocket className="w-8 h-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-lg font-medium">
              {boosts.length === 0 ? '부스트 내역이 없습니다' : '검색 결과가 없습니다'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {boosts.length === 0
                ? '업체에서 상단노출을 구매하면 여기에 표시됩니다'
                : '검색어나 필터를 변경해보세요'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{filtered.length}건</p>
          <div className="space-y-2">
            {filtered.map((b) => {
              const config = STATUS_CONFIG[b.status] || STATUS_CONFIG.expired
              const StatusIcon = config.icon
              const isExpanded = expandedId === b.id
              const daysRemaining = b.status === 'active' ? getDaysRemaining(b.ends_at) : 0
              const duration = getDuration(b.starts_at, b.ends_at)

              return (
                <div
                  key={b.id}
                  className={cn(
                    "rounded-xl border bg-card transition-all hover:shadow-sm",
                    b.status === 'active' && "border-emerald-200/60 dark:border-emerald-900/30",
                  )}
                >
                  {/* 메인 행 */}
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : b.id)}
                    className="w-full flex items-center gap-4 p-4 text-left"
                  >
                    {/* 상태 아이콘 */}
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                      config.bgColor,
                    )}>
                      <StatusIcon className={cn("w-5 h-5", config.color)} />
                    </div>

                    {/* 정보 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-semibold text-sm truncate">
                          {b.business_name || b.user_id.slice(0, 8) + '...'}
                        </span>
                        <span className={cn(
                          "text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1",
                          config.bgColor, config.color,
                        )}>
                          <span className={cn("w-1.5 h-1.5 rounded-full", config.dotColor)} />
                          {config.label}
                        </span>
                        {b.tier && (
                          <span className={cn(
                            "text-[11px] font-medium px-2 py-0.5 rounded-full",
                            TIER_COLOR[b.tier] || TIER_COLOR.basic,
                          )}>
                            {TIER_LABEL[b.tier] || b.tier}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          {TARGET_LABEL[b.target_type] || b.target_type}
                        </span>
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                        <span>{duration}일간</span>
                        {b.status === 'active' && daysRemaining <= 3 && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                            <span className="text-amber-600 font-medium">
                              {daysRemaining === 0 ? '오늘 만료' : `${daysRemaining}일 남음`}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* 금액 */}
                    <div className="text-right shrink-0 hidden sm:block">
                      <div className="text-sm font-bold">{b.amount.toLocaleString()}원</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(b.created_at).toLocaleDateString('ko-KR')}
                      </div>
                    </div>

                    {/* 펼치기 */}
                    <div className="shrink-0 text-muted-foreground">
                      {isExpanded
                        ? <ChevronUp className="w-4 h-4" />
                        : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </button>

                  {/* 확장 영역 */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 border-t mx-4 mb-2 mt-0 border-dashed">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3">
                        <div>
                          <div className="text-[11px] text-muted-foreground mb-0.5">업체/회원</div>
                          <div className="text-sm font-medium">{b.business_name || '미등록'}</div>
                          <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{b.user_id.slice(0, 12)}...</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-muted-foreground mb-0.5">대상</div>
                          <div className="text-sm font-medium">{TARGET_LABEL[b.target_type] || b.target_type}</div>
                          <div className="text-[11px] text-muted-foreground font-mono mt-0.5">#{b.target_id.slice(0, 12)}</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-muted-foreground mb-0.5">기간</div>
                          <div className="text-sm font-medium">
                            {new Date(b.starts_at).toLocaleDateString('ko-KR')}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            ~ {new Date(b.ends_at).toLocaleDateString('ko-KR')}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-muted-foreground mb-0.5">결제 금액</div>
                          <div className="text-sm font-bold">{b.amount.toLocaleString()}원</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {Math.round(b.amount / Math.max(1, duration)).toLocaleString()}원/일
                          </div>
                        </div>
                      </div>

                      {/* 진행률 바 (활성인 경우) */}
                      {b.status === 'active' && (() => {
                        const total = new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()
                        const elapsed = Date.now() - new Date(b.starts_at).getTime()
                        const progress = Math.min(100, Math.max(0, (elapsed / total) * 100))
                        return (
                          <div className="mt-3 pt-3 border-t border-dashed">
                            <div className="flex items-center justify-between text-[11px] mb-1.5">
                              <span className="text-muted-foreground">진행률</span>
                              <span className="font-medium">{Math.round(progress)}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  progress >= 80
                                    ? "bg-amber-500"
                                    : "bg-emerald-500"
                                )}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
