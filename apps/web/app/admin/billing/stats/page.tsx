'use client'

/**
 * 부스트 매출 통계 페이지.
 * boost_orders 테이블 기준 일/주/월 매출 추이 분석.
 * 구독·거래수수료·정산 등 다른 결제원은 /admin/billing 에서 확인.
 */
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, TrendingUp, BarChart3, RotateCcw, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

type Period = 'daily' | 'weekly' | 'monthly'

interface RevenueStat {
  date: string
  revenue: number
  count: number
}

export default function BillingStatsPage() {
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('daily')
  const [stats, setStats] = useState<RevenueStat[]>([])
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const supabase = createClient()
  const plaza = getCurrentPlazaClient()

  const loadStats = useCallback(async () => {
    if (!plaza) return
    setLoading(true)
    try {
      // boost_orders 에서 매출 집계
      const now = new Date()
      let fromDate: Date
      switch (period) {
        case 'daily':
          fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)
          break
        case 'weekly':
          fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90)
          break
        case 'monthly':
          fromDate = new Date(now.getFullYear() - 1, now.getMonth(), 1)
          break
      }

      const { data: orders } = await supabase
        .from('boost_orders')
        .select('amount, created_at')
        .eq('plaza_id', plaza)
        .gte('created_at', fromDate.toISOString())
        .order('created_at', { ascending: true })

      if (orders && orders.length > 0) {
        // 간단 집계 — 일별 그룹핑
        const grouped = new Map<string, { revenue: number; count: number }>()
        for (const o of orders) {
          const d = new Date(o.created_at).toLocaleDateString('ko-KR')
          const existing = grouped.get(d) || { revenue: 0, count: 0 }
          existing.revenue += o.amount || 0
          existing.count += 1
          grouped.set(d, existing)
        }
        const result: RevenueStat[] = []
        grouped.forEach((v, k) => result.push({ date: k, ...v }))
        setStats(result)
        setTotalRevenue(result.reduce((s, r) => s + r.revenue, 0))
        setTotalCount(result.reduce((s, r) => s + r.count, 0))
      } else {
        setStats([])
        setTotalRevenue(0)
        setTotalCount(0)
      }
    } catch (e) {
      console.error('Failed to load billing stats:', e)
    } finally {
      setLoading(false)
    }
  }, [plaza, period])

  useEffect(() => { loadStats() }, [loadStats])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">부스트 매출 통계</h1>
          <p className="text-muted-foreground mt-1">부스트 결제 기준 일/주/월별 매출 추이 분석</p>
        </div>
        <div className="flex items-center gap-2">
          {(['daily', 'weekly', 'monthly'] as Period[]).map((p) => (
            <Button
              key={p}
              variant={period === p ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod(p)}
            >
              {p === 'daily' ? '일별' : p === 'weekly' ? '주별' : '월별'}
            </Button>
          ))}
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">부스트 총 매출</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRevenue.toLocaleString()}원</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">부스트 결제 건수</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount.toLocaleString()}건</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">부스트 평균 결제</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalCount > 0 ? Math.round(totalRevenue / totalCount).toLocaleString() : 0}원
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 차트 영역 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            부스트 매출 추이
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : stats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <TrendingUp className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">해당 기간 부스트 매출 데이터가 없습니다</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* 간단 바 차트 */}
              {stats.slice(-15).map((s) => {
                const maxRev = Math.max(...stats.map((x) => x.revenue), 1)
                const pct = (s.revenue / maxRev) * 100
                return (
                  <div key={s.date} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-24 shrink-0 text-right">
                      {s.date}
                    </span>
                    <div className="flex-1 h-6 bg-muted rounded-md overflow-hidden">
                      <div
                        className="h-full bg-primary/80 rounded-md transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium w-20 text-right">
                      {s.revenue.toLocaleString()}원
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
