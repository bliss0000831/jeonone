import type { GroupBuyingStatus } from './types'

export function formatPrice(value: number): string {
  return `${value.toLocaleString()}원`
}

export function formatDiscount(original: number, group: number): string {
  if (original <= 0 || group > original) return ''
  const pct = Math.round(((original - group) / original) * 100)
  return `-${pct}%`
}

export function getStatusLabel(status: GroupBuyingStatus): string {
  const map: Record<GroupBuyingStatus, string> = {
    recruiting: '모집중',
    full: '정원마감',
    pending_payment: '결제대기',
    group_confirmed: '성사',
    cancelled: '취소',
    completed: '완료',
  }
  return map[status] || status
}

export function formatDeadline(deadline: string | null): string {
  if (!deadline) return '마감일 없음'
  const d = new Date(deadline)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  if (diffMs < 0) return '마감'
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days === 0) return '오늘 마감'
  if (days === 1) return '내일 마감'
  return `${days}일 남음`
}

export function fillPercent(current: number, max: number | null): number {
  if (!max || max <= 0) return 0
  return Math.min(100, Math.max(0, (current / max) * 100))
}
