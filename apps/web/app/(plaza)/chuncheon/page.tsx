'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { useSiteBranding } from '@/components/site-branding-client'
import { plazaCityName } from '@/lib/plaza/city-name'
import { Header } from '@/components/header'
import { BottomNav } from '@/components/bottom-nav'
import {
  Newspaper, CalendarDays, Search, X, RefreshCw,
  ExternalLink, Clock, MapPin, ChevronLeft, ChevronRight, Loader2,
  CloudSun, Droplets, Wind,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NewsItem } from '@/app/api/news/route'
import { User } from '@supabase/supabase-js'

// ─── 타입 ────────────────────────────────────────────────────────────────────
interface ChuncheonEvent {
  id: string
  title: string
  description: string | null
  location: string | null
  event_date: string
  end_date: string | null
  category: string
  color: string | null
  link_url: string | null
  external_id?: string | null
  is_active?: boolean
  source?: string | null
  source_url?: string | null
  plaza_id?: string | null
  created_at?: string
  updated_at?: string
}

const CATEGORY_LABELS: Record<string, string> = {
  festival: '축제', event: '행사', culture: '문화', sports: '스포츠',
  exhibition: '전시', general: '일반', market: '시장', nature: '자연',
  community: '지역사회', economy: '경제', social: '사회', education: '교육',
}

// ─── 뉴스 카드 ───────────────────────────────────────────────────────────────
function NewsCard({ item }: { item: NewsItem }) {
  // 썸네일 URL 은 있는데 실제 로드 실패하면 (언론사 hotlink 차단/만료 CDN/CORS)
  // 카드 자체를 숨김 — 빈 박스로 자리 차지하지 않게.
  const [hidden, setHidden] = useState(false)
  if (hidden) return null
  // 썸네일 URL 자체가 없는 경우도 노출 X — 썸네일 있는 기사만 보여주기 위함
  if (!item.thumbnail) return null

  const elapsed = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const h = Math.floor(diff / 3_600_000)
    const m = Math.floor(diff / 60_000)
    if (h > 23) return `${Math.floor(h / 24)}일 전`
    if (h > 0) return `${h}시간 전`
    return `${Math.max(1, m)}분 전`
  }

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all duration-200 overflow-hidden"
    >
      <img
        src={item.thumbnail}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className="w-full h-48 object-cover bg-muted flex-shrink-0"
        onError={() => setHidden(true)}
      />
      <div className="flex flex-col flex-1 p-3.5 gap-2">
        <p className="text-sm font-semibold text-foreground group-hover:text-primary line-clamp-2 leading-snug transition-colors">
          {item.title}
        </p>
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {item.description}
          </p>
        )}
        <div className="flex items-center gap-1.5 mt-auto text-xs text-muted-foreground pt-1">
          <span className="font-medium text-foreground/70">{item.press}</span>
          <span>·</span>
          <span className="flex items-center gap-0.5">
            <Clock className="w-3 h-3" />
            {elapsed(item.publishedAt)}
          </span>
          <ExternalLink className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-50 transition-opacity" />
        </div>
      </div>
    </a>
  )
}

// ─── 달력 ────────────────────────────────────────────────────────────────────
function MiniCalendar({ events }: { events: ChuncheonEvent[] }) {
  const today = new Date()
  const [current, setCurrent] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; events: ChuncheonEvent[] } | null>(null)
  const calRef = useRef<HTMLDivElement>(null)

  const year = current.getFullYear()
  const month = current.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const toKey = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  const eventMap = new Map<string, ChuncheonEvent[]>()
  events.forEach((ev) => {
    const start = new Date(ev.event_date)
    const end = ev.end_date ? new Date(ev.end_date) : start
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split('T')[0]
      if (!eventMap.has(key)) eventMap.set(key, [])
      eventMap.get(key)!.push(ev)
    }
  })

  const handleDayClick = (key: string, e: React.MouseEvent) => {
    const evs = eventMap.get(key)
    if (!evs?.length) { setSelectedDate(null); setTooltip(null); return }
    setSelectedDate(key)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const calRect = calRef.current?.getBoundingClientRect()
    if (!calRect) return
    setTooltip({ x: rect.left - calRect.left, y: rect.bottom - calRect.top + 4, events: evs })
  }

  const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']
  const DAYS = ['일','월','화','수','목','금','토']
  const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate())
  const selectedEventsForList = selectedDate ? (eventMap.get(selectedDate) || []) : []

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => { setCurrent(new Date(year, month - 1, 1)); setSelectedDate(null); setTooltip(null) }}
          className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold">{year}년 {MONTHS[month]}</span>
        <button
          onClick={() => { setCurrent(new Date(year, month + 1, 1)); setSelectedDate(null); setTooltip(null) }}
          className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d, i) => (
          <div key={d} className={cn('text-center text-[10px] font-medium py-1',
            i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-muted-foreground'
          )}>{d}</div>
        ))}
      </div>

      <div ref={calRef} className="relative grid grid-cols-7 gap-y-0.5">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const key = toKey(year, month, day)
          const dayEvents = eventMap.get(key) || []
          const isToday = key === todayKey
          const isSelected = key === selectedDate
          const dayOfWeek = (firstDay + i) % 7

          return (
            <button
              key={key}
              onClick={(e) => handleDayClick(key, e)}
              className={cn('relative flex flex-col items-center justify-start py-1 rounded-lg transition-all',
                isSelected ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted/70'
              )}
            >
              <span className={cn('w-6 h-6 flex items-center justify-center rounded-full text-xs',
                isToday && 'bg-primary text-white font-bold',
                !isToday && dayOfWeek === 0 && 'text-red-500',
                !isToday && dayOfWeek === 6 && 'text-blue-500',
                !isToday && dayOfWeek !== 0 && dayOfWeek !== 6 && 'text-foreground',
              )}>{day}</span>
              {dayEvents.length > 0 && (
                <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center px-0.5">
                  {dayEvents.slice(0, 3).map((ev, idx) => (
                    <span key={idx} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ev.color ?? undefined }} />
                  ))}
                  {dayEvents.length > 3 && <span className="text-[8px] text-muted-foreground">+{dayEvents.length - 3}</span>}
                </div>
              )}
            </button>
          )
        })}

        {tooltip && (
          <div
            className="absolute z-20 w-56 bg-card border border-border rounded-xl shadow-xl p-3 animate-in fade-in slide-in-from-top-1 duration-150"
            style={{ left: Math.min(tooltip.x, 220), top: tooltip.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs text-muted-foreground mb-2 font-medium">{selectedDate?.replace(/-/g, '.')} 행사</p>
            <div className="space-y-2">
              {tooltip.events.map((ev) => (
                <div key={ev.id} className="flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: ev.color ?? undefined }} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium line-clamp-1">
                      {ev.link_url ? <a href={ev.link_url} target="_blank" rel="noopener noreferrer" className="hover:underline">{ev.title}</a> : ev.title}
                    </p>
                    {ev.location && (
                      <p className="text-[10px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
                        <MapPin className="w-2.5 h-2.5" />{ev.location}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button className="mt-2 text-[10px] text-muted-foreground hover:text-foreground" onClick={() => { setTooltip(null); setSelectedDate(null) }}>닫기</button>
          </div>
        )}
      </div>

      {selectedEventsForList.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">{selectedDate?.replace(/-/g, '.')} 일정</p>
          {selectedEventsForList.map((ev) => (
            <div key={ev.id} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-muted/50">
              <span className="w-2.5 h-2.5 rounded-full mt-0.5 flex-shrink-0" style={{ backgroundColor: ev.color ?? undefined }} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">{ev.title}</p>
                {ev.description && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{ev.description}</p>}
                <div className="flex items-center gap-2 mt-1">
                  {ev.location && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{ev.location}</span>}
                  {ev.end_date && ev.end_date !== ev.event_date && <span className="text-[10px] text-muted-foreground">~ {ev.end_date.replace(/-/g, '.')}</span>}
                </div>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
                style={{ backgroundColor: `${ev.color ?? ''}20`, color: ev.color ?? undefined }}>
                {CATEGORY_LABELS[ev.category] || ev.category}
              </span>
            </div>
          ))}
        </div>
      )}

      {selectedEventsForList.length === 0 && (
        <div className="mt-5 space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground mb-2">이달의 주요 행사</p>
          {(() => {
            const thisMonth = `${year}-${String(month + 1).padStart(2, '0')}`
            const upcoming = events.filter(ev => ev.event_date.startsWith(thisMonth))
              .sort((a, b) => a.event_date.localeCompare(b.event_date)).slice(0, 8)
            if (!upcoming.length) return <p className="text-xs text-muted-foreground text-center py-3">이번 달 등록된 행사가 없습니다</p>
            return upcoming.map((ev) => (
              <div key={ev.id} className="flex items-center gap-2.5 py-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color ?? undefined }} />
                <span className="text-[11px] text-muted-foreground w-10 flex-shrink-0">{ev.event_date.split('-')[2]}일</span>
                <span className="text-xs font-medium truncate">{ev.title}</span>
              </div>
            ))
          })()}
        </div>
      )}

      <div className="mt-5 pt-4 border-t border-border/50">
        <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">카테고리</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries({ festival:'#6366f1', event:'#3b82f6', culture:'#8b5cf6', sports:'#ef4444', exhibition:'#06b6d4', general:'#10b981' })
            .map(([key, color]) => (
              <span key={key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                {CATEGORY_LABELS[key]}
              </span>
            ))}
        </div>
      </div>
    </div>
  )
}

// ─── 날씨 ────────────────────────────────────────────────────────────────────
interface ForecastDay {
  date: string
  min: number | null
  max: number | null
  rainProb: number | null
  sky: string
  pty: string
  text: string
  icon: string
}
interface HourlyItem {
  stamp: string
  date: string
  hour: number
  temp: number | null
  sky: string
  pty: string
  rainProb: number
  text: string
  icon: string
}
interface WeatherData {
  location: string
  current: {
    temp: number | null
    humidity: number | null
    windSpeed: number | null
    rainfall: number | null
    updatedAt: string
  } | null
  forecast: ForecastDay[]
  hourly?: HourlyItem[]
}

function WeatherPanel({
  data,
  loading,
  onRefresh,
}: {
  data: WeatherData | null
  loading: boolean
  onRefresh: () => void
}) {
  const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']
  const isToday = (iso: string) => iso === new Date().toISOString().slice(0, 10)
  const dayLabel = (iso: string) => {
    const d = new Date(iso + 'T00:00:00')
    return DAY_LABELS[d.getDay()]
  }
  const monthDay = (iso: string) => {
    const [, m, d] = iso.split('-')
    return `${Number(m)}/${Number(d)}`
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }
  if (!data) {
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        날씨 정보를 불러올 수 없습니다
        <button
          onClick={onRefresh}
          className="block mx-auto mt-3 text-xs text-primary underline"
        >
          다시 시도
        </button>
      </div>
    )
  }

  const today = data.forecast[0]

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          {data.location} 실시간 날씨
        </span>
        <button
          onClick={onRefresh}
          className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
          title="새로고침"
        >
          <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* 현재 날씨 카드 */}
      <div className="bg-gradient-to-br from-sky-50 to-blue-50 dark:from-sky-950/30 dark:to-blue-950/30 border border-sky-100 dark:border-sky-900/50 rounded-2xl p-5 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">지금</p>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold text-foreground">
                {data.current?.temp != null ? Math.round(data.current.temp) : '--'}
              </span>
              <span className="text-2xl text-muted-foreground">°C</span>
            </div>
            {today && (
              <p className="text-xs text-muted-foreground mt-1">
                {today.text} · 최고 {today.max ?? '--'}° / 최저 {today.min ?? '--'}°
              </p>
            )}
          </div>
          <div className="text-6xl leading-none">{today?.icon || '🌤️'}</div>
        </div>
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-sky-100 dark:border-sky-900/40">
          {data.current?.humidity != null && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Droplets className="w-3.5 h-3.5 text-sky-500" />
              습도 {data.current.humidity}%
            </div>
          )}
          {data.current?.windSpeed != null && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wind className="w-3.5 h-3.5 text-slate-500" />
              풍속 {data.current.windSpeed.toFixed(1)}m/s
            </div>
          )}
          {today?.rainProb != null && today.rainProb > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CloudSun className="w-3.5 h-3.5 text-blue-500" />
              강수확률 {today.rainProb}%
            </div>
          )}
        </div>
      </div>

      {/* 시간별 예보 (앞으로 24시간) */}
      {data.hourly && data.hourly.length > 0 && (
        <>
          <p className="text-xs font-semibold text-muted-foreground mb-2">시간별 예보</p>
          <div className="overflow-x-auto -mx-1 px-1 mb-5 scrollbar-thin">
            <div className="flex gap-2 pb-1" style={{ minWidth: 'max-content' }}>
              {data.hourly.map((h, idx) => {
                const isNow = idx === 0
                const hourLabel = isNow ? '지금' : `${h.hour}시`
                return (
                  <div
                    key={h.stamp}
                    className={cn(
                      'flex flex-col items-center rounded-xl px-2.5 py-2 border min-w-[56px]',
                      isNow
                        ? 'bg-primary/10 border-primary/30'
                        : 'bg-muted/40 border-transparent',
                    )}
                  >
                    <p
                      className={cn(
                        'text-[10px] font-medium whitespace-nowrap',
                        isNow ? 'text-primary' : 'text-muted-foreground',
                      )}
                    >
                      {hourLabel}
                    </p>
                    <div className="text-xl leading-tight my-1">{h.icon}</div>
                    <p className="text-sm font-semibold">
                      {h.temp != null ? `${Math.round(h.temp)}°` : '--'}
                    </p>
                    {h.rainProb > 0 && (
                      <p className="text-[9px] text-blue-500 mt-0.5 whitespace-nowrap">
                        💧{h.rainProb}%
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* 주간 예보 */}
      <p className="text-xs font-semibold text-muted-foreground mb-2">5일 예보</p>
      <div className="grid grid-cols-5 gap-2">
        {data.forecast.slice(0, 5).map((d) => (
          <div
            key={d.date}
            className={cn(
              'rounded-xl p-2.5 text-center border',
              isToday(d.date)
                ? 'bg-primary/5 border-primary/30'
                : 'bg-muted/40 border-transparent',
            )}
          >
            <p
              className={cn(
                'text-[10px] font-medium',
                isToday(d.date) ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {isToday(d.date) ? '오늘' : dayLabel(d.date)}
            </p>
            <p className="text-[10px] text-muted-foreground mb-1">
              {monthDay(d.date)}
            </p>
            <div className="text-2xl leading-tight mb-1">{d.icon}</div>
            <p className="text-[10px] text-muted-foreground line-clamp-1">
              {d.text}
            </p>
            <p className="text-xs font-medium mt-1">
              <span className="text-red-500">{d.max ?? '--'}°</span>
              <span className="text-muted-foreground mx-0.5">/</span>
              <span className="text-blue-500">{d.min ?? '--'}°</span>
            </p>
            {d.rainProb != null && d.rainProb > 0 && (
              <p className="text-[9px] text-blue-500 mt-0.5">💧{d.rainProb}%</p>
            )}
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground text-center mt-4">
        기상청 단기 · 중기예보 API
      </p>
    </div>
  )
}

// ─── 메인 페이지 ─────────────────────────────────────────────────────────────
export default function ChuncheonPage() {
  const { name: plazaName } = useSiteBranding()
  const cityName = plazaCityName(plazaName)
  const [user, setUser] = useState<User | null>(null)
  const [activeTab, setActiveTab] = useState<'news' | 'calendar' | 'weather'>('news')
  // 광장 내 세부 지역 (춘천/홍천/화천/양구/인제). 빈 문자열 = "전체"
  const [coverage, setCoverage] = useState<string[]>([])
  const [selectedRegion, setSelectedRegion] = useState<string>('')
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loadingWeather, setLoadingWeather] = useState(false)
  const [weatherLoaded, setWeatherLoaded] = useState(false)
  const [weatherKey, setWeatherKey] = useState(0)
  const [news, setNews] = useState<NewsItem[]>([])
  const [events, setEvents] = useState<ChuncheonEvent[]>([])
  const [loadingNews, setLoadingNews] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [usedMock, setUsedMock] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  // 유저 + 본인 sub_region 로드 (기본 지역 결정용)
  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('sub_region')
          .eq('id', user.id)
          .maybeSingle()
        const region = (profile as any)?.sub_region
        if (region && typeof region === 'string') {
          setSelectedRegion(region)
        }
      }
    })()
  }, [])

  // 광장 coverage 로드 (sub-region 탭 노출용)
  useEffect(() => {
    const supabase = createClient()
    const plaza = getCurrentPlazaClient()
    if (!plaza) return
    supabase
      .from('plazas')
      .select('coverage')
      .eq('id', plaza)
      .maybeSingle()
      .then(({ data }) => {
        const cov = (data as any)?.coverage
        if (Array.isArray(cov)) setCoverage(cov)
      })
  }, [])

  // 날씨 prefetch — 페이지 진입 즉시 + 새로고침/지역변경 시 네트워크 호출
  //   · 캐시 헤더(s-maxage=600) 덕에 실제론 엣지/브라우저 캐시에서 즉시 응답
  //   · 선택 지역 바뀌면 그 지역 좌표 격자 기준 날씨로 재조회
  useEffect(() => {
    setLoadingWeather(true)
    const params = new URLSearchParams()
    if (selectedRegion) params.set('region', selectedRegion)
    if (weatherKey) params.set('_', String(weatherKey))
    const qs = params.toString()
    fetch(`/api/weather${qs ? `?${qs}` : ''}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok) setWeather(data)
        else setWeather(null)
        setWeatherLoaded(true)
      })
      .catch(() => setWeather(null))
      .finally(() => setLoadingWeather(false))
  }, [weatherKey, selectedRegion])

  // 이벤트 로드 (광장별 필터)
  useEffect(() => {
    const supabase = createClient()
    setLoadingEvents(true)
    const plaza = getCurrentPlazaClient()
    let q = supabase.from('chuncheon_events').select('*').eq('is_active', true).order('event_date')
    if (plaza) q = q.eq('plaza_id', plaza)
    q.then(({ data }) => { setEvents(data || []) }).then(() => setLoadingEvents(false), () => setLoadingEvents(false))
  }, [])

  // 뉴스 최초 로드 / 검색어·지역 변경시
  const loadNews = useCallback(async (q: string, region: string, resetPage = true) => {
    if (resetPage) {
      setLoadingNews(true)
      setPage(1)
    }
    const currentPage = resetPage ? 1 : page
    try {
      const params = new URLSearchParams({ page: String(currentPage), _: String(refreshKey) })
      if (q) params.set('q', q)
      if (region) params.set('region', region)
      const res = await fetch(`/api/news?${params}`)
      const data = await res.json()
      if (resetPage) {
        setNews(data.news || [])
      } else {
        setNews(prev => [...prev, ...(data.news || [])])
      }
      setUsedMock(data.usedMock || false)
      setHasMore(data.hasMore || false)
    } catch {
      setHasMore(false)
    } finally {
      setLoadingNews(false)
      setLoadingMore(false)
    }
  }, [page, refreshKey])

  useEffect(() => {
    loadNews(searchQuery, selectedRegion, true)
  }, [searchQuery, selectedRegion, refreshKey])

  const handleLoadMore = async () => {
    const nextPage = page + 1
    setPage(nextPage)
    setLoadingMore(true)
    const params = new URLSearchParams({ page: String(nextPage) })
    if (searchQuery) params.set('q', searchQuery)
    if (selectedRegion) params.set('region', selectedRegion)
    try {
      const res = await fetch(`/api/news?${params}`)
      const data = await res.json()
      setNews(prev => [...prev, ...(data.news || [])])
      setHasMore(data.hasMore || false)
    } catch {
      setHasMore(false)
    } finally {
      setLoadingMore(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearchQuery(searchInput.trim())
  }

  const clearSearch = () => {
    setSearchInput('')
    setSearchQuery('')
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header user={user} />

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center shadow-sm">
            <Newspaper className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{cityName} 소식</h1>
            <p className="text-xs text-muted-foreground">뉴스 · 행사 · 날씨 한눈에</p>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 p-1 bg-muted/50 rounded-xl w-fit mb-6">
          {(['news', 'weather', 'calendar'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                activeTab === tab ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab === 'news' && <><Newspaper className="w-3.5 h-3.5" />지역 뉴스</>}
              {tab === 'calendar' && <><CalendarDays className="w-3.5 h-3.5" />관광 달력</>}
              {tab === 'weather' && <><CloudSun className="w-3.5 h-3.5" />날씨</>}
            </button>
          ))}
        </div>

        {/* 뉴스 탭 */}
        {activeTab === 'news' && (
          <div>
            {/* 세부 지역 선택 — 광장 coverage 기반 (춘천/홍천/화천/양구/인제) */}
            {coverage.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-3 scrollbar-thin">
                <button
                  onClick={() => setSelectedRegion('')}
                  className={cn(
                    'flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors',
                    selectedRegion === ''
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-foreground border-border hover:border-primary/50',
                  )}
                >
                  전체
                </button>
                {coverage.map((region) => (
                  <button
                    key={region}
                    onClick={() => setSelectedRegion(region)}
                    className={cn(
                      'flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors',
                      selectedRegion === region
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card text-foreground border-border hover:border-primary/50',
                    )}
                  >
                    {region}
                  </button>
                ))}
              </div>
            )}

            {/* 검색 바 */}
            <form onSubmit={handleSearch} className="flex gap-2 mb-5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="뉴스 검색 (예: 축제, 교통, 부동산)"
                  className="w-full pl-9 pr-9 py-2.5 text-sm rounded-xl border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                />
                {searchInput && (
                  <button type="button" onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                className="px-4 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-xl hover:bg-primary/90 transition-colors"
              >
                검색
              </button>
              <button
                type="button"
                onClick={() => setRefreshKey(k => k + 1)}
                className="px-3 py-2.5 border border-border rounded-xl hover:bg-muted transition-colors"
                title="새로고침"
              >
                <RefreshCw className={cn('w-4 h-4 text-muted-foreground', loadingNews && 'animate-spin')} />
              </button>
            </form>

            {/* 검색 결과 상태 */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  {searchQuery
                    ? `"${searchQuery}" 검색 결과`
                    : selectedRegion
                      ? `${selectedRegion} 지역 뉴스`
                      : `${cityName} 전체 지역 뉴스`}
                </span>
                {usedMock && (
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">샘플 데이터</span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{news.length}건</span>
            </div>

            {/* 뉴스 그리드 */}
            {loadingNews ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="rounded-xl border border-border bg-muted/30 animate-pulse overflow-hidden">
                    <div className="h-48 bg-muted" />
                    <div className="p-3.5 space-y-2">
                      <div className="h-3.5 bg-muted rounded w-full" />
                      <div className="h-3.5 bg-muted rounded w-3/4" />
                      <div className="h-2.5 bg-muted rounded w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : news.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Search className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm">검색 결과가 없습니다</p>
                {searchQuery && (
                  <button onClick={clearSearch} className="mt-3 text-xs text-primary hover:underline">
                    검색어 초기화
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {/* 썸네일 있는 기사만 — null 카드 빈 자리 방지 */}
                  {news.filter((n) => !!n.thumbnail).map((item) => <NewsCard key={item.id} item={item} />)}
                </div>

                {/* 더 보기 버튼 */}
                {hasMore && (
                  <div className="flex justify-center mt-8">
                    <button
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 text-sm font-medium text-muted-foreground hover:text-primary transition-all disabled:opacity-50"
                    >
                      {loadingMore ? <><Loader2 className="w-4 h-4 animate-spin" />불러오는 중...</> : '뉴스 더 보기'}
                    </button>
                  </div>
                )}

                {!hasMore && news.length > 0 && (
                  <p className="text-center text-xs text-muted-foreground mt-8">모든 뉴스를 불러왔습니다</p>
                )}
              </>
            )}
          </div>
        )}

        {/* 달력 탭 */}
        {activeTab === 'calendar' && (
          <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 max-w-lg mx-auto">
            {loadingEvents ? (
              <div className="flex justify-center py-16">
                <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : (
              <MiniCalendar events={events} />
            )}
          </div>
        )}

        {/* 날씨 탭 */}
        {activeTab === 'weather' && (
          <div className="max-w-4xl mx-auto">
            {/* 지역 선택 — 뉴스 탭과 동일하게 */}
            {coverage.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-3 scrollbar-thin">
                <button
                  onClick={() => setSelectedRegion('')}
                  className={cn(
                    'flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors',
                    selectedRegion === ''
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-foreground border-border hover:border-primary/50',
                  )}
                >
                  전체
                </button>
                {coverage.map((region) => (
                  <button
                    key={region}
                    onClick={() => setSelectedRegion(region)}
                    className={cn(
                      'flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors',
                      selectedRegion === region
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card text-foreground border-border hover:border-primary/50',
                    )}
                  >
                    {region}
                  </button>
                ))}
              </div>
            )}
            <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
              <WeatherPanel
                data={weather}
                loading={loadingWeather}
                onRefresh={() => {
                  setWeatherLoaded(false)
                  setWeatherKey((k) => k + 1)
                }}
              />
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
