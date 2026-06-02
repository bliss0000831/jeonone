'use client'

/**
 * 접속자 집계 — 리메이크.
 *
 * 서버사이드 API (/api/admin/stats/visitors) 사용 → RLS 우회 + 광장별 격리.
 * 앱/웹 소스 구분, 기기·브라우저·OS·시간대 집계 표시.
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Loader2, Users, Monitor, Smartphone, Tablet, Globe, Clock,
  TrendingUp, Calendar, RefreshCw, Laptop, AppWindow,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Stats {
  today: number
  yesterday: number
  thisWeek: number
  thisMonth: number
  total: number
  currentOnline: number
  todayPageViews: number
  maxDaily: number
  maxDailyDate: string
}

interface DeviceStats { desktop: number; mobile: number; tablet: number }
interface HourlyItem { hour: number; count: number }
interface NameCount { name: string; count: number }

export default function VisitorStatsPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats>({
    today: 0, yesterday: 0, thisWeek: 0, thisMonth: 0,
    total: 0, currentOnline: 0, todayPageViews: 0, maxDaily: 0, maxDailyDate: '',
  })
  const [devices, setDevices] = useState<DeviceStats>({ desktop: 0, mobile: 0, tablet: 0 })
  const [hourly, setHourly] = useState<HourlyItem[]>([])
  const [topBrowsers, setTopBrowsers] = useState<NameCount[]>([])
  const [topOS, setTopOS] = useState<NameCount[]>([])
  const [source, setSource] = useState({ app: 0, web: 0 })
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stats/visitors')
      if (!res.ok) return
      const json = await res.json()
      setStats(json.stats)
      setDevices(json.devices)
      setHourly(json.hourly)
      setTopBrowsers(json.topBrowsers)
      setTopOS(json.topOS)
      setSource(json.source)
      setLastUpdated(new Date())
    } catch (e) {
      console.error('통계 로드 실패:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    // 5분마다 새로고침 + 탭 활성 시에만
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadData()
    }, 5 * 60 * 1000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadData()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [loadData])

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>
  }

  const maxHourly = Math.max(...hourly.map(h => h.count), 1)
  const totalDevices = devices.desktop + devices.mobile + devices.tablet || 1
  const totalSource = source.app + source.web || 1

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" />
            접속자 집계
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            실시간 방문자 통계 (웹 + 앱)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-[11px] text-muted-foreground">
              {lastUpdated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 갱신
            </span>
          )}
          <button
            onClick={() => { setLoading(true); loadData() }}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* 핵심 지표 4개 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Users className="w-4 h-4 opacity-80" />
              <span className="text-xs opacity-80">현재 접속자</span>
            </div>
            <p className="text-3xl font-bold">{stats.currentOnline}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Calendar className="w-4 h-4 opacity-80" />
              <span className="text-xs opacity-80">오늘 방문자</span>
            </div>
            <p className="text-3xl font-bold">{stats.today}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Globe className="w-4 h-4 opacity-80" />
              <span className="text-xs opacity-80">오늘 페이지뷰</span>
            </div>
            <p className="text-3xl font-bold">{stats.todayPageViews}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1.5">
              <TrendingUp className="w-4 h-4 opacity-80" />
              <span className="text-xs opacity-80">전체 방문</span>
            </div>
            <p className="text-3xl font-bold">{stats.total.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* 앱 vs 웹 + 기간별 + 기기별 */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* 접속 소스 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AppWindow className="w-4 h-4" />
              접속 소스 (오늘)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <SourceBar label="웹" count={source.web} total={totalSource} color="bg-blue-500" icon={<Laptop className="w-4 h-4 text-blue-500" />} />
            <SourceBar label="앱" count={source.app} total={totalSource} color="bg-emerald-500" icon={<Smartphone className="w-4 h-4 text-emerald-500" />} />
          </CardContent>
        </Card>

        {/* 기간별 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4" />
              기간별 방문자
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              <PeriodRow label="어제" value={stats.yesterday} />
              <PeriodRow label="이번 주" value={stats.thisWeek} />
              <PeriodRow label="이번 달" value={stats.thisMonth} />
              <PeriodRow label="최대 일일" value={stats.maxDaily} suffix={`(${stats.maxDailyDate})`} />
            </div>
          </CardContent>
        </Card>

        {/* 기기별 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Monitor className="w-4 h-4" />
              기기별 (오늘)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <SourceBar label="데스크톱" count={devices.desktop} total={totalDevices} color="bg-blue-500" icon={<Monitor className="w-4 h-4 text-blue-500" />} />
            <SourceBar label="모바일" count={devices.mobile} total={totalDevices} color="bg-emerald-500" icon={<Smartphone className="w-4 h-4 text-emerald-500" />} />
            <SourceBar label="태블릿" count={devices.tablet} total={totalDevices} color="bg-purple-500" icon={<Tablet className="w-4 h-4 text-purple-500" />} />
          </CardContent>
        </Card>
      </div>

      {/* 시간대별 차트 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">시간대별 접속 (오늘)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-[3px] h-32">
            {hourly.map((h) => {
              const pct = (h.count / maxHourly) * 100
              const isNow = new Date().getHours() === h.hour
              return (
                <div key={h.hour} className="flex-1 flex flex-col items-center group relative">
                  {h.count > 0 && (
                    <span className="absolute -top-5 text-[9px] font-medium text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                      {h.count}
                    </span>
                  )}
                  <div
                    className={cn(
                      'w-full rounded-t min-h-[2px] transition-all',
                      isNow ? 'bg-primary' : 'bg-primary/50',
                    )}
                    style={{ height: `${Math.max(pct, 2)}%` }}
                  />
                  {h.hour % 3 === 0 && (
                    <span className={cn('text-[9px] mt-1', isNow ? 'text-primary font-bold' : 'text-muted-foreground')}>
                      {h.hour}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-center text-[11px] text-muted-foreground mt-2">시간 (0–23시) · 호버하면 수치 표시</p>
        </CardContent>
      </Card>

      {/* 브라우저 + OS */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">브라우저 (오늘)</CardTitle>
          </CardHeader>
          <CardContent>
            {topBrowsers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">데이터 없음</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {topBrowsers.map((b) => (
                  <div key={b.name} className="text-center p-3 bg-muted/50 rounded-lg">
                    <p className="text-lg font-bold">{b.count}</p>
                    <p className="text-[11px] text-muted-foreground">{b.name}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">운영체제 (오늘)</CardTitle>
          </CardHeader>
          <CardContent>
            {topOS.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">데이터 없음</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {topOS.map((o) => (
                  <div key={o.name} className="text-center p-3 bg-muted/50 rounded-lg">
                    <p className="text-lg font-bold">{o.count}</p>
                    <p className="text-[11px] text-muted-foreground">{o.name}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/* ── 서브 컴포넌트 ── */

function SourceBar({ label, count, total, color, icon }: {
  label: string; count: number; total: number; color: string; icon: React.ReactNode
}) {
  const pct = Math.round((count / total) * 100)
  return (
    <div className="flex items-center gap-3">
      {icon}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between text-sm mb-1">
          <span>{label}</span>
          <span className="font-bold tabular-nums">{count} <span className="text-xs text-muted-foreground font-normal">({pct}%)</span></span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}

function PeriodRow({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-bold tabular-nums">
        {value.toLocaleString()}
        {suffix && <span className="text-xs text-muted-foreground font-normal ml-1">{suffix}</span>}
      </span>
    </div>
  )
}
