/**
 * 한국식 가격 표기 — 어르신 가독성용.
 *   15,000,000 → "1,500만원"
 *   100,000,000 → "1억"
 *   150,000,000 → "1억 5,000만원"
 *   8,500       → "8,500원"
 *   0 / null    → "가격제안"
 *
 * 이유: 8자리 숫자(1,500만원=15,000,000)는 어르신이 자리수 못 셈.
 * 만/억 한글 단위가 한국 농촌 문화권에서 가장 직관적.
 */
export function formatPriceKR(price: number | null | undefined): string {
  if (!price || price <= 0) return "가격제안"
  if (price >= 100_000_000) {
    const eok = Math.floor(price / 100_000_000)
    const man = Math.floor((price % 100_000_000) / 10_000)
    return man === 0 ? `${eok}억` : `${eok}억 ${man.toLocaleString()}만원`
  }
  if (price >= 10_000) {
    return `${(price / 10_000).toLocaleString(undefined, { maximumFractionDigits: 0 })}만원`
  }
  return `${price.toLocaleString()}원`
}

/**
 * 날짜 표기 — 어르신 친화 (상대 + 절대 병기).
 *   24시간 이내 → "3시간 전"
 *   7일 이내 → "3일 전 (6/4)"
 *   그 외 → "6/4" (작년 이상이면 "2025/6/4")
 */
export function formatDateKR(dateStr: string | null | undefined): string {
  if (!dateStr) return ""
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ""
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const min = Math.floor(diffMs / 60_000)
  const hr = Math.floor(diffMs / 3_600_000)
  const day = Math.floor(diffMs / 86_400_000)
  const md = `${d.getMonth() + 1}/${d.getDate()}`
  if (min < 60) return min <= 1 ? "방금 전" : `${min}분 전`
  if (hr < 24) return `${hr}시간 전`
  if (day < 7) return `${day}일 전 (${md})`
  if (d.getFullYear() === now.getFullYear()) return md
  return `${d.getFullYear()}/${md}`
}
