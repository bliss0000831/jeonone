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
