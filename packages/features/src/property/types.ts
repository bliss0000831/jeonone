/**
 * Property 도메인 타입.
 *
 * UI 표시용 타입 (Property) 은 types/app.ts 에 이미 있음.
 * 여기는 features 내부에서 쓰는 보조 타입 / DB row 타입을 정리.
 */

// 핵심 도메인 타입 재export (M6: @/types/app → @gwangjang/types/app)
export type { Property, DbProperty } from '@gwangjang/types/app'

/** 매물 등록 폼 입력 */
export interface PropertyCreateInput {
  title: string
  property_type: string
  transaction_type: '매매' | '전세' | '월세' | '단기임대'
  price: number
  monthly_rent?: number | null
  maintenance_fee?: number | null
  deposit?: number | null
  area_sqm: number
  floor_info?: string | null
  total_floors?: number | null
  rooms: number
  bathrooms: number
  address: string
  lat?: number | null
  lng?: number | null
  description?: string | null
  images: string[]
  features?: string[]
  direction?: string | null
  parking?: boolean
  elevator?: boolean
  pet_allowed?: boolean
  move_in_date?: string | null
  instagram_post_url?: string | null
  youtube_post_url?: string | null
}

// DB enum 기준 통일: types/app.ts 의 PropertyStatus 와 일치시킴
export type PropertyStatus = 'active' | 'reserved' | 'completed' | 'hidden'

export interface PropertyFilter {
  plaza?: string
  region?: string
  property_type?: string
  transaction_type?: string
  price_min?: number
  price_max?: number
  area_min?: number
  area_max?: number
  rooms?: number
  status?: PropertyStatus
}
