'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { AdminPageHeader } from '@/components/admin/page-header'
import { cn } from '@/lib/utils'
import { toast } from "sonner"
import {
  Users, TrendingUp, Eye, Activity, Loader2,
  ArrowUpRight, ArrowDownRight, Globe, Clock,
  Monitor, Smartphone,
} from 'lucide-react'

interface VisitorLog {
  id: string
  created_at: string
  path: string | null
  session_id: string | null
  user_id: string | null
}

export default function VisitorStatsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<VisitorLog[]>([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const iso7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const plaza = getCurrentPlazaClient()
      let q: any = supabase
        .from('visitor_logs')
        .select('id, created_at, path, session_id, user_id')
        .gte('created_at', iso7)
        .limit(5000)
      if (plaza) q = q.eq('plaza_id', plaza)
      const { data, error } = await q
      if (error) toast.error(error.message)
      else setLogs((data as VisitorLog[]) || [])
      setLoading(false)
    }
    load()
  }, [])

  const stats = useMemo(() => {
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    const yesterdayStr = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const todayLogs = logs.filter(l => l.created_at?.slice(0, 10) === todayStr)
    const yesterdayLogs = logs.filter(l => l.created_at?.slice(0, 10) === yesterdayStr)

    const todayCount = todayLogs.length
    const yesterdayCount = yesterdayLogs.length
    const uniqueToday = new Set(todayLogs.map(l => l.session_id).filter(Boolean)).size
    const uniqueYesterday = new Set(yesterdayLogs.map(l => l.session_id).filter(Boolean)).size
    const totalWeek = logs.length
    const uniqueWeek = new Set(logs.map(l => l.session_id).filter(Boolean)).size
    const loggedInToday = new Set(todayLogs.filter(l => l.user_id).map(l => l.user_id)).size

    const changePercent = yesterdayCount > 0
      ? Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100)
      : 0

    // Daily breakdown
    const daily: { date: string; count: number; sessions: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const dayLogs = logs.filter(l => l.created_at?.slice(0, 10) === d)
      daily.push({
        date: d,
        count: dayLogs.length,
        sessions: new Set(dayLogs.map(l => l.session_id).filter(Boolean)).size,
      })
    }
    const maxDaily = Math.max(1, ...daily.map(d => d.count))

    // Top paths
    const pathMap = new Map<string, number>()
    logs.forEach(l => {
      const p = l.path || '(unknown)'
      pathMap.set(p, (pathMap.get(p) || 0) + 1)
    })
    const topPaths = Array.from(pathMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
    const maxPath = topPaths.length > 0 ? topPaths[0][1] : 1

    // Hourly distribution (today)
    const hourly = new Array(24).fill(0)
    todayLogs.forEach(l => {
      const h = new Date(l.created_at).getHours()
      hourly[h]++
    })
    const maxHourly = Math.max(1, ...hourly)
    const peakHour = hourly.indexOf(Math.max(...hourly))

    return {
      todayCount, yesterdayCount, uniqueToday, uniqueYesterday,
      totalWeek, uniqueWeek, loggedInToday, changePercent,
      daily, maxDaily, topPaths, maxPath,
      hourly, maxHourly, peakHour,
    }
  }, [logs])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="text-sm">방문자 데이터를 분석하는 중...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="방문자 통계"
        description="최근 7일간의 방문자 데이터를 분석합니다"
        icon={<Users className="w-6 h-6" />}
      />

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
              <Eye className="w-4 h-4 text-blue-600" />
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
          <div className="text-2xl font-bold">{stats.todayCount.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-0.5">오늘 페이지뷰</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
              <Activity className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{stats.uniqueToday.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-0.5">오늘 순방문자</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-violet-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-violet-600">{stats.yesterdayCount.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-0.5">어제 페이지뷰</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
              <Users className="w-4 h-4 text-amber-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600">{stats.totalWeek.toLocaleString()}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-muted-foreground">7일 총 방문</span>
            <span className="text-[10px] text-muted-foreground/60">({stats.uniqueWeek} 순방문)</span>
          </div>
        </div>
      </div>

      {/* 추가 지표 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="p-3 rounded-lg border bg-card flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/30 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4 text-teal-600" />
          </div>
          <div>
            <div className="text-lg font-bold">{stats.loggedInToday}</div>
            <div className="text-[11px] text-muted-foreground">오늘 로그인 사용자</div>
          </div>
        </div>
        <div className="p-3 rounded-lg border bg-card flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 text-rose-600" />
          </div>
          <div>
            <div className="text-lg font-bold">{stats.peakHour}시</div>
            <div className="text-[11px] text-muted-foreground">오늘 피크 시간대</div>
          </div>
        </div>
        <div className="p-3 rounded-lg border bg-card flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center shrink-0">
            <Globe className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <div className="text-lg font-bold">
              {stats.uniqueToday > 0 ? (stats.todayCount / stats.uniqueToday).toFixed(1) : '0'}
            </div>
            <div className="text-[11px] text-muted-foreground">인당 페이지뷰</div>
          </div>
        </div>
      </div>

      {/* 7일 일별 차트 */}
      <div className="p-5 rounded-xl border bg-card">
        <h3 className="text-sm font-semibold mb-4">최근 7일 일별 방문</h3>
        <div className="space-y-2.5">
          {stats.daily.map((d) => {
            const isToday = d.date === new Date().toISOString().slice(0, 10)
            return (
              <div key={d.date} className="flex items-center gap-3">
                <div className={cn(
                  "w-20 text-xs shrink-0",
                  isToday ? "font-semibold text-primary" : "text-muted-foreground"
                )}>
                  {isToday ? '오늘' : d.date.slice(5)}
                </div>
                <div className="flex-1 h-7 bg-muted/50 rounded-md overflow-hidden relative">
                  <div
                    className={cn(
                      "h-full rounded-md transition-all",
                      isToday ? "bg-primary" : "bg-primary/60"
                    )}
                    style={{ width: `${(d.count / stats.maxDaily) * 100}%` }}
                  />
                </div>
                <div className="w-20 text-right">
                  <span className="text-sm font-bold">{d.count}</span>
                  <span className="text-[10px] text-muted-foreground ml-1">({d.sessions})</span>
                </div>
              </div>
            )
          })}
        </div>
        <div className="text-[10px] text-muted-foreground mt-3 text-right">
          페이지뷰 (순방문자)
        </div>
      </div>

      {/* 시간대별 분포 */}
      <div className="p-5 rounded-xl border bg-card">
        <h3 className="text-sm font-semibold mb-4">오늘 시간대별 분포</h3>
        <div className="flex items-end gap-0.5 h-24">
          {stats.hourly.map((count, h) => (
            <div key={h} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={cn(
                  "w-full rounded-sm transition-all min-h-[2px]",
                  h === stats.peakHour ? "bg-primary" : "bg-primary/40"
                )}
                style={{ height: `${(count / stats.maxHourly) * 100}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-0.5 mt-1">
          {stats.hourly.map((_, h) => (
            <div key={h} className="flex-1 text-center text-[8px] text-muted-foreground">
              {h % 3 === 0 ? `${h}` : ''}
            </div>
          ))}
        </div>
      </div>

      {/* 인기 경로 TOP 10 */}
      <div className="p-5 rounded-xl border bg-card">
        <h3 className="text-sm font-semibold mb-4">인기 경로 TOP 10</h3>
        {stats.topPaths.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">데이터가 없습니다</p>
        ) : (
          <div className="space-y-2">
            {stats.topPaths.map(([path, count], i) => (
              <div key={path} className="flex items-center gap-3">
                <span className={cn(
                  "w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0",
                  i < 3
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                )}>
                  {i + 1}
                </span>
                <span className="flex-1 text-sm font-mono truncate">{path}</span>
                <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden shrink-0 hidden md:block">
                  <div
                    className="h-full bg-primary/60 rounded-full"
                    style={{ width: `${(count / stats.maxPath) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-bold w-12 text-right shrink-0">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
