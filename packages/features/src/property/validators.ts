/**
 * Property 입력 검증.
 *
 * 라우트의 POST/PATCH 진입 시점에 호출. 사용자 친화 에러 메시지 반환.
 */

import type { PropertyCreateInput } from './types'

export interface ValidationError {
  field: string
  message: string
}

const TRANSACTION_TYPES = ['매매', '전세', '월세', '단기임대'] as const

/**
 * 매물 등록 입력 검증.
 * 통과 = 빈 배열. 위반 = 필드별 메시지 list.
 */
export function validatePropertyInput(input: Partial<PropertyCreateInput>): ValidationError[] {
  const errors: ValidationError[] = []

  if (!input.title || input.title.trim().length === 0) {
    errors.push({ field: 'title', message: '제목을 입력해주세요' })
  } else if (input.title.length > 100) {
    errors.push({ field: 'title', message: '제목은 100자 이내로 입력해주세요' })
  }

  if (!input.transaction_type || !TRANSACTION_TYPES.includes(input.transaction_type as any)) {
    errors.push({ field: 'transaction_type', message: '거래 유형을 선택해주세요' })
  }

  if (typeof input.price !== 'number' || input.price < 0) {
    errors.push({ field: 'price', message: '가격을 정확히 입력해주세요' })
  }

  if (input.transaction_type === '월세') {
    if (typeof input.monthly_rent !== 'number' || input.monthly_rent < 0) {
      errors.push({ field: 'monthly_rent', message: '월세를 입력해주세요' })
    }
  }

  if (typeof input.area_sqm !== 'number' || input.area_sqm <= 0) {
    errors.push({ field: 'area_sqm', message: '면적을 입력해주세요' })
  }

  if (typeof input.rooms !== 'number' || input.rooms < 0) {
    errors.push({ field: 'rooms', message: '방 개수를 입력해주세요' })
  }

  if (!input.address || input.address.trim().length === 0) {
    errors.push({ field: 'address', message: '주소를 입력해주세요' })
  }

  if (!Array.isArray(input.images) || input.images.length === 0) {
    errors.push({ field: 'images', message: '사진을 1장 이상 업로드해주세요' })
  } else if (input.images.length > 20) {
    errors.push({ field: 'images', message: '사진은 최대 20장까지 등록 가능합니다' })
  }

  return errors
}

/**
 * 검증 통과 시 throw, 실패 시 첫 에러 메시지 throw.
 * 라우트에서 try/catch 로 잡아 400 응답.
 */
export function assertPropertyInput(input: Partial<PropertyCreateInput>): asserts input is PropertyCreateInput {
  const errors = validatePropertyInput(input)
  if (errors.length > 0) {
    throw new ValidationException(errors)
  }
}

export class ValidationException extends Error {
  constructor(public readonly errors: ValidationError[]) {
    super(errors[0]?.message || '입력값이 올바르지 않습니다')
    this.name = 'ValidationException'
  }
}
