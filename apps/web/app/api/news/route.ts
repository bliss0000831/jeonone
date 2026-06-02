import { NextRequest, NextResponse } from 'next/server'
import { getCurrentPlaza } from '@/lib/plaza/server'
import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/services/ratelimit'

export const revalidate = 300 // 5분 캐시
export const maxDuration = 30  // 다중 OG 추출 — 추출 + 페이지 넘기기 여유 시간

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

// SSRF 방어 — 사설 IP 대역 차단 + http(s) 만 허용
function isPrivateHostname(host: string): boolean {
  const h = host.toLowerCase()
  if (h === 'localhost' || h === '0.0.0.0' || h.endsWith('.local')) return true
  // IPv4 사설/링크로컬/메타데이터
  if (/^127\./.test(h)) return true
  if (/^10\./.test(h)) return true
  if (/^192\.168\./.test(h)) return true
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return true
  if (/^169\.254\./.test(h)) return true     // metadata
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd')) return true
  return false
}

function isSafeFetchUrl(raw: string): URL | null {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (isPrivateHostname(u.hostname)) return null
    return u
  } catch {
    return null
  }
}

/**
 * 응답 HTML 에서 썸네일 URL 추출 — 7가지 패턴 시도.
 * 단순 og:image 만 보던 옛 버전 대비 성공률 +25~30%p.
 */
function extractThumbnail(html: string, baseUrl: string): string | null {
  const patterns: RegExp[] = [
    // OG 표준 — property 가 앞/뒤 양쪽
    /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image:secure_url["']/i,
    /<meta[^>]+property=["']og:image:url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image:url["']/i,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    // Twitter Card
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    /<meta[^>]+name=["']twitter:image:src["'][^>]+content=["']([^"']+)["']/i,
    // Schema.org itemprop
    /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i,
    // <link rel="image_src">
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
  ]

  for (const p of patterns) {
    const m = html.match(p)
    const raw = m?.[1]?.trim()
    if (raw) {
      const normalized = normalizeImageUrl(raw, baseUrl)
      if (normalized) return normalized
    }
  }

  // 마지막 안전망 — <article> 안 첫 <img>
  const articleMatch = html.match(/<article[\s\S]*?<\/article>/i)
  if (articleMatch) {
    const imgMatch = articleMatch[0].match(/<img[^>]+src=["']([^"']+)["']/i)
    const raw = imgMatch?.[1]?.trim()
    if (raw) {
      const normalized = normalizeImageUrl(raw, baseUrl)
      if (normalized && !raw.startsWith('data:') && !/\.(svg|gif)(\?|$)/i.test(raw)) {
        return normalized
      }
    }
  }

  return null
}

function normalizeImageUrl(raw: string, baseUrl: string): string | null {
  if (!raw) return null
  if (raw.startsWith('data:')) return null
  let candidate: string
  if (raw.startsWith('//')) {
    candidate = `https:${raw}`
  } else if (raw.startsWith('/')) {
    try {
      const base = new URL(baseUrl)
      candidate = `${base.origin}${raw}`
    } catch {
      return null
    }
  } else if (/^https?:\/\//i.test(raw)) {
    candidate = raw
  } else {
    return null
  }
  // SSRF 방어 — 사설 IP / javascript: 등 위험 URL 차단 (썸네일도 클라이언트가 로드하므로 검증)
  const safe = isSafeFetchUrl(candidate)
  return safe ? candidate : null
}

/**
 * SSRF-safe 한 fetch — `redirect: 'manual'` 로 리다이렉트를 직접 추적(최대 3회).
 * 각 리다이렉트 대상 URL 을 isSafeFetchUrl 로 검증하여 사설 IP 우회를 차단.
 */
async function safeFetchHtml(
  rawUrl: string,
  userAgent: string,
  timeoutMs: number,
): Promise<{ html: string; finalUrl: string } | null> {
  const start = isSafeFetchUrl(rawUrl)
  if (!start) return null

  try {
    // 리다이렉트 수동 추적 — 최대 3회 (SSRF 리다이렉트 체인 방지)
    let currentUrl = start.toString()
    let res: Response | null = null
    for (let i = 0; i < 3; i++) {
      res = await fetch(currentUrl, {
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'manual',
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.5',
        },
      })
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location')
        if (!loc) break
        const nextUrl = isSafeFetchUrl(loc.startsWith('http') ? loc : new URL(loc, currentUrl).toString())
        if (!nextUrl) return null // 리다이렉트 대상이 사설 IP → 차단
        currentUrl = nextUrl.toString()
        continue
      }
      break
    }
    if (!res || !res.ok) return null

    // 최종 URL 사설 IP 재검증 (SSRF — 리다이렉트로 우회 시도 차단)
    const finalSafe = isSafeFetchUrl(res.url)
    if (!finalSafe) return null

    const html = await res.text()
    return { html, finalUrl: res.url }
  } catch {
    return null
  }
}

const UA_BROWSER =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// ── OG 결과 모듈 캐시 (1시간) ──
//   같은 기사 URL 을 여러 페이지에서 다시 추출하지 않게 함.
const OG_CACHE_TTL_MS = 60 * 60_000
const ogCache = new Map<string, { thumb: string | null; ts: number }>()

/**
 * OG/썸네일 이미지 추출 — 단일 UA (Chrome) + 1.5s 타임아웃.
 * 이전엔 Googlebot+Browser 두 번 시도했으나 라운드트립이 두 배 → 너무 느림.
 * 한 번에 한국 언론사 대부분 처리됨.
 */
async function fetchOgImage(url: string): Promise<string | null> {
  const cached = ogCache.get(url)
  if (cached && Date.now() - cached.ts < OG_CACHE_TTL_MS) {
    return cached.thumb
  }

  const result = await safeFetchHtml(url, UA_BROWSER, 1500)
  const thumb = result ? extractThumbnail(result.html, result.finalUrl) : null

  ogCache.set(url, { thumb, ts: Date.now() })
  // 캐시 사이즈 cap — 1000개 넘으면 가장 오래된 것 정리
  if (ogCache.size > 1000) {
    const entries = Array.from(ogCache.entries()).sort((a, b) => a[1].ts - b[1].ts)
    for (let i = 0; i < 200; i++) ogCache.delete(entries[i][0])
  }
  return thumb
}

// 페이지당 표시할 춘천 기사 수
const PAGE_SIZE = 12

// 네이버 원본 페치 (필터 전)
async function fetchNaverRaw(query: string, start: number, display: number) {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('NO_API_KEY')

  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=${display}&start=${start}&sort=date`
  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
    signal: AbortSignal.timeout(5000), // 5초 타임아웃 — 네이버 API 행 방지
    next: { revalidate: 300 },
  })
  if (!res.ok) throw new Error(`Naver API error: ${res.status}`)
  return res.json()
}

// 네이버 뉴스 API: 제목 매칭 + **썸네일 추출 성공한 기사만** 12개 모을 때까지 페이지네이션
async function fetchNaverNews(
  query: string,
  start: number = 1,
  display: number = 100,
  cityFilter: string[] = ['춘천', '강원'],
): Promise<{ items: NewsItem[]; total: number; hasMore: boolean }> {
  const clean = (s: string) =>
    s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')

  const titleMatches = (item: any) => {
    const title = item.title.replace(/<[^>]+>/g, '')
    return cityFilter.some((c) => title.includes(c))
  }

  // 1단계: 제목 매칭 기사를 충분히 모은다 (썸네일 추출 실패 대비 PAGE_SIZE × 2)
  //   이전엔 ×3 이었으나 너무 많이 fetch 해서 느림. ×2 + 부족 시 다음 페이지 fetch.
  const TARGET_RAW = PAGE_SIZE * 2
  let candidates: any[] = []
  let total = 0
  let cursor = start
  const seen = new Set<string>()
  let exhaustedNaver = false

  while (candidates.length < TARGET_RAW && cursor <= 1000) {
    let data: any
    try {
      data = await fetchNaverRaw(query, cursor, display)
    } catch (e) {
      console.error('naver page fetch failed at start=', cursor, e)
      if (cursor === start) throw e
      exhaustedNaver = true
      break
    }
    if (total === 0) total = data.total || 0

    const items = data.items || []
    if (items.length === 0) {
      exhaustedNaver = true
      break
    }

    for (const it of items) {
      if (seen.has(it.link)) continue
      if (titleMatches(it)) {
        seen.add(it.link)
        candidates.push(it)
        if (candidates.length >= TARGET_RAW) break
      }
    }

    if (items.length < display) {
      exhaustedNaver = true
      break
    }
    cursor += display
  }

  // 2단계: 후보들 OG 이미지 병렬 추출 + 썸네일 있는 기사만 필터
  //   동시성 24 — Promise.all 한 번에 병렬 (네트워크는 동시에 24개 까지 — 노드 기본 한도 안)
  const successItems: NewsItem[] = []
  const BATCH = 24
  for (let i = 0; i < candidates.length && successItems.length < PAGE_SIZE; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH)
    const ogImages = await Promise.all(
      batch.map((item: any) => fetchOgImage(item.originallink || item.link)),
    )

    for (let j = 0; j < batch.length; j++) {
      const item = batch[j]
      const thumb = ogImages[j]
      // 썸네일 추출 실패 = 그 기사는 그냥 버림 (사용자가 빈 박스 보지 않게)
      if (!thumb) continue

      // 프레시안 (pressian) 도메인 제외 — 사용자 요청
      // originallink / link 양쪽 모두 체크 (네이버 뉴스 reframe 케이스)
      const linkStr = String((item.originallink || item.link || ""))
      if (/(^|\.)pressian\.com\//i.test(linkStr) || /pressian/i.test(linkStr)) {
        continue
      }

      let press = '뉴스'
      try {
        const domain = new URL(item.originallink || item.link).hostname
        press = domain.replace('www.', '').split('.')[0]
        const pressMap: Record<string, string> = {
          kbs: 'KBS', ytn: 'YTN', mbc: 'MBC', sbs: 'SBS', jtbc: 'JTBC',
          khan: '경향신문', hani: '한겨레', chosun: '조선일보', donga: '동아일보',
          joongang: '중앙일보', ohmynews: '오마이뉴스', pressian: '프레시안',
          gangwon: '강원도민일보', chuncheon: '춘천사람들',
        }
        for (const [key, name] of Object.entries(pressMap)) {
          if (domain.includes(key)) { press = name; break }
        }
      } catch {}

      successItems.push({
        id: `naver-${start}-${i + j}-${Date.now()}`,
        title: clean(item.title),
        description: clean(item.description),
        url: item.originallink || item.link,
        thumbnail: thumb,
        press,
        publishedAt: item.pubDate,
        category: 'local',
      })

      if (successItems.length >= PAGE_SIZE) break
    }
  }

  // 후보 다 소진했는데 PAGE_SIZE 못 채우면 더 가져오기 (재귀 1회 — 안전 상한)
  if (successItems.length < PAGE_SIZE && !exhaustedNaver && cursor <= 1000) {
    try {
      const more = await fetchNaverNews(query, cursor, display, cityFilter)
      for (const it of more.items) {
        if (successItems.length >= PAGE_SIZE) break
        successItems.push(it)
      }
    } catch {
      // 폴백 페치 실패는 무시 — 지금까지 모은 것만 반환
    }
  }

  return {
    items: successItems.slice(0, PAGE_SIZE),
    total,
    hasMore: !exhaustedNaver && cursor + display - 1 < Math.min(total, 1000),
  }
}

// Mock 데이터
const MOCK_NEWS: NewsItem[] = [
  {
    id: 'mock-1',
    title: '춘천시, 소양강 수변공원 조성 사업 착공',
    description: '춘천시가 소양강 일원에 시민 친화적인 수변공원을 조성하는 대규모 사업에 착공했다. 2026년 말 완공을 목표로 총 150억 원이 투입된다.',
    url: '#',
    thumbnail: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80',
    press: '강원도민일보',
    publishedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    category: 'local',
  },
  {
    id: 'mock-2',
    title: '제26회 춘천마임축제 5월 22일 개막… 국내외 70개 팀 참가',
    description: '국내 최대 마임 전문 축제인 춘천마임축제가 오는 5월 22일부터 27일까지 공지천 유원지 일대에서 개최된다.',
    url: '#',
    thumbnail: 'https://images.unsplash.com/photo-1555421689-491a97ff2040?w=600&q=80',
    press: '춘천사람들',
    publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    category: 'festival',
  },
  {
    id: 'mock-3',
    title: '춘천 의암호 수상레저 시즌 개장… 카약·SUP 체험 운영',
    description: '춘천 의암호 수상레저 시설이 4월 19일 공식 개장했다. 카약, SUP 등 다양한 수상 레저 프로그램을 이용할 수 있다.',
    url: '#',
    thumbnail: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600&q=80',
    press: '강원일보',
    publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    category: 'local',
  },
  {
    id: 'mock-4',
    title: '강원 특별자치도, 춘천 바이오산업 클러스터 조성 발표',
    description: '강원특별자치도가 춘천시에 바이오·의료 산업 클러스터를 조성한다고 밝혔다. 2030년까지 1,200억 원이 투자된다.',
    url: '#',
    thumbnail: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=600&q=80',
    press: '연합뉴스',
    publishedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    category: 'economy',
  },
  {
    id: 'mock-5',
    title: '춘천 낭만시장, 야시장 시즌 시작… 매주 금·토 운영',
    description: '춘천 낭만시장 야시장이 4월부터 다시 문을 열었다. 매주 금요일과 토요일 오후 5시부터 밤 10시까지 운영된다.',
    url: '#',
    thumbnail: 'https://images.unsplash.com/photo-1567521464027-f127ff144326?w=600&q=80',
    press: '춘천사람들',
    publishedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    category: 'local',
  },
  {
    id: 'mock-6',
    title: '춘천 버스 노선 개편… 신규 노선 6개 추가',
    description: '춘천시가 시내버스 노선을 전면 개편한다고 밝혔다. 외곽 지역 주민의 교통 불편 해소를 위해 6개 신규 노선이 추가된다.',
    url: '#',
    thumbnail: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=600&q=80',
    press: '강원도민일보',
    publishedAt: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
    category: 'local',
  },
  {
    id: 'mock-7',
    title: '춘천시, 1인 가구 지원 정책 확대… 고립 예방 프로그램 운영',
    description: '춘천시가 급증하는 1인 가구를 위해 지원 정책을 대폭 확대한다. 이웃 연결 프로그램도 새롭게 운영된다.',
    url: '#',
    thumbnail: 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=600&q=80',
    press: 'KBS 춘천',
    publishedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    category: 'social',
  },
  {
    id: 'mock-8',
    title: '강원FC, 홈 경기 5월 일정 공개… 의암경기장 대규모 이벤트 예고',
    description: '강원FC가 5월 홈 경기 일정을 공개하며 의암경기장을 찾는 팬들을 위한 다양한 이벤트를 예고했다.',
    url: '#',
    thumbnail: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600&q=80',
    press: '강원일보',
    publishedAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
    category: 'sports',
  },
  {
    id: 'mock-9',
    title: '춘천 닭갈비 골목, 외국인 관광객으로 붐벼',
    description: '봄 시즌을 맞아 춘천 명동 닭갈비 골목에 외국인 관광객이 크게 늘었다. 일평균 방문객이 작년 대비 30% 증가했다.',
    url: '#',
    thumbnail: 'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=600&q=80',
    press: '강원일보',
    publishedAt: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
    category: 'local',
  },
  {
    id: 'mock-10',
    title: '춘천시, 청년 창업 지원센터 개소… 입주 기업 모집',
    description: '춘천시가 청년 창업 활성화를 위한 지원센터를 개소하고 입주 기업 20팀을 모집한다고 밝혔다.',
    url: '#',
    thumbnail: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&q=80',
    press: '춘천사람들',
    publishedAt: new Date(Date.now() - 42 * 60 * 60 * 1000).toISOString(),
    category: 'economy',
  },
  {
    id: 'mock-11',
    title: '춘천 봄꽃 축제 공지천에서 개막… 주말 교통 통제',
    description: '공지천 일대에서 봄꽃 축제가 개막했다. 기간 중 주말에는 인근 도로 일부 구간이 교통 통제된다.',
    url: '#',
    thumbnail: 'https://images.unsplash.com/photo-1522748906645-95d8adfd52c7?w=600&q=80',
    press: 'YTN',
    publishedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    category: 'festival',
  },
  {
    id: 'mock-12',
    title: '강원대학교, 글로벌 대학 평가 국내 10위권 진입',
    description: '강원대학교가 올해 글로벌 대학 평가에서 국내 10위권에 진입했다. 연구 역량과 국제화 지표가 크게 향상됐다.',
    url: '#',
    thumbnail: 'https://images.unsplash.com/photo-1562774053-701939374585?w=600&q=80',
    press: '연합뉴스',
    publishedAt: new Date(Date.now() - 54 * 60 * 60 * 1000).toISOString(),
    category: 'education',
  },
]

export async function GET(request: NextRequest) {
  // 외부 Naver API 비용 방어 — IP 당 분당 30회
  const limited = await enforceRateLimit(request, 'news')
  if (limited) return limited

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, Math.min(parseInt(searchParams.get('page') || '1', 10) || 1, 10))
  const q = (searchParams.get('q') || '').slice(0, 100)
  // sub_region — 광장 안 세부 지역 (예: chuncheon 광장의 '인제', '홍천' 등)
  //   주어지면 그 지역으로 검색 query / 제목 필터를 좁힘
  const subRegion = (searchParams.get('region') || '').slice(0, 30).trim()
  const naverDisplay = 100                     // 네이버에서 100개 받아 필터
  const start = (page - 1) * naverDisplay + 1  // page1→1, page2→101, page3→201

  // 광장별 도시명 + coverage 추출 — query 키워드 + 제목 필터에 사용
  const plaza = await getCurrentPlaza()
  let cityName = '춘천'
  let parentRegion = '강원'
  let coverage: string[] = []
  if (plaza) {
    try {
      const supabase = await createClient()
      const { data } = await supabase
        .from('plazas')
        .select('name, parent_region, coverage')
        .eq('id', plaza)
        .single()
      if (data?.name) cityName = data.name.replace(/광장$/, '').trim() || '춘천'
      if (data?.parent_region) parentRegion = data.parent_region.replace(/권$/, '').trim() || '강원'
      if (Array.isArray((data as any)?.coverage)) coverage = (data as any).coverage
    } catch {
      // 폴백: 기본값 유지
    }
  }

  // 검색 keyword + 제목 필터 결정:
  //   · subRegion 가 광장 coverage 안에 있으면 → 그 지역만
  //   · 그렇지 않으면 → 광장 전체 (cityName + parentRegion)
  const validSubRegion = subRegion && coverage.includes(subRegion) ? subRegion : ''
  const searchKeyword = validSubRegion || cityName
  const cityFilter = validSubRegion
    ? [validSubRegion]
    : Array.from(new Set([cityName, parentRegion, ...coverage]))

  try {
    let news: NewsItem[] = []
    let usedMock = false
    let hasMore = false
    let total = 0

    try {
      const query = q ? `${searchKeyword} ${q}` : searchKeyword
      const result = await fetchNaverNews(query, start, naverDisplay, cityFilter)
      news = result.items
      total = result.total
      hasMore = result.hasMore
    } catch (err: any) {
      // 검색어가 있으면 mock 데이터 필터링
      news = q
        ? MOCK_NEWS.filter(
            (n) =>
              n.title.includes(q) ||
              n.description.includes(q) ||
              n.press.includes(q)
          )
        : MOCK_NEWS
      usedMock = true
      hasMore = false
      total = news.length
    }

    return NextResponse.json(
      { news, usedMock, hasMore, total, page },
      {
        headers: {
          // CDN 5분 캐시 + 만료 후 1시간 동안 구버전 서빙하면서 백그라운드 갱신
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        },
      }
    )
  } catch (err) {
    return NextResponse.json(
      { news: MOCK_NEWS, usedMock: true, hasMore: false, total: MOCK_NEWS.length, page: 1 },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
    )
  }
}
