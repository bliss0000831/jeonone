/**
 * Property 표시용 포맷터.
 *
 * 컴포넌트가 호출하는 순수 함수. side effect 없음.
 * 같은 입력 → 같은 출력 (테스트 친화).
 */

import type { Property } from './types'

/**
 * 가격 포맷 — 거래 유형별로 다르게.
 *
 * 예:
 *   매매 5억 5000만 → "5억 5,000만원"
 *   전세 5000만 → "5,000만원"
 *   월세 보증금 1000만 / 월세 50만 → "1,000만원/50만원"
 */
export function formatPropertyPrice(p: Pick<Property, 'price' | 'transactionType' | 'deposit' | 'monthlyRent'>): string {
  if (p.transactionType === '월세') {
    const depositStr = formatManwon(p.deposit ?? 0)
    const rentStr = formatManwon(p.monthlyRent ?? 0)
    return `${depositStr}/${rentStr}`
  }
  return formatManwon(p.price)
}

/**
 * 만원 단위 숫자 → 한국식 표기.
 *
 *   12345 → "1억 2,345만원"
 *   500   → "500만원"
 *   0     → "0만원"
 */
export function formatManwon(value: number): string {
  if (!value && value !== 0) return ''
  if (value >= 10000) {
    const uk = Math.floor(value / 10000)
    const man = value % 10000
    return man > 0 ? `${uk}억 ${man.toLocaleString()}만원` : `${uk}억`
  }
  return `${value.toLocaleString()}만원`
}

/**
 * 면적 포맷 — m² + 평수 동시.
 *
 *   85 → "85㎡ (25.7평)"
 */
export function formatArea(sqm: number): string {
  const py = (sqm * 0.3025).toFixed(1)
  return `${sqm}㎡ (${py}평)`
}

/**
 * 등록일 → "오늘" / "어제" / "N일 전" / "N주 전" / "YYYY-MM-DD"
 */
export function formatPostedAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days === 0) return '오늘'
  if (days === 1) return '어제'
  if (days < 7) return `${days}일 전`
  if (days < 30) return `${Math.floor(days / 7)}주 전`
  return `${Math.floor(days / 30)}개월 전`
}

/**
 * 거래 유형 뱃지 색상.
 */
export function getTransactionBadgeColor(type: string): string {
  switch (type) {
    case '매매':
      return 'bg-primary text-primary-foreground'
    case '전세':
      return 'bg-amber-500 text-white'
    case '월세':
      return 'bg-rose-500 text-white'
    default:
      return 'bg-secondary text-secondary-foreground'
  }
}

/**
 * 매물 상태 라벨.
 */
export function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    active: '판매중',
    reserved: '예약중',
    completed: '거래완료',
    sold: '거래완료',
    hidden: '숨김',
  }
  return map[status] || status
}
