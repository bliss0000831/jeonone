/**
 * 광장(전원일기) 이름 → 지역명 추출 헬퍼.
 *   "강원 전원일기" → "강원"
 *   "전북 전원일기" → "전북"
 *   "춘천광장"      → "춘천"   (레거시 호환)
 *
 * UI 의 "강원 소식" 같은 라벨에서 지역명 부분을 동적으로 채우는 용도.
 */
export function plazaCityName(plazaName: string | null | undefined): string {
  if (!plazaName) return '전원일기'
  return (
    plazaName
      .replace(/\s*전원일기$/, '') // "강원 전원일기" → "강원"
      .replace(/광장$/, '')        // 레거시 "춘천광장" → "춘천"
      .trim() || '전원일기'
  )
}

/**
 * 도(道) id → 정식 지명. 허브/카드에서 "강원 전원일기" 대신 "강원도" 로 표시.
 * (DB name 은 그대로 두고 표시만 변환 — 라이브 DB 마이그레이션 불필요)
 */
const PROVINCE_NAMES: Record<string, string> = {
  gangwon: '강원도',
  gyeonggi: '경기도',
  chungbuk: '충청북도',
  chungnam: '충청남도',
  jeonbuk: '전라북도',
  jeonnam: '전라남도',
  gyeongbuk: '경상북도',
  gyeongnam: '경상남도',
  jeju: '제주도',
}

export function provinceName(
  id: string | null | undefined,
  fallbackName?: string | null,
): string {
  if (id && PROVINCE_NAMES[id]) return PROVINCE_NAMES[id]
  return plazaCityName(fallbackName)
}

/**
 * 도(道)별 자연색 — 허브 카드 그라데이션 배경.
 * 농촌 톤 (산·논·황토·바다·유채) — 단조로운 진녹 통일 대신 도별 정체감.
 * 각 도는 [from, mid, to] 다크 그라데이션 (흰 글씨 대비 충분).
 */
const PROVINCE_COLORS: Record<string, { from: string; mid: string; to: string; chip: string }> = {
  // 강원 — 솔잎/산악 짙은 녹
  gangwon:   { from: "#3a7a4d", mid: "#225a39", to: "#143524", chip: "#6ee7b7" },
  // 경기 — 논 노란 황금
  gyeonggi:  { from: "#c19143", mid: "#8e6526", to: "#4f3815", chip: "#fde68a" },
  // 충북 — 황토/내륙
  chungbuk:  { from: "#c08758", mid: "#8a5a32", to: "#52341a", chip: "#fed7aa" },
  // 충남 — 서해 청록
  chungnam:  { from: "#4f8492", mid: "#345b66", to: "#1d343a", chip: "#a5d8e0" },
  // 전북 — 벼 익은 황금
  jeonbuk:   { from: "#b88a3b", mid: "#84621f", to: "#473511", chip: "#fcd34d" },
  // 전남 — 대나무/소나무
  jeonnam:   { from: "#5a9050", mid: "#3a6c33", to: "#1f3f1c", chip: "#bbf7d0" },
  // 경북 — 안동 짙은 녹
  gyeongbuk: { from: "#2f6135", mid: "#1f4225", to: "#102214", chip: "#86efac" },
  // 경남 — 남해 청록
  gyeongnam: { from: "#4d8a7e", mid: "#326056", to: "#1a3631", chip: "#99e9d3" },
  // 제주 — 유채/감귤
  jeju:      { from: "#d9a93b", mid: "#a87b1f", to: "#5e430f", chip: "#fed94f" },
}

const DEFAULT_PROVINCE_COLOR = PROVINCE_COLORS.gangwon

export function provinceColors(id?: string | null) {
  if (id && PROVINCE_COLORS[id]) return PROVINCE_COLORS[id]
  return DEFAULT_PROVINCE_COLOR
}

/**
 * 도별 배경 사진 — 허브 카드에 농촌 사진 배경으로 사용.
 * 웹: /images/xxx.jpg, 앱: require() 로 매핑 (앱은 별도 상수)
 */
const PROVINCE_PHOTOS: Record<string, string> = {
  gangwon:   '/images/province-gangwon.jpg',
  gyeonggi:  '/images/province-gyeonggi.jpg',
  chungbuk:  '/images/province-chungbuk.jpg',
  chungnam:  '/images/province-chungnam.jpg',
  jeonbuk:   '/images/province-jeonbuk.jpg',
  jeonnam:   '/images/province-jeonnam.jpg',
  gyeongbuk: '/images/province-gyeongbuk.jpg',
  gyeongnam: '/images/province-gyeongnam.jpg',
  jeju:      '/images/province-jeju.jpg',
}

export function provincePhoto(id?: string | null): string {
  if (id && PROVINCE_PHOTOS[id]) return PROVINCE_PHOTOS[id]
  return '/images/province-gangwon.jpg'
}
