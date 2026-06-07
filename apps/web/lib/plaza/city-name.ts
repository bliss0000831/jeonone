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
