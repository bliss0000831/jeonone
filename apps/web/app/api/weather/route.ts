/**
 * 기상청 단기예보 + 중기예보 → 춘천 10일치 요약
 *   - 현재 실황(초단기실황): /api/weather 응답의 current
 *   - 오늘~모레(3일): 단기예보 최저/최고/대표SKY,PTY
 *   - D+3~D+7:        중기예보 최저/최고/오전오후날씨
 *
 * 춘천 격자좌표 nx=73, ny=134
 * 중기예보 지역코드: 기온=11D10301(춘천), 날씨=11D10000(강원영서)
 *
 * 환경변수: DATA_GO_KR_KEY
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentPlaza } from '@/lib/plaza/server'
import { lookupSubRegion } from '@/lib/constants/sub-region-coords'

// ── 10분 캐시 + 30분 stale-while-revalidate
//    기상청 데이터는 어차피 10분 단위 갱신 → 매번 외부 4개 API 호출할 이유 없음
//    첫 방문자 1명만 느리고, 그 뒤 10분 동안은 모두 엣지 캐시에서 즉시 응답
export const runtime = 'nodejs'
// 광장별 좌표가 다르므로 정적 캐시 X (각 광장이 자기 좌표로 호출)
export const dynamic = 'force-dynamic'

// 기본값 — 춘천 (광장 컨텍스트 없을 때 폴백)
const DEFAULT_NX = 73, DEFAULT_NY = 134
const DEFAULT_REG_TEMP = '11D10301'   // 춘천
const DEFAULT_REG_LAND = '11D10000'   // 강원영서

// ── 위경도 → KMA 격자(nx, ny) 변환 (Lambert Conformal Conic) ─────────
function latLngToGrid(lat: number, lng: number): { nx: number; ny: number } {
  const RE = 6371.00877, GRID = 5.0
  const SLAT1 = 30.0, SLAT2 = 60.0
  const OLON = 126.0, OLAT = 38.0
  const XO = 43, YO = 136
  const DEGRAD = Math.PI / 180.0
  const re = RE / GRID
  const slat1 = SLAT1 * DEGRAD
  const slat2 = SLAT2 * DEGRAD
  const olon = OLON * DEGRAD
  const olat = OLAT * DEGRAD
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5)
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn)
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5)
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5)
  ro = (re * sf) / Math.pow(ro, sn)
  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5)
  ra = (re * sf) / Math.pow(ra, sn)
  let theta = lng * DEGRAD - olon
  if (theta > Math.PI) theta -= 2.0 * Math.PI
  if (theta < -Math.PI) theta += 2.0 * Math.PI
  theta *= sn
  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  }
}

// 권역별 중기예보 지역코드 매핑 (대표값 — 정밀하지 않음, KMA 일부 시·도 단위)
function regionCodes(parentRegion: string | null): { temp: string; land: string } {
  switch (parentRegion) {
    case '서울권':
      return { temp: '11B10101', land: '11B00000' } // 서울/인천/경기 육상예보
    case '경기권':
      return { temp: '11B20601', land: '11B00000' }
    case '강원권':
      return { temp: '11D10301', land: '11D10000' } // 춘천/강원영서 (강릉광장도 같은 지역구)
    case '충청권':
      return { temp: '11C20101', land: '11C20000' } // 대전/충남 육상
    case '전라권':
      return { temp: '11F20501', land: '11F20000' } // 광주/전남
    case '경상권':
      return { temp: '11H20101', land: '11H20000' } // 부산/경남
    case '제주권':
      return { temp: '11G00201', land: '11G00000' } // 제주
    default:
      return { temp: DEFAULT_REG_TEMP, land: DEFAULT_REG_LAND }
  }
}

const SHORT_BASE = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0'
const MID_BASE = 'https://apis.data.go.kr/1360000/MidFcstInfoService'

// ─── 시간/날짜 유틸 (KST 기준) ───────────────────────────────────
function kstNow() {
  const now = new Date()
  return new Date(now.getTime() + (9 * 60 - now.getTimezoneOffset()) * 60000)
}
function pad(n: number) { return String(n).padStart(2, '0') }
function fmtDate(d: Date) { return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` }
function fmtISO(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function addDays(d: Date, n: number) { const c = new Date(d); c.setDate(c.getDate() + n); return c }

// 단기예보 발표기준시: 02,05,08,11,14,17,20,23시 (+10분 여유)
function getVilageBase() {
  const now = kstNow()
  const hh = now.getHours()
  const mm = now.getMinutes()
  const slots = [23, 20, 17, 14, 11, 8, 5, 2]
  let base_date = fmtDate(now)
  let base_time = ''
  for (const s of slots) {
    if (hh > s || (hh === s && mm >= 15)) { base_time = `${pad(s)}00`; break }
  }
  if (!base_time) {
    // 새벽 00~02:14: 어제 23시 발표 사용
    const y = addDays(now, -1)
    base_date = fmtDate(y)
    base_time = '2300'
  }
  return { base_date, base_time }
}

// 초단기실황 발표기준시: 매시 40분 이후 해당 시각
function getUltraNcstBase() {
  const now = kstNow()
  const hh = now.getHours()
  const mm = now.getMinutes()
  let targetHour = hh
  let dateRef = new Date(now)
  if (mm < 40) {
    targetHour -= 1
    if (targetHour < 0) {
      targetHour = 23
      dateRef = addDays(now, -1)
    }
  }
  return { base_date: fmtDate(dateRef), base_time: `${pad(targetHour)}00` }
}

// 중기예보 발표기준시: 06, 18시 (tmFc)
function getMidTmFc() {
  const now = kstNow()
  const hh = now.getHours()
  let use: Date; let time: string
  if (hh >= 18) { use = now; time = '1800' }
  else if (hh >= 6) { use = now; time = '0600' }
  else { use = addDays(now, -1); time = '1800' }
  return `${fmtDate(use)}${time}`
}

// ─── 하늘/강수 코드 → 한글 ───────────────────────────────────────
const SKY_LABEL: Record<string, string> = { '1': '맑음', '3': '구름많음', '4': '흐림' }
const PTY_LABEL: Record<string, string> = {
  '0': '', '1': '비', '2': '비/눈', '3': '눈', '5': '빗방울', '6': '빗방울눈날림', '7': '눈날림',
}
function skyPtyToText(sky: string, pty: string): string {
  const p = PTY_LABEL[pty] || ''
  if (p) return p
  return SKY_LABEL[sky] || '-'
}
function skyPtyToIcon(sky: string, pty: string): string {
  if (pty === '1' || pty === '5') return '🌧️'
  if (pty === '2' || pty === '6') return '🌨️'
  if (pty === '3' || pty === '7') return '❄️'
  if (sky === '1') return '☀️'
  if (sky === '3') return '⛅'
  if (sky === '4') return '☁️'
  return '🌤️'
}

// 중기 날씨 문구(예: "맑음", "구름많음", "흐리고 비") → 아이콘
function midWfToIcon(wf: string) {
  if (!wf) return '🌤️'
  if (/눈/.test(wf)) return '❄️'
  if (/비/.test(wf)) return '🌧️'
  if (/흐림/.test(wf)) return '☁️'
  if (/구름/.test(wf)) return '⛅'
  if (/맑음/.test(wf)) return '☀️'
  return '🌤️'
}

async function fetchJson(url: string) {
  // next fetch 캐시 10분 — base_date/time 이 같으면 외부 호출 스킵
  const res = await fetch(url, { next: { revalidate: 600 } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`parse fail: ${text.slice(0, 200)}`)
  }
}

// ─── 단기실황: 현재 기온/하늘 ────────────────────────────────────
async function fetchCurrent(key: string, nx: number, ny: number) {
  const { base_date, base_time } = getUltraNcstBase()
  const qs = new URLSearchParams({
    serviceKey: key, numOfRows: '10', pageNo: '1', dataType: 'JSON',
    base_date, base_time, nx: String(nx), ny: String(ny),
  })
  const json = await fetchJson(`${SHORT_BASE}/getUltraSrtNcst?${qs}`)
  const items: any[] = json?.response?.body?.items?.item || []
  const map: Record<string, string> = {}
  items.forEach((it) => { map[it.category] = String(it.obsrValue) })
  return {
    temp: map.T1H ? Number(map.T1H) : null,        // 기온
    humidity: map.REH ? Number(map.REH) : null,    // 습도
    windSpeed: map.WSD ? Number(map.WSD) : null,   // 풍속
    rainfall: map.RN1 ? Number(map.RN1) : null,    // 1시간 강수
    updatedAt: `${base_date} ${base_time}`,
  }
}

// ─── 단기예보: 오늘~모레 (일별 요약 + 시간별 상세) ─────────────────
async function fetchShortTerm(key: string, nx: number, ny: number): Promise<{
  daily: any[]
  hourly: any[]
}> {
  const { base_date, base_time } = getVilageBase()
  const qs = new URLSearchParams({
    serviceKey: key, numOfRows: '1000', pageNo: '1', dataType: 'JSON',
    base_date, base_time, nx: String(nx), ny: String(ny),
  })
  const json = await fetchJson(`${SHORT_BASE}/getVilageFcst?${qs}`)
  const items: any[] = json?.response?.body?.items?.item || []

  // ── 1) 일별 집계 ─────────────────────────────
  const byDate: Record<string, { tmn?: number; tmx?: number; skyCounts: Record<string, number>; ptyCounts: Record<string, number>; popMax: number }> = {}

  // ── 2) 시간별 집계 (fcstDate + fcstTime 조합) ──
  //    category: TMP(기온), SKY(하늘), PTY(강수형태), POP(강수확률)
  const byHour: Record<string, { temp?: number; sky?: string; pty?: string; pop?: number }> = {}

  for (const it of items) {
    const d = it.fcstDate
    const t = it.fcstTime
    if (!byDate[d]) byDate[d] = { skyCounts: {}, ptyCounts: {}, popMax: 0 }
    const v = String(it.fcstValue)

    // 일별
    if (it.category === 'TMN') byDate[d].tmn = Number(v)
    if (it.category === 'TMX') byDate[d].tmx = Number(v)
    if (it.category === 'SKY') byDate[d].skyCounts[v] = (byDate[d].skyCounts[v] || 0) + 1
    if (it.category === 'PTY') byDate[d].ptyCounts[v] = (byDate[d].ptyCounts[v] || 0) + 1
    if (it.category === 'POP') byDate[d].popMax = Math.max(byDate[d].popMax, Number(v))

    // 시간별
    const hKey = `${d}_${t}`
    if (!byHour[hKey]) byHour[hKey] = {}
    if (it.category === 'TMP') byHour[hKey].temp = Number(v)
    if (it.category === 'SKY') byHour[hKey].sky = v
    if (it.category === 'PTY') byHour[hKey].pty = v
    if (it.category === 'POP') byHour[hKey].pop = Number(v)
  }

  const mode = (m: Record<string, number>) => {
    let best = '', max = -1
    Object.entries(m).forEach(([k, v]) => { if (v > max) { best = k; max = v } })
    return best
  }

  const daily = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => {
      const sky = mode(v.skyCounts) || '1'
      let pty = ''
      const nonZero = Object.entries(v.ptyCounts).filter(([k]) => k !== '0')
      if (nonZero.length > 0) {
        nonZero.sort((a, b) => b[1] - a[1])
        pty = nonZero[0][0]
      } else pty = '0'
      return {
        date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
        min: v.tmn ?? null,
        max: v.tmx ?? null,
        rainProb: v.popMax,
        sky, pty,
        text: skyPtyToText(sky, pty),
        icon: skyPtyToIcon(sky, pty),
      }
    })

  // 현재 시각 이후만 필터링, 최대 24시간치
  const now = kstNow()
  const nowStamp = `${fmtDate(now)}${pad(now.getHours())}00`
  const hourly = Object.entries(byHour)
    .map(([k, v]) => {
      const [d, t] = k.split('_')
      return {
        stamp: `${d}${t}`,
        date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
        hour: Number(t.slice(0, 2)),
        temp: v.temp ?? null,
        sky: v.sky || '1',
        pty: v.pty || '0',
        rainProb: v.pop ?? 0,
        text: skyPtyToText(v.sky || '1', v.pty || '0'),
        icon: skyPtyToIcon(v.sky || '1', v.pty || '0'),
      }
    })
    .filter((h) => h.stamp >= nowStamp)
    .sort((a, b) => a.stamp.localeCompare(b.stamp))
    .slice(0, 24)

  return { daily, hourly }
}

// ─── 중기예보: D+3 ~ D+10 ─────────────────────────────────────────
async function fetchMidTerm(key: string, regTemp: string, regLand: string) {
  const tmFc = getMidTmFc()

  const qsT = new URLSearchParams({
    serviceKey: key, numOfRows: '10', pageNo: '1', dataType: 'JSON',
    regId: regTemp, tmFc,
  })
  const qsL = new URLSearchParams({
    serviceKey: key, numOfRows: '10', pageNo: '1', dataType: 'JSON',
    regId: regLand, tmFc,
  })

  const [tempJson, landJson] = await Promise.all([
    fetchJson(`${MID_BASE}/getMidTa?${qsT}`),
    fetchJson(`${MID_BASE}/getMidLandFcst?${qsL}`),
  ])

  const tempItem = tempJson?.response?.body?.items?.item?.[0] || tempJson?.response?.body?.items?.item
  const landItem = landJson?.response?.body?.items?.item?.[0] || landJson?.response?.body?.items?.item

  if (!tempItem || !landItem) return []

  // tmFc 기준 D+3 이 날짜 오프셋 3
  const tmFcDate = new Date(
    Number(tmFc.slice(0, 4)),
    Number(tmFc.slice(4, 6)) - 1,
    Number(tmFc.slice(6, 8)),
  )

  const result: any[] = []
  // 5일 예보: 오늘/D+1/D+2(단기) + D+3/D+4(중기) 만 필요
  for (let i = 3; i <= 4; i++) {
    const date = addDays(tmFcDate, i)
    const tmn = tempItem[`taMin${i}`]
    const tmx = tempItem[`taMax${i}`]
    const amWf = landItem[`wf${i}Am`]
    const pmWf = landItem[`wf${i}Pm`]
    const wf = pmWf || amWf || ''
    if (tmn == null && tmx == null) continue
    result.push({
      date: fmtISO(date),
      min: tmn != null ? Number(tmn) : null,
      max: tmx != null ? Number(tmx) : null,
      rainProb: null,
      sky: '',
      pty: '',
      text: wf || '-',
      icon: midWfToIcon(wf),
    })
  }
  return result
}

// ─── 핸들러 ─────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const key = process.env.DATA_GO_KR_KEY
  if (!key) {
    return NextResponse.json({ error: 'DATA_GO_KR_KEY 누락' }, { status: 500 })
  }

  // ?region=인제 — 광장 내 sub-region 단위 조회
  const subRegion = (new URL(request.url).searchParams.get('region') || '').slice(0, 30).trim()

  // 광장별 좌표 결정 — 광장 컨텍스트면 plazas.center_lat/lng 로 격자 변환
  let nx = DEFAULT_NX, ny = DEFAULT_NY
  let regTemp = DEFAULT_REG_TEMP, regLand = DEFAULT_REG_LAND
  let locationLabel = '춘천'
  let parentRegionForGeocode: string | null = null
  let coverage: string[] = []
  try {
    const plaza = await getCurrentPlaza()
    if (plaza) {
      const supabase = await createClient()
      const { data } = await supabase
        .from('plazas')
        .select('name, parent_region, center_lat, center_lng, coverage')
        .eq('id', plaza)
        .single()
      if (data?.center_lat && data?.center_lng) {
        const grid = latLngToGrid(Number(data.center_lat), Number(data.center_lng))
        nx = grid.nx
        ny = grid.ny
      }
      const codes = regionCodes(data?.parent_region ?? null)
      regTemp = codes.temp
      regLand = codes.land
      if (data?.name) locationLabel = String(data.name).replace(/광장$/, '')
      parentRegionForGeocode = data?.parent_region ?? null
      if (Array.isArray((data as any)?.coverage)) coverage = (data as any).coverage
    }
  } catch {
    // 폴백: 춘천 좌표 유지
  }

  // sub-region 이 광장 coverage 안에 있으면 → 좌표 테이블에서 조회 후 격자 재계산
  if (subRegion && coverage.includes(subRegion)) {
    const coords = lookupSubRegion(subRegion)
    if (coords) {
      const grid = latLngToGrid(coords.lat, coords.lng)
      nx = grid.nx
      ny = grid.ny
      locationLabel = subRegion
    }
    // 미해결 시엔 광장 중심 좌표로 폴백 (격자 5km 단위라 인접 sub-region 은 어차피 같은 격자일 가능성)
  }
  // 사용 안 함 표시 — parentRegionForGeocode 는 미래 폴백용으로 남겨두지만 현재 무시
  void parentRegionForGeocode

  try {
    const [current, shortTerm, midTerm] = await Promise.all([
      fetchCurrent(key, nx, ny).catch(() => null),
      fetchShortTerm(key, nx, ny).catch(() => ({ daily: [] as any[], hourly: [] as any[] })),
      fetchMidTerm(key, regTemp, regLand).catch(() => [] as any[]),
    ])

    // 단기 오늘~D+2 + 중기 D+3~D+4 합치기(중복 date 제거) → 최대 5일
    const seen = new Set<string>()
    const forecast = [...shortTerm.daily, ...midTerm].filter((f) => {
      if (seen.has(f.date)) return false
      seen.add(f.date)
      return true
    }).slice(0, 5)

    return NextResponse.json(
      {
        ok: true,
        location: locationLabel,
        current,
        forecast,
        hourly: shortTerm.hourly,
      },
      {
        headers: {
          // 브라우저/엣지 양쪽 캐시 — 10분 fresh, 30분 stale-while-revalidate
          'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800',
        },
      },
    )
  } catch (e: any) {
    return NextResponse.json(
      { error: 'weather_fail', detail: e?.message ?? String(e) },
      { status: 502 },
    )
  }
}
