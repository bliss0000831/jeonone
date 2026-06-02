'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { AdminPageHeader } from '@/components/admin/page-header'
import { cn } from '@/lib/utils'
import { toast } from "sonner"
import {
  Receipt, TrendingUp, TrendingDown, DollarSign, Loader2,
  ArrowUpRight, ArrowDownRight, BarChart3, Calendar,
  ShoppingBag, Home, Package,
} from 'lucide-react'

interface Tx {
  id: string
  title: string | null
  transaction_type: string | null
  price: number | null
  updated_at: string
  status: string | null
}

const TX_TYPE_LABEL: Record<string, string> = {
  sale: '매매',
  rent: '전세',
  monthly: '월세',
  short_term: '단기',
}

const TX_TYPE_COLOR: Record<string, string> = {
  sale: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  rent: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  monthly: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  short_term: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
}

export default function TransactionStatsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<Tx[]>([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const plaza = getCurrentPlazaClient()
      let q: any = supabase
        .from('properties')
        .select('id, title, transaction_type, price, updated_at, status')
        .in('status', ['sold', 'completed'])
        .order('updated_at', { ascending: false })
        .limit(500)
      if (plaza) q = q.eq('plaza_id', plaza)
      const { data, error } = await q
      if (error) toast.error(error.message)
      else setItems((data as Tx[]) || [])
      setLoading(false)
    }
    load()
  }, [])

  const stats = useMemo(() => {
    const now = new Date()
    const thisMonth = now.toISOString().slice(0, 7)
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevMonth = prevDate.toISOString().slice(0, 7)

    const thisMonthItems = items.filter(i => i.updated_at?.slice(0, 7) === thisMonth)
    const prevMonthItems = items.filter(i => i.updated_at?.slice(0, 7) === prevMonth)

    const thisMonthCount = thisMonthItems.length
    const prevMonthCount = prevMonthItems.length
    const diff = thisMonthCount - prevMonthCount
    const totalValue = items.reduce((s, i) => s + (i.price || 0), 0)
    const thisMonthValue = thisMonthItems.reduce((s, i) => s + (i.price || 0), 0)
    const avgPrice = items.length > 0 ? Math.round(totalValue / items.length) : 0

    // 거래 유형별
    const byType = new Map<string, { count: number; value: number }>()
    items.forEach(i => {
      const t = i.transaction_type || '기타'
      const cur = byType.get(t) || { count: 0, value: 0 }
      cur.count++
      cur.value += i.price || 0
      byType.set(t, cur)
    })

    // 월별 추이 (최근 6개월)
    const monthly: { month: string; count: number; value: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const m = d.toISOString().slice(0, 7)
      const monthItems = items.filter(item => item.updated_at?.slice(0, 7) === m)
      monthly.push({
        month: `${d.getMonth() + 1}월`,
        count: monthItems.length,
        value: monthItems.reduce((s, item) => s + (item.price || 0), 0),
      })
    }
    const maxMonthly = Math.max(1, ...monthly.map(m => m.count))

    return {
      thisMonthCount, prevMonthCount, diff, totalValue,
      thisMonthValue, avgPrice, byType, monthly, maxMonthly,
      changePercent: prevMonthCount > 0
        ? Math.round(((thisMonthCount - prevMonthCount) / prevMonthCount) * 100)
        : 0,
    }
  }, [items])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="text-sm">거래 데이터를 분석하는 중...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="거래 통계"
        description="완료된 거래 내역과 추이를 분석합니다"
        icon={<Receipt className="w-6 h-6" />}
      />

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
              <Receipt className="w-4 h-4 text-blue-600" />
            </div>
            {stats.changePercent !== 0 && (
              <span className={cn(
                "text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-auto flex items-center gap-0.5",
                stats.changePercent > 0
                  ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50"
                  : "bg-red-100 text-red-600 dark:bg-red-950/50"
              )}>
                {stats.changePercent > 0
                  ? <ArrowUpRight className="w-3 h-3" />
                  : <ArrowDownRight className="w-3 h-3" />}
                {Math.abs(stats.changePercent)}%
              </span>
            )}
          </div>
          <div className="text-2xl font-bold">{stats.thisMonthCount}<span className="text-sm font-normal text-muted-foreground">건</span></div>
          <div className="text-xs text-muted-foreground mt-0.5">이번달 거래</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-violet-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-violet-600">{stats.thisMonthValue.toLocaleString()}<span className="text-sm font-normal">원</span></div>
          <div className="text-xs text-muted-foreground mt-0.5">이번달 거래액</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <div className="text-2xl font-bold">{items.length}<span className="text-sm font-normal text-muted-foreground">건</span></div>
          <div className="text-xs text-muted-foreground mt-0.5">누적 거래</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-amber-600" />
            </div>
          </div>
          <div className="text-2xl font-bold">{stats.avgPrice.toLocaleString()}<span className="text-sm font-normal">원</span></div>
          <div className="text-xs text-muted-foreground mt-0.5">평균 거래가</div>
        </div>
      </div>

      {/* 월별 추이 */}
      <div className="p-5 rounded-xl border bg-card">
        <h3 className="text-sm font-semibold mb-4">최근 6개월 거래 추이</h3>
        <div className="flex items-end gap-3 h-32">
          {stats.monthly.map((m) => (
            <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs font-bold">{m.count}</span>
              <div
                className="w-full bg-primary/70 rounded-t-md transition-all min-h-[4px]"
                style={{ height: `${(m.count / stats.maxMonthly) * 100}%` }}
              />
              <span className="text-[11px] text-muted-foreground">{m.month}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 거래 유형별 집계 */}
      {stats.byType.size > 0 && (
        <div className="p-5 rounded-xl border bg-card">
          <h3 className="text-sm font-semibold mb-4">거래 유형별 집계</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from(stats.byType.entries()).map(([type, data]) => (
              <div key={type} className="p-3 rounded-lg border bg-muted/20">
                <span className={cn(
                  "text-[11px] font-semibold px-2 py-0.5 rounded-full",
                  TX_TYPE_COLOR[type] || "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                )}>
                  {TX_TYPE_LABEL[type] || type}
                </span>
                <div className="text-xl font-bold mt-2">{data.count}<span className="text-xs font-normal text-muted-foreground">건</span></div>
                <div className="text-xs text-muted-foreground">{data.value.toLocaleString()}원</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 최근 완료 거래 리스트 */}
      <div className="p-5 rounded-xl border bg-card">
        <h3 className="text-sm font-semibold mb-4">최근 완료 거래</h3>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">완료된 거래가 없습니다</p>
        ) : (
          <div className="space-y-2">
            {items.slice(0, 10).map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Home className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{tx.title || '(제목 없음)'}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {tx.transaction_type && (
                      <span className={cn(
                        "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                        TX_TYPE_COLOR[tx.transaction_type] || "bg-gray-100 text-gray-600"
                      )}>
                        {TX_TYPE_LABEL[tx.transaction_type] || tx.transaction_type}
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      {tx.updated_at?.slice(0, 10)}
                    </span>
                  </div>
                </div>
                <div className="text-sm font-bold shrink-0">
                  {(tx.price ?? 0).toLocaleString()}원
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
