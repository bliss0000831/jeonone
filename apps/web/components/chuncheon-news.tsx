'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { useSiteBranding } from '@/components/site-branding-client'
import { useLabel } from '@/components/site-labels-client'
import { EditableIcon } from '@/components/editable-icon'
import { plazaCityName } from '@/lib/plaza/city-name'
import {
  Newspaper, CalendarDays, ChevronLeft, ChevronRight,
  ExternalLink, Clock, MapPin, RefreshCw, CloudSun, Droplets, Wind
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { NewsItem } from '@/app/api/news/route'
import { getHoliday } from '@/lib/constants/korean-holidays'

// ─── 타입 ────────────────────────────────────────────────────────────────────
interface ChuncheonEvent {
  id: string
  title: string
  description: string | null
  location: string | null
  event_date: string
  end_date: string | null
  category: string
  color: string
  link_url: string | null
}

const CATEGORY_LABELS: Record<string, string> = {
  festival: '축제', event: '행사', culture: '문화', sports: '스포츠',
  exhibition: '전시', general: '일반',
}

// ─── 뉴스 카드 (카드형) ──────────────────────────────────────────────────────
function NewsCard({ item, onHide }: { item: NewsItem; onHide?: () => void }) {
  // 썸네일 로드 실패 시 부모에게 알려서 grid 에서 빠지게 함 (빈칸 X)
  const [imgError, setImgError] = useState(false)
  if (imgError || !item.thumbnail) return null
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
      {/* 썸네일 — 로드 실패하면 부모로 hidden id 전파 */}
      <img
        src={item.thumbnail}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="w-full h-48 object-cover bg-muted flex-shrink-0"
        onError={() => {
          setImgError(true)
          onHide?.()
        }}
      />

      {/* 텍스트 영역 */}
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

// ─── 뉴스 그리드 — 이미지 로드 실패한 카드를 grid 에서 제거 (빈칸 없이) ────────
function NewsGrid({ news, preview }: { news: NewsItem[]; preview: boolean }) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const withThumb = news.filter((n) => !!n.thumbnail && !hiddenIds.has(n.id))
  const visible = preview ? withThumb.slice(0, 4) : withThumb

  if (visible.length === 0) {
    return <div className="text-center py-10 text-muted-foreground text-sm">표시할 뉴스가 없습니다</div>
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
      {visible.map((item, idx) => (
        <div key={item.id} className={cn('flex flex-col', preview && idx >= 2 ? 'hidden lg:flex' : '')}>
          <NewsCard
            item={item}
            onHide={() =>
              setHiddenIds((prev) => {
                const next = new Set(prev)
                next.add(item.id)
                return next
              })
            }
          />
        </div>
      ))}
    </div>
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

  // 날짜 → 이벤트 매핑 (기간 이벤트 포함)
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
    setTooltip({
      x: rect.left - calRect.left,
      y: rect.bottom - calRect.top + 4,
      events: evs,
    })
  }

  const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
  const DAYS = ['일', '월', '화', '수', '목', '금', '토']
  const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate())

  const selectedEventsForList = selectedDate ? (eventMap.get(selectedDate) || []) : []

  return (
    <div className="select-none">
      {/* 월 네비게이션 */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => { setCurrent(new Date(year, month - 1, 1)); setSelectedDate(null); setTooltip(null) }}
          className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold tracking-tight">
          {year}년 {MONTHS[month]}
        </span>
        <button
          onClick={() => { setCurrent(new Date(year, month + 1, 1)); setSelectedDate(null); setTooltip(null) }}
          className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d, i) => (
          <div
            key={d}
            className={cn(
              'text-center text-[10px] font-medium py-1',
              i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-muted-foreground',
            )}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div ref={calRef} className="relative grid grid-cols-7 gap-y-0.5">
        {/* 빈 칸 */}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`e-${i}`} />
        ))}

        {/* 날짜 */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const key = toKey(year, month, day)
          const dayEvents = eventMap.get(key) || []
          const isToday = key === todayKey
          const isSelected = key === selectedDate
          const dayOfWeek = (firstDay + i) % 7
          const holiday = getHoliday(key)
          const isRed = dayOfWeek === 0 || !!holiday

          return (
            <button
              key={key}
              onClick={(e) => handleDayClick(key, e)}
              className={cn(
                'relative flex flex-col items-center justify-start py-1 rounded-lg transition-all group',
                isSelected ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted/70',
              )}
              title={holiday?.name}
            >
              <span
                className={cn(
                  'w-6 h-6 flex items-center justify-center rounded-full text-xs leading-none',
                  isToday && 'bg-primary text-white font-bold',
                  !isToday && isRed && 'text-red-500',
                  !isToday && !isRed && dayOfWeek === 6 && 'text-blue-500',
                  !isToday && !isRed && dayOfWeek !== 6 && 'text-foreground',
                )}
              >
                {day}
              </span>
              {holiday && (
                <span className="text-[8px] text-red-500 font-medium truncate max-w-full px-0.5 leading-tight mt-0.5">
                  {holiday.name.replace(/ \(.*\)/, '').slice(0, 4)}
                </span>
              )}

              {/* 이벤트 도트 */}
              {dayEvents.length > 0 && (
                <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center px-0.5">
                  {dayEvents.slice(0, 3).map((ev, idx) => (
                    <span
                      key={idx}
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: ev.color || '#10b981' }}
                    />
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-[8px] text-muted-foreground">+{dayEvents.length - 3}</span>
                  )}
                </div>
              )}
            </button>
          )
        })}

        {/* 팝업 툴팁 */}
        {tooltip && (
          <div
            className="absolute z-20 w-56 bg-card border border-border rounded-xl shadow-xl p-3 animate-in fade-in slide-in-from-top-1 duration-150"
            style={{ left: Math.min(tooltip.x, 220), top: tooltip.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs text-muted-foreground mb-2 font-medium">
              {selectedDate?.replace(/-/g, '.')} 행사
            </p>
            <div className="space-y-2">
              {tooltip.events.map((ev) => (
                <div key={ev.id} className="flex items-start gap-2">
                  <span
                    className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
                    style={{ backgroundColor: ev.color }}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-medium line-clamp-1">
                      {ev.link_url ? (
                        <a href={ev.link_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {ev.title}
                        </a>
                      ) : ev.title}
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
            <button
              className="mt-2 text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() => { setTooltip(null); setSelectedDate(null) }}
            >
              닫기
            </button>
          </div>
        )}
      </div>

      {/* 선택된 날짜 이벤트 목록 (달력 하단) */}
      {selectedEventsForList.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">{selectedDate?.replace(/-/g, '.')} 일정</p>
          {selectedEventsForList.map((ev) => (
            <div key={ev.id} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-muted/50">
              <span
                className="w-2.5 h-2.5 rounded-full mt-0.5 flex-shrink-0"
                style={{ backgroundColor: ev.color }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">{ev.title}</p>
                {ev.description && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{ev.description}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  {ev.location && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <MapPin className="w-2.5 h-2.5" />{ev.location}
                    </span>
                  )}
                  {ev.end_date && ev.end_date !== ev.event_date && (
                    <span className="text-[10px] text-muted-foreground">
                      ~ {ev.end_date.replace(/-/g, '.')}
                    </span>
                  )}
                </div>
              </div>
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
                style={{ backgroundColor: `${ev.color}20`, color: ev.color }}
              >
                {CATEGORY_LABELS[ev.category] || ev.category}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 이번 달 주요 행사 미리보기 */}
      {selectedEventsForList.length === 0 && (
        <div className="mt-5 space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground mb-2">이달의 주요 행사</p>
          {(() => {
            const thisMonth = `${year}-${String(month + 1).padStart(2, '0')}`
            const upcoming = events
              .filter((ev) => ev.event_date.startsWith(thisMonth))
              .sort((a, b) => a.event_date.localeCompare(b.event_date))
              .slice(0, 5)
            if (!upcoming.length) return (
              <p className="text-xs text-muted-foreground text-center py-3">이번 달 등록된 행사가 없습니다</p>
            )
            return upcoming.map((ev) => (
              <div key={ev.id} className="flex items-center gap-2.5 py-1.5">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: ev.color }}
                />
                <span className="text-[11px] text-muted-foreground w-10 flex-shrink-0">
                  {ev.event_date.split('-')[2]}일
                </span>
                <span className="text-xs font-medium truncate">{ev.title}</span>
              </div>
            ))
          })()}
        </div>
      )}
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
  current: { temp: number | null; humidity: number | null; windSpeed: number | null; rainfall: number | null; updatedAt: string } | null
  forecast: ForecastDay[]
  hourly?: HourlyItem[]
}

function WeatherPanel({ data, loading, onRefresh }: { data: WeatherData | null; loading: boolean; onRefresh: () => void }) {
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
        <button onClick={onRefresh} className="block mx-auto mt-3 text-xs text-primary underline">
          다시 시도
        </button>
      </div>
    )
  }

  const today = data.forecast[0]

  return (
    <div>
      {/* 헤더: 위치 + 새로고침 */}
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
        {/* 상세 */}
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
          <div className="overflow-x-auto -mx-1 px-1 mb-5 scrollbar-hide">
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
              isToday(d.date) ? 'bg-primary/5 border-primary/30' : 'bg-muted/40 border-transparent',
            )}
          >
            <p className={cn(
              'text-[10px] font-medium',
              isToday(d.date) ? 'text-primary' : 'text-muted-foreground',
            )}>
              {isToday(d.date) ? '오늘' : dayLabel(d.date)}
            </p>
            <p className="text-[10px] text-muted-foreground mb-1">{monthDay(d.date)}</p>
            <div className="text-2xl leading-tight mb-1">{d.icon}</div>
            <p className="text-[10px] text-muted-foreground line-clamp-1">{d.text}</p>
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

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
type TabKey = 'news' | 'calendar' | 'weather'

export function ChuncheonNews({ preview = false }: { preview?: boolean }) {
  const { name: plazaName } = useSiteBranding()
  const cityName = plazaCityName(plazaName)
  // 슈퍼관리자가 편집 가능한 헤더 (토큰 {{plaza_city}} 가 자동 치환됨)
  const widgetTitle = useLabel("home.widget.news.title", `${cityName} 소식`)
  const widgetSubtitle = useLabel("home.widget.news.subtitle", "뉴스 · 행사 · 날씨 한눈에")
  const [activeTab, setActiveTab] = useState<TabKey>('news')
  const [news, setNews] = useState<NewsItem[]>([])
  const [events, setEvents] = useState<ChuncheonEvent[]>([])
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loadingNews, setLoadingNews] = useState(true)
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [loadingWeather, setLoadingWeather] = useState(false)
  const [weatherLoaded, setWeatherLoaded] = useState(false)
  const [usedMock, setUsedMock] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [weatherKey, setWeatherKey] = useState(0)
  // 광장 내 세부 지역 (춘천/홍천/화천/양구/인제) — plazas.coverage 에서 로드
  const [coverage, setCoverage] = useState<string[]>([])
  const [selectedRegion, setSelectedRegion] = useState<string>('')

  // 본인 sub_region + 광장 coverage 로드 (기본 지역 + 토글용)
  useEffect(() => {
    const supabase = createClient()
    const plaza = getCurrentPlazaClient()
    if (plaza) {
      supabase
        .from('plazas')
        .select('coverage')
        .eq('id', plaza)
        .maybeSingle()
        .then(({ data }: any) => {
          const cov = (data as any)?.coverage
          if (Array.isArray(cov)) setCoverage(cov)
        })
    }
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('sub_region')
          .eq('id', user.id)
          .maybeSingle()
        const region = (profile as any)?.sub_region
        if (region && typeof region === 'string') setSelectedRegion(region)
      }
    })()
  }, [])

  // 날씨 — 지역 변경 시 그 지역 격자로 재조회
  useEffect(() => {
    setLoadingWeather(true)
    const params = new URLSearchParams()
    if (selectedRegion) params.set('region', selectedRegion)
    const wPlaza = getCurrentPlazaClient()
    if (wPlaza) params.set('plaza', wPlaza)
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

  // 뉴스 — 지역 변경 시 해당 지역 뉴스 재조회
  useEffect(() => {
    setLoadingNews(true)
    const params = new URLSearchParams({ _: String(refreshKey) })
    if (selectedRegion) params.set('region', selectedRegion)
    const nPlaza = getCurrentPlazaClient()
    if (nPlaza) params.set('plaza', nPlaza)
    fetch(`/api/news?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setNews(data.news || [])
        setUsedMock(data.usedMock || false)
      })
      .catch(() => {})
      .finally(() => setLoadingNews(false))
  }, [refreshKey, selectedRegion])

  // 이벤트 로드 (광장별 격리)
  useEffect(() => {
    const supabase = createClient()
    setLoadingEvents(true)
    const plaza = getCurrentPlazaClient()
    let q: any = supabase
      .from('chuncheon_events')
      .select('*')
      .eq('is_active', true)
      .order('event_date')
    if (plaza) q = q.eq('plaza_id', plaza)
    q.then(({ data }: any) => {
      setEvents(data || [])
    }).finally(() => setLoadingEvents(false))
  }, [])

  return (
    <section className="max-w-7xl mx-auto px-4 py-6">
      {/* 섹션 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5">
          <EditableIcon
            iconKey="home.widget.news.icon"
            fallback={Newspaper}
            tileClassName="w-8 sm:w-10 h-8 sm:h-10 rounded-xl bg-gradient-to-br from-primary to-emerald-600 shadow-sm"
            iconClassName="w-4 sm:w-5 h-4 sm:h-5 text-white"
            imageClassName="w-12 sm:w-14 h-12 sm:h-14"
          />
          <div>
            <h2 className="text-sm sm:text-lg font-bold text-foreground">{widgetTitle}</h2>
            <p className="text-xs text-muted-foreground">{widgetSubtitle}</p>
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-xl w-fit mb-5">
        {(['news', 'weather', 'calendar'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200',
              activeTab === tab
                ? 'bg-card shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab === 'news' && <><Newspaper className="w-3.5 h-3.5" />지역 뉴스</>}
            {tab === 'calendar' && <><CalendarDays className="w-3.5 h-3.5" />관광 달력</>}
            {tab === 'weather' && <><CloudSun className="w-3.5 h-3.5" />날씨</>}
          </button>
        ))}
      </div>

      {/* 콘텐츠 패널 */}
      <div className="relative overflow-hidden">
        {/* 뉴스 탭 */}
        <div
          className={cn(
            'transition-all duration-300',
            activeTab === 'news' ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 absolute inset-0 pointer-events-none',
          )}
        >
          <div className="bg-card border border-border rounded-2xl p-4 sm:p-5">
            {/* 세부 지역 토글 — 모바일에서 좌우 스크롤 가능 */}
            {coverage.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 scrollbar-thin -mx-1 px-1">
                <button
                  onClick={() => setSelectedRegion('')}
                  className={cn(
                    'flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors',
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
                      'flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors',
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

            {/* 뉴스 헤더 */}
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  {selectedRegion ? `${selectedRegion} 뉴스` : `${cityName} 지역 뉴스`}
                </span>
                {usedMock && (
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                    샘플 데이터
                  </span>
                )}
              </div>
              <button
                onClick={() => setRefreshKey((k) => k + 1)}
                className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
                title="새로고침"
              >
                <RefreshCw className={cn('w-3.5 h-3.5 text-muted-foreground', loadingNews && 'animate-spin')} />
              </button>
            </div>

            {/* 뉴스 카드 그리드 */}
            {loadingNews ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                {Array.from({ length: preview ? 4 : 8 }).map((_, i) => (
                  <div key={i} className={cn(
                    'rounded-xl border border-border bg-muted/30 animate-pulse overflow-hidden',
                    preview && i >= 2 ? 'hidden lg:block' : ''
                  )}>
                    <div className="h-48 bg-muted" />
                    <div className="p-3.5 space-y-2">
                      <div className="h-3.5 bg-muted rounded w-full" />
                      <div className="h-3.5 bg-muted rounded w-3/4" />
                      <div className="h-2.5 bg-muted rounded w-1/3 mt-1" />
                    </div>
                  </div>
                ))}
              </div>
            ) : news.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">뉴스를 불러올 수 없습니다</div>
            ) : (
              <>
                <NewsGrid news={news} preview={preview} />
                {preview && (
                  <div className="mt-4 flex justify-center">
                    <Link
                      href="/chuncheon"
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 text-sm font-medium text-muted-foreground hover:text-primary transition-all"
                    >
                      전체 {cityName} 소식 보기
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* 달력 탭 */}
        <div
          className={cn(
            'transition-all duration-300',
            activeTab === 'calendar' ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 absolute inset-0 pointer-events-none',
          )}
        >
          <div className="bg-card border border-border rounded-2xl p-4 sm:p-5">
            {loadingEvents ? (
              <div className="flex justify-center py-16">
                <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : (
              <MiniCalendar events={events} />
            )}

            {/* 범례 */}
            <div className="mt-5 pt-4 border-t border-border/50">
              <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">카테고리</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries({
                  festival: '#6366f1', event: '#3b82f6', culture: '#8b5cf6',
                  sports: '#ef4444', exhibition: '#06b6d4', general: '#10b981',
                }).map(([key, color]) => (
                  <span key={key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    {CATEGORY_LABELS[key]}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 날씨 탭 */}
        <div
          className={cn(
            'transition-all duration-300',
            activeTab === 'weather' ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 absolute inset-0 pointer-events-none',
          )}
        >
          {/* 세부 지역 토글 — 뉴스와 동일 */}
          {coverage.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 scrollbar-thin -mx-1 px-1">
              <button
                onClick={() => setSelectedRegion('')}
                className={cn(
                  'flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors',
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
                    'flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors',
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
          <div className="bg-card border border-border rounded-2xl p-4 sm:p-5">
            <WeatherPanel
              data={weather}
              loading={loadingWeather}
              onRefresh={() => { setWeatherLoaded(false); setWeatherKey((k) => k + 1) }}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
