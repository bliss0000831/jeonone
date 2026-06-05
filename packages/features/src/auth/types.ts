/**
 * Auth 도메인 타입.
 *
 * 세 계층:
 *   1. 일반 사용자 (Supabase Auth)
 *   2. 광장 어드민 (plaza_admins.role IN admin/moderator/super)
 *   3. 슈퍼 어드민 (super-admin cookie + TOTP)
 */

export type AccountType =
  | 'individual'
  | 'business'
  | 'producer'

export type Role = 'user' | 'admin' | 'superadmin' | 'expert'

export type PlazaAdminRole = 'admin' | 'moderator' | 'super'

export interface AuthProfile {
  id: string
  nickname: string | null
  full_name: string | null
  phone: string | null
  avatar_url: string | null
  account_type: AccountType | null
  role: Role | null
  location: string | null
  trust_score: number | null
  review_count: number | null
}

export interface AdminAuth {
  ok: boolean
  isLegacyAdmin: boolean
  isLegacySuper: boolean
  isSuperPlaza: boolean
  isAnyPlazaAdmin: boolean
  isGodMode: boolean
  plazaIds: string[]
}
