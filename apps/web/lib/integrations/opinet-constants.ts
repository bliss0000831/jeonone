// Opinet 상수·타입 — 클라이언트 번들에서도 안전하게 import 가능
// (proj4 의존성 없음)

export const OIL_PRODUCT_CODES = {
  premium: "B034",
  gasoline: "B027",
  diesel: "D047",
  kerosene: "C004",
  lpg: "K015",
} as const

export type OilProduct = keyof typeof OIL_PRODUCT_CODES

export const OIL_PRODUCT_LABELS: Record<OilProduct, string> = {
  premium: "고급휘발유",
  gasoline: "휘발유",
  diesel: "경유",
  kerosene: "등유",
  lpg: "LPG",
}

export interface OpinetStation {
  uniId: string
  osNm: string
  poll: string
  price: number
  distance?: number
  gisXCoor: number
  gisYCoor: number
  lat?: number
  lng?: number
  brand?: string
  newAddr?: string
  carWash?: boolean
  maintenance?: boolean
  cvs?: boolean
  lpg?: boolean
}

const POLL_BRAND_NAME: Record<string, string> = {
  SKE: "SK에너지",
  GSC: "GS칼텍스",
  HDO: "현대오일뱅크",
  SOL: "S-OIL",
  RTE: "자영알뜰",
  RTX: "고속도로알뜰",
  NHO: "농협알뜰",
  E1G: "E1",
  SKG: "SK가스",
  ETC: "기타",
}

export function brandLabel(poll: string): string {
  return POLL_BRAND_NAME[poll] || poll
}

export const SIDO_LIST = [
  { code: "01", name: "서울" },
  { code: "02", name: "경기" },
  { code: "03", name: "강원" },
  { code: "04", name: "충북" },
  { code: "05", name: "충남" },
  { code: "06", name: "전북" },
  { code: "07", name: "전남" },
  { code: "08", name: "경북" },
  { code: "09", name: "경남" },
  { code: "10", name: "부산" },
  { code: "11", name: "대구" },
  { code: "12", name: "인천" },
  { code: "13", name: "광주" },
  { code: "14", name: "대전" },
  { code: "15", name: "울산" },
  { code: "16", name: "세종" },
  { code: "17", name: "제주" },
] as const

export type SidoCode = (typeof SIDO_LIST)[number]["code"]

export const MOCK_NEARBY_STATIONS: OpinetStation[] = [
  {
    uniId: "MOCK-001",
    osNm: "효자동 알뜰주유소",
    poll: "RTE",
    price: 1597,
    distance: 480,
    gisXCoor: 0,
    gisYCoor: 0,
    lat: 37.873,
    lng: 127.731,
    brand: "자영알뜰",
    newAddr: "강원도 춘천시 효자동",
  },
  {
    uniId: "MOCK-002",
    osNm: "SK 춘천중앙",
    poll: "SKE",
    price: 1645,
    distance: 720,
    gisXCoor: 0,
    gisYCoor: 0,
    lat: 37.875,
    lng: 127.726,
    brand: "SK에너지",
    newAddr: "강원도 춘천시 중앙로",
  },
  {
    uniId: "MOCK-003",
    osNm: "GS칼텍스 춘천공지",
    poll: "GSC",
    price: 1652,
    distance: 980,
    gisXCoor: 0,
    gisYCoor: 0,
    lat: 37.879,
    lng: 127.738,
    brand: "GS칼텍스",
    newAddr: "강원도 춘천시 공지로",
  },
  {
    uniId: "MOCK-004",
    osNm: "현대오일뱅크 강원대",
    poll: "HDO",
    price: 1638,
    distance: 1240,
    gisXCoor: 0,
    gisYCoor: 0,
    lat: 37.867,
    lng: 127.744,
    brand: "현대오일뱅크",
    newAddr: "강원도 춘천시 강원대학길",
  },
  {
    uniId: "MOCK-005",
    osNm: "S-OIL 춘천우두",
    poll: "SOL",
    price: 1659,
    distance: 1810,
    gisXCoor: 0,
    gisYCoor: 0,
    lat: 37.890,
    lng: 127.722,
    brand: "S-OIL",
    newAddr: "강원도 춘천시 우두동",
  },
]
