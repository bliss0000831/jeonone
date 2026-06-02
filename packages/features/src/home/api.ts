/**
 * Home (홈 / 광장 메인 피드) 도메인 — RN + 웹 공유.
 *
 * 광장 web /chuncheon (또는 plaza-id 별 메인) 의 데이터 소스:
 *   - GET /api/news?q=&region=&page= → { news: NewsItem[]; usedMock; hasMore }
 *   - GET /api/weather?region= → WeatherData (ok=true 가 들어 있는 그대로)
 *   - chuncheon_events 테이블 (is_active=true) → ChuncheonEvent[]
 *   - plazas.coverage[] → 세부 지역 칩
 */

import type { SupabaseClient } from "@supabase/supabase-js"

// ── News ────────────────────────────────────────────
export interface NewsItem {
  id: string
  title: string
  description: string
  url: string
  thumbnail: string | null
  press: string
  publishedAt: string
  category: string
}

export interface NewsResult {
  news: NewsItem[]
  usedMock: boolean
  hasMore: boolean
}

interface FetchAdapter {
  (input: string, init?: RequestInit): Promise<Response>
}

export async function listNews(
  fetcher: FetchAdapter,
  args: { q?: string; region?: string; page?: number; refreshKey?: number },
): Promise<NewsResult> {
  const params = new URLSearchParams()
  params.set("page", String(args.page ?? 1))
  if (args.q) params.set("q", args.q)
  if (args.region) params.set("region", args.region)
  if (args.refreshKey) params.set("_", String(args.refreshKey))
  try {
    const r = await fetcher(`/api/news?${params}`)
    if (!r.ok) return { news: [], usedMock: false, hasMore: false }
    const data = await r.json()
    return {
      news: (data.news as NewsItem[]) ?? [],
      usedMock: !!data.usedMock,
      hasMore: !!data.hasMore,
    }
  } catch {
    return { news: [], usedMock: false, hasMore: false }
  }
}

// ── Weather ──────────────────────────────────────────
export interface ForecastDay {
  date: string
  min: number | null
  max: number | null
  rainProb: number | null
  sky: string
  pty: string
  text: string
  icon: string
}

export interface HourlyItem {
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

export interface WeatherData {
  ok?: boolean
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

export async function getWeather(
  fetcher: FetchAdapter,
  args: { region?: string; refreshKey?: number },
): Promise<WeatherData | null> {
  const params = new URLSearchParams()
  if (args.region) params.set("region", args.region)
  if (args.refreshKey) params.set("_", String(args.refreshKey))
  const qs = params.toString()
  try {
    const r = await fetcher(`/api/weather${qs ? `?${qs}` : ""}`)
    if (!r.ok) return null
    const data = await r.json()
    if (!data?.ok) return null
    return data as WeatherData
  } catch {
    return null
  }
}

// ── Events (chuncheon_events) ────────────────────────
export interface ChuncheonEvent {
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

export async function listChuncheonEvents(
  supabase: SupabaseClient,
  plaza: string | null,
): Promise<ChuncheonEvent[]> {
  let q = supabase
    .from("chuncheon_events")
    .select("id, title, description, location, event_date, end_date, category, color, link_url")
    .eq("is_active", true)
    .order("event_date")
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data } = await q
  return (data ?? []) as ChuncheonEvent[]
}

// ── Plaza coverage (sub-region chips) ────────────────
export async function getPlazaCoverage(
  supabase: SupabaseClient,
  plaza: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("plazas")
    .select("coverage")
    .eq("id", plaza)
    .maybeSingle()
  const cov = (data as any)?.coverage
  return Array.isArray(cov) ? (cov as string[]) : []
}

// ── 라벨 ──────────────────────────────────────────────
export const EVENT_CATEGORY_LABELS: Record<string, string> = {
  festival: "축제",
  event: "행사",
  culture: "문화",
  sports: "스포츠",
  exhibition: "전시",
  general: "일반",
  market: "시장",
  nature: "자연",
  community: "지역사회",
  economy: "경제",
  social: "사회",
  education: "교육",
}
