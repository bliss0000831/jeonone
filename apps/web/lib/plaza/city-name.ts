/**
 * 광장 이름 → 도시명 추출 헬퍼.
 *   "춘천광장"   → "춘천"
 *   "강릉광장"   → "강릉"
 *   "공주세종광장" → "공주세종"
 *
 * UI 의 "춘천 · 우리 동네 부동산" 같은 라벨에서 도시명 부분을 동적으로 채우는 용도.
 */
export function plazaCityName(plazaName: string | null | undefined): string {
  if (!plazaName) return '광장'
  return plazaName.replace(/광장$/, '').trim() || '광장'
}
