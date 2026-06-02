'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { AdminPageHeader } from '@/components/admin/page-header'
import { cn } from '@/lib/utils'
import { toast } from "sonner"
import {
  Home, Tag, CheckCircle2, Eye, Loader2,
  BarChart3, TrendingUp, Package, Clock, XCircle,
  Building2,
} from 'lucide-react'

interface Property {
  id: string
  title?: string
  status: string | null
  transaction_type: string | null
  property_type: string | null
  created_at: string
  price: number | null
  views: number | null
}

const STATUS_LABEL: Record<string, string> = {
  active: '판매중',
  available: '판매중',
  reserved: '예약중',
  completed: '거래완료',
  sold: '거래완료',
  hidden: '숨김',
}

const STATUS_CONFIG: Record<string, { color: string; bgColor: string; icon: typeof Home }> = {
  active: { color: 'text-emerald-600', bgColor: 'bg-emerald-50 dark:bg-emerald-950/30', icon: Tag },
  available: { color: 'text-emerald-600', bgColor: 'bg-emerald-50 dark:bg-emerald-950/30', icon: Tag },
  reserved: { color: 'text-amber-600', bgColor: 'bg-amber-50 dark:bg-amber-950/30', icon: Clock },
  completed: { color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-950/30', icon: CheckCircle2 },
  sold: { color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-950/30', icon: CheckCircle2 },
  hidden: { color: 'text-gray-400', bgColor: 'bg-gray-100 dark:bg-gray-800', icon: XCircle },
}

const TX_TYPE_LABEL: Record<string, string> = {
  sale: '매매',
  rent: '전세',
  monthly: '월세',
  short_term: '단기',
}

export default function PropertiesStatsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<Property[]>([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const plaza = getCurrentPlazaClient()
      let q: any = supabase
        .from('properties')
        .select('id, title, status, transaction_type, property_type, created_at, price, views')
        .limit(10000)
      if (plaza) q = q.eq('plaza_id', plaza)
      const { data, error } = await q
      if (error) toast.error(error.message)
      else setItems((data as Property[]) || [])
      setLoading(false)
    }
    load()
  }, [])

  const stats = useMemo(() => {
    const total = items.length
    const active = items.filter(p => p.status === 'active' || p.status === 'available').length
    const completed = items.filter(p => p.status === 'completed' || p.status === 'sold').length
    const reserved = items.filter(p => p.status === 'reserved').length
    const hidden = items.filter(p => p.status === 'hidden').length
    const totalViews = items.reduce((s, p) => s + (p.views || 0), 0)
    const avgPrice = items.length > 0
      ? Math.round(items.reduce((s, p) => s + (p.price || 0), 0) / items.length)
      : 0

    const mostViewed = items.reduce<Property | null>(
      (best, p) => (!best || (p.views || 0) > (best.views || 0) ? p : best),
      null
    )

    // 상태별 집계
    const byStatus = new Map<string, number>()
    items.forEach(p => {
      const s = p.status || '미지정'
      byStatus.set(s, (byStatus.get(s) || 0) + 1)
    })

    // 거래 유형별 집계
    const byType = new Map<string, number>()
    items.forEach(p => {
      const t = p.transaction_type || '미지정'
      byType.set(t, (byType.get(t) || 0) + 1)
    })

    // 매물 유형별 집계
    const byPropertyType = new Map<string, number>()
    items.forEach(p => {
      const t = p.property_type || '미지정'
      byPropertyType.set(t, (byPropertyType.get(t) || 0) + 1)
    })

    // 최근 7일 등록 추이
    const now = new Date()
    const daily: { date: string; count: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      daily.push({
        date: d,
        count: items.filter(p => p.created_at?.slice(0, 10) === d).length,
      })
    }
    const maxDaily = Math.max(1, ...daily.map(d => d.count))

    return {
      total, active, completed, reserved, hidden,
      totalViews, avgPrice, mostViewed,
      byStatus, byType, byPropertyType, daily, maxDaily,
    }
  }, [items])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="text-sm">매물 데이터를 분석하는 중...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="매물 현황"
        description="매물 상태·유형별 현황을 분석합니다"
        icon={<Home className="w-6 h-6" />}
      />

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Home className="w-4 h-4 text-primary" />
            </div>
          </div>
          <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-0.5">전체 매물</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
              <Tag className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{stats.active.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-0.5">판매중</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-blue-600">{stats.completed.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-0.5">거래완료</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center">
              <Eye className="w-4 h-4 text-violet-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-violet-600">{stats.totalViews.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-0.5">총 조회수</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-amber-600" />
            </div>
          </div>
          <div className="text-2xl font-bold">{stats.avgPrice.toLocaleString()}<span className="text-sm font-normal">원</span></div>
          <div className="text-xs text-muted-foreground mt-0.5">평균 가격</div>
        </div>
      </div>

      {/* 최다 조회 매물 */}
      {stats.mostViewed && (stats.mostViewed.views || 0) > 0 && (
        <div className="p-4 rounded-xl border bg-card flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center shrink-0">
            <Eye className="w-5 h-5 text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-muted-foreground">최다 조회 매물</div>
            <div className="text-sm font-semibold truncate">{stats.mostViewed.title || '(제목 없음)'}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-bold text-violet-600">{(stats.mostViewed.views || 0).toLocaleString()}</div>
            <div className="text-[11px] text-muted-foreground">조회</div>
          </div>
        </div>
      )}

      {/* 7일 등록 추이 */}
      <div className="p-5 rounded-xl border bg-card">
        <h3 className="text-sm font-semibold mb-4">최근 7일 매물 등록 추이</h3>
        <div className="space-y-2.5">
          {stats.daily.map((d) => {
            const isToday = d.date === new Date().toISOString().slice(0, 10)
            return (
              <div key={d.date} className="flex items-center gap-3">
                <div className={cn(
                  "w-16 text-xs shrink-0",
                  isToday ? "font-semibold text-primary" : "text-muted-foreground"
                )}>
                  {isToday ? '오늘' : d.date.slice(5)}
                </div>
                <div className="flex-1 h-6 bg-muted/50 rounded-md overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-md transition-all",
                      isToday ? "bg-emerald-500" : "bg-emerald-400/60"
                    )}
                    style={{ width: `${(d.count / stats.maxDaily) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-bold w-8 text-right">{d.count}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 상태별 + 거래유형별 */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="p-5 rounded-xl border bg-card">
          <h3 className="text-sm font-semibold mb-4">상태별 집계</h3>
          <div className="space-y-2">
            {Array.from(stats.byStatus.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([status, count]) => {
                const conf = STATUS_CONFIG[status] || STATUS_CONFIG.hidden
                const StatusIcon = conf.icon
                const maxStatusCount = Math.max(1, ...Array.from(stats.byStatus.values()))
                return (
                  <div key={status} className="flex items-center gap-3">
                    <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", conf.bgColor)}>
                      <StatusIcon className={cn("w-3.5 h-3.5", conf.color)} />
                    </div>
                    <span className="text-sm w-16 shrink-0">{STATUS_LABEL[status] || status}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", conf.color.replace('text-', 'bg-'))}
                        style={{ width: `${(count / maxStatusCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold w-10 text-right">{count}</span>
                  </div>
                )
              })}
          </div>
        </div>

        <div className="p-5 rounded-xl border bg-card">
          <h3 className="text-sm font-semibold mb-4">거래 유형별 집계</h3>
          <div className="space-y-2">
            {Array.from(stats.byType.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => {
                const maxTypeCount = Math.max(1, ...Array.from(stats.byType.values()))
                return (
                  <div key={type} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center shrink-0">
                      <Building2 className="w-3.5 h-3.5 text-blue-600" />
                    </div>
                    <span className="text-sm w-16 shrink-0">{TX_TYPE_LABEL[type] || type}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500/60 rounded-full" style={{ width: `${(count / maxTypeCount) * 100}%` }} />
                    </div>
                    <span className="text-sm font-bold w-10 text-right">{count}</span>
                  </div>
                )
              })}
          </div>
        </div>
      </div>
    </div>
  )
}
