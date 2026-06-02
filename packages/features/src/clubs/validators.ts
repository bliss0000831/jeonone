import type { ClubCreateInput, ClubSkillLevel } from './types'

export interface ValidationError {
  field: string
  message: string
}

const SKILL_LEVELS: ClubSkillLevel[] = ['누구나', '초급', '중급', '고급']

export function validateClubInput(input: Partial<ClubCreateInput>): ValidationError[] {
  const errors: ValidationError[] = []

  if (!input.title || input.title.trim().length === 0) {
    errors.push({ field: 'title', message: '제목을 입력해주세요' })
  } else if (input.title.length > 100) {
    errors.push({ field: 'title', message: '제목은 100자 이내' })
  }

  if (!input.sport_type) {
    errors.push({ field: 'sport_type', message: '종목을 선택해주세요' })
  }

  if (!input.skill_level || !SKILL_LEVELS.includes(input.skill_level)) {
    errors.push({ field: 'skill_level', message: '실력 수준을 선택해주세요' })
  }

  if (typeof input.max_members !== 'number' || input.max_members < 2 || input.max_members > 100) {
    errors.push({ field: 'max_members', message: '정원은 2~100명 사이' })
  }

  return errors
}
