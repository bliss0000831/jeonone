import type { ClubStatus, ClubSkillLevel } from './types'

const SPORT_EMOJI: Record<string, string> = {
  러닝: '🏃',
  배드민턴: '🏸',
  축구: '⚽',
  농구: '🏀',
  테니스: '🎾',
  등산: '⛰️',
  수영: '🏊',
  자전거: '🚴',
  요가: '🧘',
  헬스: '💪',
  기타: '🎯',
}

export function getSportEmoji(sportType: string): string {
  return SPORT_EMOJI[sportType] || '🎯'
}

const SKILL_COLOR: Record<ClubSkillLevel, string> = {
  누구나: 'bg-primary/10 text-primary',
  초급: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  중급: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  고급: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

export function getSkillColor(level: ClubSkillLevel): string {
  return SKILL_COLOR[level] || 'bg-secondary text-secondary-foreground'
}

export function getStatusLabel(status: ClubStatus): string {
  const map: Record<ClubStatus, string> = {
    recruiting: '모집중',
    full: '마감',
    closed: '종료',
  }
  return map[status] || status
}

export function formatMembersRatio(current: number, max: number): string {
  return `${current}/${max}명`
}

/** 모임 정원 비율 (UI 진행 바) */
export function memberFillPct(current: number, max: number): number {
  if (max <= 0) return 0
  return Math.min(100, Math.max(0, (current / max) * 100))
}
