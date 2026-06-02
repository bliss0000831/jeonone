import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * "오늘 / 어제 / N일 전 / N주 전 / N개월 전" 형식의 상대 시간.
 *   카드 footer 전반에서 공통 사용.
 */
export function formatTimeAgo(date: string | Date | null | undefined): string {
  if (!date) return ""
  const d = typeof date === "string" ? new Date(date) : date
  const diff = Date.now() - d.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days < 0) return ""
  if (days === 0) return "오늘"
  if (days === 1) return "어제"
  if (days < 7) return `${days}일 전`
  if (days < 30) return `${Math.floor(days / 7)}주 전`
  return `${Math.floor(days / 30)}개월 전`
}

/**
 * 위치 표시에서 시·도 접두사 제거.
 *   "강원특별자치도 춘천시 동내면" → "춘천시 동내면"
 *   "서울특별시 마포구 망원동" → "마포구 망원동"
 *   "경기도 분당구 정자동" → "분당구 정자동"
 */
export function stripRegionPrefix(s: string | null | undefined): string {
  if (!s) return ""
  return s.replace(
    /^(강원특별자치도|강원도|서울특별시|서울시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|세종시|경기도|충청북도|충청남도|충북|충남|전라북도|전라남도|전북|전남|경상북도|경상남도|경북|경남|제주특별자치도|제주도)\s*/,
    "",
  )
}
