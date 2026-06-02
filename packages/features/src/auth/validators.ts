import type { AccountType, Role } from './types'

const ACCOUNT_TYPES: AccountType[] = [
  'individual',
  'business',
  'agent',
  'producer',
  'interior',
  'moving',
  'cleaning',
  'repair',
]

const ROLES: Role[] = ['user', 'admin', 'superadmin', 'expert']

export function isValidAccountType(value: unknown): value is AccountType {
  return typeof value === 'string' && ACCOUNT_TYPES.includes(value as AccountType)
}

export function isValidRole(value: unknown): value is Role {
  return typeof value === 'string' && ROLES.includes(value as Role)
}

/**
 * location 컨트롤 문자 / 위험 문자 sanitize.
 * 한글/숫자/하이픈/공백 유지.
 */
export function sanitizeLocation(input: string): string {
  return input.replace(/[<>"'\x00-\x1f]/g, '').trim().slice(0, 200)
}
