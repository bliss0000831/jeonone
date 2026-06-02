/**
 * 상대 시간 포맷 — "방금", "3분 전", "2시간 전", "어제", "5일 전", "2주 전", "3개월 전", "1년 전"
 *
 * 4개+ 파일에서 중복 정의되어 있었던 함수를 통합.
 */
export function relativeDate(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  if (diffMs < 0) return d.toLocaleDateString("ko-KR")
  const days = Math.floor(diffMs / 86_400_000)
  if (days === 0) {
    const min = Math.floor(diffMs / 60_000)
    if (min < 1) return "방금"
    if (min < 60) return `${min}분 전`
    const hr = Math.floor(min / 60)
    return `${hr}시간 전`
  }
  if (days === 1) return "어제"
  if (days < 7) return `${days}일 전`
  if (days < 30) return `${Math.floor(days / 7)}주 전`
  if (days < 365) return `${Math.floor(days / 30)}개월 전`
  return `${Math.floor(days / 365)}년 전`
}
