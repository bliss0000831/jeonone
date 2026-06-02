import type { JoinInput } from './types'

export interface ValidationError {
  field: string
  message: string
}

export function validateJoinInput(input: Partial<JoinInput>): ValidationError[] {
  const errors: ValidationError[] = []

  if (typeof input.quantity !== 'number' || input.quantity < 1 || input.quantity > 99) {
    errors.push({ field: 'quantity', message: '수량은 1~99 사이' })
  }

  if (input.receive_method !== 'pickup' && input.receive_method !== 'delivery') {
    errors.push({ field: 'receive_method', message: '수령 방식을 선택해주세요' })
  }

  if (input.receive_method === 'delivery') {
    if (!input.recipient_name) errors.push({ field: 'recipient_name', message: '받는 분 이름' })
    if (!input.recipient_phone) errors.push({ field: 'recipient_phone', message: '연락처' })
    if (!input.recipient_address) errors.push({ field: 'recipient_address', message: '주소' })
  }

  return errors
}
