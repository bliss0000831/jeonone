/**
 * 홈 화면 유틸 함수.
 */
import { CLUB_THEMES, CLUB_DEFAULT, type Property } from "./constants"

export function txColor(t: string): string {
  if (t === "매매") return "#dc2626"
  if (t === "전세") return "#2563eb"
  if (t === "월세") return "#16a34a"
  if (t === "단기") return "#7c3aed"
  if (t === "전월세") return "#0891b2"
  return "#64748b"
}

export function formatPropertyPrice(p: Property): string {
  const tt = p.transaction_type
  const price = p.price ?? 0
  const monthly = (p as any).monthly_rent
  if (tt === "월세" && monthly != null) {
    // web 형식: "보증금/월세" — 예: "2,000만원/100만원"
    return `${price.toLocaleString()}만원/${Number(monthly).toLocaleString()}만원`
  }
  if (tt === "월세") {
    return `월세 ${price.toLocaleString()}만원`
  }
  if (price >= 10000) {
    const eok = Math.floor(price / 10000)
    const man = price % 10000
    return man === 0 ? `${eok}억` : `${eok}억 ${man.toLocaleString()}만원`
  }
  return `${price.toLocaleString()}만원`
}

export function formatPostedAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "방금"
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  if (day === 1) return "어제"
  if (day < 7) return `${day}일 전`
  if (day < 30) return `${Math.floor(day / 7)}주 전`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}개월 전`
  return `${Math.floor(mo / 12)}년 전`
}

export function stripRegionPrefix(addr: string): string {
  // 강원특별자치도 / 강원도 / 서울특별시 등 prefix 제거
  return addr.replace(/^(강원특별자치도|강원도|서울특별시|경기도|충청남도|충청북도|전라남도|전라북도|경상남도|경상북도|제주특별자치도|인천광역시|부산광역시|대구광역시|대전광역시|광주광역시|울산광역시|세종특별자치시)\s*/, "")
}

export function pickClubTheme(title: string): { emoji: string; gradient: [string, string]; thumb: string } {
  for (const t of CLUB_THEMES) {
    if (t.keywords.some((k) => title.includes(k))) {
      return { emoji: t.emoji, gradient: t.gradient, thumb: t.thumb }
    }
  }
  return CLUB_DEFAULT
}

export function timeAgo(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return "방금"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`
  return `${Math.floor(diff / 86_400_000)}일 전`
}

export function formatHolmesPrice(p: any): string | null {
  if (!p) return null
  const min = p.price_min ?? p.min_price ?? p.price
  const max = p.price_max ?? p.max_price
  if (min == null && max == null) return null
  const fmt = (n: number) => `${Number(n).toLocaleString()}만원`
  if (min != null && max != null && min !== max) {
    return `${Number(min).toLocaleString()}~${fmt(Number(max))}`
  }
  if (min != null) return fmt(Number(min))
  if (max != null) return fmt(Number(max))
  return null
}
