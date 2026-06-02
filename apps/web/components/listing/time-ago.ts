/**
 * 한국어 상대 시간 표시 — "33분 전", "3시간 전", "어제", "3일 전".
 */
export function timeAgoKo(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return ''
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  if (Number.isNaN(d.getTime())) return ''
  const diffMs = Date.now() - d.getTime()
  if (diffMs < 0) return '방금'
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return '방금 전'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  if (day === 1) return '어제'
  if (day < 7) return `${day}일 전`
  const week = Math.floor(day / 7)
  if (week < 5) return `${week}주 전`
  const month = Math.floor(day / 30)
  if (month < 12) return `${month}달 전`
  return `${Math.floor(day / 365)}년 전`
}

/** 가격 포매팅 — "70,000원", "무료", "협의" 등 */
export function formatPriceKo(
  price: number | null | undefined,
  options?: { freeLabel?: string; suffix?: string },
): string {
  if (price == null) return ''
  if (price === 0) return options?.freeLabel ?? '무료'
  return `${price.toLocaleString()}원${options?.suffix ?? ''}`
}
