import type { AccountType, Role } from './types'

const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  individual: '일반인',
  business: '사장님',
  agent: '공인중개사',
  producer: '생산자',
  interior: '인테리어',
  moving: '이사',
  cleaning: '청소',
  repair: '수리',
}

const ACCOUNT_TYPE_BADGE_COLOR: Record<AccountType, string> = {
  individual: 'bg-gray-500',
  business: 'bg-emerald-500',
  agent: 'bg-blue-500',
  producer: 'bg-green-500',
  interior: 'bg-purple-500',
  moving: 'bg-yellow-500',
  cleaning: 'bg-pink-500',
  repair: 'bg-orange-500',
}

const ROLE_LABEL: Record<Role, string> = {
  user: '일반',
  admin: '관리자',
  superadmin: '슈퍼관리자',
  expert: '전문가',
}

export function getAccountTypeLabel(type: AccountType | null): string {
  if (!type) return '일반인'
  return ACCOUNT_TYPE_LABEL[type] || '일반인'
}

export function getAccountTypeBadgeColor(type: AccountType | null): string {
  if (!type) return 'bg-gray-500'
  return ACCOUNT_TYPE_BADGE_COLOR[type] || 'bg-gray-500'
}

export function getRoleLabel(role: Role | null): string {
  if (!role) return '일반'
  return ROLE_LABEL[role] || role
}

export function maskPhone(phone: string | null): string {
  if (!phone) return ''
  // 010-1234-5678 → 010-****-5678
  return phone.replace(/(\d{2,3})-?(\d{3,4})-?(\d{4})/, '$1-****-$3')
}

/**
 * 입력 중 자동 하이픈 — 010-1234-5678 / 010-123-4567 / 02-123-4567.
 * 숫자만 추출 후 자릿수에 따라 하이픈 삽입.
 */
export function formatPhoneInput(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '').slice(0, 11)
  if (!digits) return ''
  // 02 (서울) 예외
  if (digits.startsWith('02')) {
    if (digits.length <= 2) return digits
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`
    if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`
  }
  // 010 / 011 / 070 ...
  if (digits.length <= 3) return digits
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`
}

/**
 * 닉네임 + 실명 (있으면) 표시.
 * 예: "닉네임 (홍길동)"
 */
export function formatDisplayName(profile: { nickname: string | null; full_name: string | null }): string {
  const nick = profile.nickname || '익명'
  if (!profile.full_name) return nick
  return `${nick} (${profile.full_name})`
}
