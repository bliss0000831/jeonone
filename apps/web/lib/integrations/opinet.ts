// 한국석유공사 오피넷 (Opinet) 가격 API 통합
//
// 무료 API 키 등록: https://www.opinet.co.kr/api/api.do
// 기본 도메인: https://www.opinet.co.kr/api/<endpoint>?code=<key>&out=json&...
//
// 주요 엔드포인트:
//   - aroundAll.do  : 반경 내 주유소 + 가격 (입력 좌표는 KATEC TM)
//   - searchByZone.do: 시도/시군구 단위 주유소 + 가격
//   - lowTop10.do   : 시도별 최저가 TOP 10
//
// 좌표계: Opinet 은 KATEC TM 좌표계를 기본으로 사용. 본 모듈은 WGS84(위경도) ↔ KATEC 변환을 제공.

import proj4 from "proj4"

// 상수·타입은 클라이언트 번들 안전을 위해 별도 파일에서 관리 후 re-export
export {
  OIL_PRODUCT_CODES,
  OIL_PRODUCT_LABELS,
  SIDO_LIST,
  MOCK_NEARBY_STATIONS,
  brandLabel,
  type OilProduct,
  type OpinetStation,
  type SidoCode,
} from "./opinet-constants"
import { OIL_PRODUCT_CODES, brandLabel, type OilProduct, type OpinetStation } from "./opinet-constants"

// ── 좌표계 정의 (KATEC TM Korea) ───────────────────────────────────────
const KATEC =
  "+proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999 +x_0=400000 +y_0=600000 +ellps=bessel +units=m +no_defs +towgs84=-145.907,505.034,685.756,-1.162,2.347,1.592,6.342"
const WGS84 = "+proj=longlat +datum=WGS84 +no_defs"

export function wgs84ToKatec(lng: number, lat: number): { x: number; y: number } {
  const [x, y] = proj4(WGS84, KATEC, [lng, lat])
  return { x, y }
}

export function katecToWgs84(x: number, y: number): { lng: number; lat: number } {
  const [lng, lat] = proj4(KATEC, WGS84, [x, y])
  return { lng, lat }
}

// ── 주소 기반 지오코딩 보정 ─────────────────────────────────────────
// Opinet KATEC 좌표는 ~30m 오차가 발생할 수 있어, 도로명주소를 네이버 지오코더로 변환.
// 24시간 메모리 캐시 (주소는 거의 안 바뀜).
const geocodeCache = new Map<string, { lat: number; lng: number; ts: number }>()
const GEOCODE_TTL_MS = 24 * 60 * 60 * 1000

async function geocodeKoreanAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address) return null
  const now = Date.now()
  const cached = geocodeCache.get(address)
  if (cached && now - cached.ts < GEOCODE_TTL_MS) return { lat: cached.lat, lng: cached.lng }

  const id = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID
  const secret = process.env.NAVER_MAP_CLIENT_SECRET
  if (!id || !secret) return null
  try {
    const url = `https://maps.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(address)}`
    const r = await fetch(url, {
      headers: { "x-ncp-apigw-api-key-id": id, "x-ncp-apigw-api-key": secret },
    })
    if (!r.ok) return null
    const j: any = await r.json()
    const first = j?.addresses?.[0]
    if (!first?.x || !first?.y) return null
    const lat = parseFloat(first.y)
    const lng = parseFloat(first.x)
    geocodeCache.set(address, { lat, lng, ts: now })
    return { lat, lng }
  } catch {
    return null
  }
}

// ── 핵심 호출 함수 ───────────────────────────────────────────────────
const BASE = "https://www.opinet.co.kr/api"

interface FetchOpts {
  /** 결과 캐싱 시간(초). Vercel/Next 가 사용. */
  revalidate?: number
}

async function callOpinet<T>(
  endpoint: string,
  params: Record<string, string | number>,
  opts: FetchOpts = {},
): Promise<T> {
  const apiKey = process.env.OPINET_API_KEY
  if (!apiKey) throw new Error("OPINET_API_KEY 환경 변수가 설정되지 않았습니다")

  const url = new URL(`${BASE}/${endpoint}`)
  url.searchParams.set("code", apiKey)
  url.searchParams.set("out", "json")
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    next: opts.revalidate ? { revalidate: opts.revalidate } : undefined,
  })
  if (!res.ok) throw new Error(`Opinet ${endpoint} ${res.status}`)
  return res.json()
}

/**
 * 반경 검색 — 좌표 주변 주유소 + 가격
 * @param lat 위도 (WGS84)
 * @param lng 경도 (WGS84)
 * @param radiusMeters 반경 (m). Opinet 최대 5000.
 * @param product 유종
 */
// detailById 로 가져온 주소 캐시 (uniId → newAddr)
const detailAddrCache = new Map<string, { addr: string; ts: number }>()
const DETAIL_TTL_MS = 24 * 60 * 60 * 1000

async function fetchStationAddress(uniId: string): Promise<string> {
  const now = Date.now()
  const cached = detailAddrCache.get(uniId)
  if (cached && now - cached.ts < DETAIL_TTL_MS) return cached.addr
  try {
    const data: any = await callOpinet("detailById.do", { id: uniId }, { revalidate: 60 * 60 * 24 })
    const row = data?.RESULT?.OIL?.[0]
    const addr = String(row?.NEW_ADR || row?.VAN_ADR || "").replace(/\s+/g, " ").trim()
    if (addr) detailAddrCache.set(uniId, { addr, ts: now })
    return addr
  } catch {
    return ""
  }
}

async function rowToStation(row: any): Promise<OpinetStation> {
  const uniId = String(row.UNI_ID)
  const xc = Number(row.GIS_X_COOR)
  const yc = Number(row.GIS_Y_COOR)
  const wgs = katecToWgs84(xc, yc)
  // 도로명주소 우선 — aroundAll 응답엔 NEW_ADR 가 없어 detailById 로 보충
  let newAddr = row.NEW_ADR ? String(row.NEW_ADR).replace(/\s+/g, " ").trim() : ""
  if (!newAddr) {
    newAddr = await fetchStationAddress(uniId)
  }
  // 도로명주소 → 네이버 지오코더로 정확한 좌표
  const accurate = newAddr ? await geocodeKoreanAddress(newAddr) : null
  // POLL 코드는 응답 키가 일관성 없음 (POLL_DVS_CD / POLL_DIV_CD / POLL_DIV_CO)
  const poll = String(row.POLL_DVS_CD || row.POLL_DIV_CD || row.POLL_DIV_CO || "ETC").trim()
  return {
    uniId,
    osNm: String(row.OS_NM),
    poll,
    price: Number(row.PRICE),
    distance: row.DISTANCE != null ? Number(row.DISTANCE) : undefined,
    gisXCoor: xc,
    gisYCoor: yc,
    lat: accurate?.lat ?? wgs.lat,
    lng: accurate?.lng ?? wgs.lng,
    brand: brandLabel(poll),
    newAddr,
  } satisfies OpinetStation
}

export async function findNearbyStations(
  lat: number,
  lng: number,
  radiusMeters: number,
  product: OilProduct,
): Promise<OpinetStation[]> {
  const { x, y } = wgs84ToKatec(lng, lat)
  const data: any = await callOpinet(
    "aroundAll.do",
    {
      x: Math.round(x),
      y: Math.round(y),
      radius: Math.min(Math.max(100, Math.round(radiusMeters)), 5000),
      prodcd: OIL_PRODUCT_CODES[product],
      sort: 1, // 가격 오름차순
    },
    { revalidate: 60 * 5 }, // 5분 캐시
  )
  const list: any[] = data?.RESULT?.OIL ?? []
  return Promise.all(list.map(rowToStation))
}

/**
 * 시도/시군구 검색 — 전체 지역 모드
 *
 * lowTop10.do 의 area 파라미터는 시도 코드(2자리) 또는 시군구 코드(4자리) 모두 허용.
 * area2 가 있으면 시군구 단위, 없으면 시도 단위 TOP10 반환.
 */
export async function findStationsByZone(
  area1: string,
  area2: string | null,
  product: OilProduct,
): Promise<OpinetStation[]> {
  const target = area2 || area1
  return findCheapestInSido(target, product)
}

/**
 * 시도별 최저가 TOP 10 — 빠른 랭킹용
 */
export async function findCheapestInSido(
  area1: string,
  product: OilProduct,
): Promise<OpinetStation[]> {
  // lowTop10.do 의 cnt 파라미터는 최대 20 (그 이상은 무시되고 기본 10 으로 fallback)
  const data: any = await callOpinet(
    "lowTop10.do",
    { prodcd: OIL_PRODUCT_CODES[product], area: area1, cnt: 20 },
    { revalidate: 60 * 10 },
  )
  const list: any[] = data?.RESULT?.OIL ?? []
  return Promise.all(list.map(rowToStation))
}

// SIDO_LIST, SidoCode → opinet-constants.ts 에서 re-export

/**
 * 시도 코드로 시군구 코드/이름 목록 조회
 * Opinet areaCode.do 엔드포인트 — 응답 키: AREA_CD, AREA_NM
 */
export async function getSigunguList(
  area1: string,
): Promise<{ code: string; name: string }[]> {
  const data: any = await callOpinet(
    "areaCode.do",
    { area: area1 },
    { revalidate: 60 * 60 * 24 }, // 24시간 캐시 (코드는 거의 안 바뀜)
  )
  // Opinet 응답 변칙: 코드 목록인데 키가 OIL 임 (실제 응답 확인됨)
  const list: any[] = data?.RESULT?.AREA ?? data?.RESULT?.OIL ?? []
  return list.map((row) => ({
    code: String(row.AREA_CD),
    name: String(row.AREA_NM),
  }))
}

// MOCK_NEARBY_STATIONS → opinet-constants.ts 에서 re-export
