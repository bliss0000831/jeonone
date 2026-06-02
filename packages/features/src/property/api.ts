/**
 * Property 도메인 — Supabase 호출 / API 래퍼.
 *
 * 모든 함수는:
 *   - Supabase 클라이언트를 인자로 받음 (browser/server 구분 호출자에게 위임)
 *   - 광장 필터 의무 (plaza_id 없으면 throw 또는 return [])
 *   - 에러는 일반 메시지로 변환 (DB 에러 직접 노출 X)
 *
 * 빈 stub. 점진 이전.
 */

/**
 * Error handling: direct Supabase helpers throw on errors;
 * HTTP-fetcher wrappers (createPropertyPost, updatePropertyPost) return { ok, error } results (never throw).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Property, PropertyFilter, PropertyCreateInput } from './types'
import { getAuthorByPlaza } from '../profile/api'

/**
 * 매물 목록 조회.
 *
 * TODO: 점진 이전 — 현재는 app/api/properties/route.ts 에 직접 작성됨.
 */
export async function listProperties(
  _supabase: SupabaseClient,
  _filter: PropertyFilter,
): Promise<Property[]> {
  throw new Error('not implemented — TODO migrate from app/api/properties/route.ts')
}

/**
 * 매물 단건 조회 — 작성자 프로필 + 찜 수 + 내가 찜했는지 함께 반환.
 *
 * 광장 web /property/[id]/page.tsx 의 fetch 로직과 동일.
 */
export async function getProperty(
  supabase: SupabaseClient,
  id: string,
  plaza: string | null,
  userId?: string | null,
): Promise<{
  property: any | null // TODO: type-safe — replace with DB row type from generated Supabase types
  profile: any | null // TODO: type-safe — replace with plaza profile type
  favoriteCount: number
  isFavorite: boolean
}> {
  let q = supabase.from('properties').select('*').eq('id', id)
  if (plaza) q = q.eq('plaza_id', plaza)
  const { data: property } = await q.single()
  if (!property) {
    return { property: null, profile: null, favoriteCount: 0, isFavorite: false }
  }

  // favorites 의 RLS 가 본인 row 만 SELECT 허용해서 직접 COUNT 하면 본인 찜만
  // 잡힘. SECURITY DEFINER RPC 로 우회해 전체 카운트 확보 (자기 글 찜도 정상 합산).
  // TODO: type-safe — narrow RPC return type once Supabase codegen types are available
  const favCountQ: any = supabase.rpc('get_property_favorite_counts', {
    p_plaza_id: plaza,
    p_property_ids: [id],
  })

  // TODO: type-safe — narrow conditional query type
  let userFavQ: any = userId
    ? (() => {
        // TODO: type-safe — replace with proper Supabase query builder type
        let qq: any = supabase
          .from('favorites')
          .select('id')
          .eq('user_id', userId)
          .eq('property_id', id)
        if (plaza) qq = qq.eq('plaza_id', plaza)
        return qq.maybeSingle()
      })()
    : Promise.resolve({ data: null })

  // 조회수 증가 — fire-and-forget
  void supabase.rpc('increment_view_count', {
    p_table: 'properties',
    p_id: id,
    p_column: 'views',
  })

  const [profile, favCountRes, userFavRes] = await Promise.all([
    // 🅲 광장 격리 — 글의 plaza_id 기준 plaza_profiles 우선
    getAuthorByPlaza(supabase, property.user_id, (property as any).plaza_id ?? plaza),
    favCountQ,
    userFavQ,
  ])

  const favRow = (favCountRes.data as any)?.[0]
  const favoriteCount = Number(favRow?.favorite_count ?? 0)

  return {
    property,
    profile: profile || null,
    favoriteCount,
    isFavorite: !!userFavRes.data,
  }
}

/** 찜 토글 (insert / delete) — 멱등 */
export async function toggleFavorite(
  supabase: SupabaseClient,
  args: { userId: string; propertyId: string; plazaId?: string | null; isFavorite: boolean },
): Promise<boolean> {
  if (args.isFavorite) {
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', args.userId)
      .eq('property_id', args.propertyId)
    if (error) throw error
    return false
  } else {
    const insert: Record<string, string> = {
      user_id: args.userId,
      property_id: args.propertyId,
    }
    if (args.plazaId) insert.plaza_id = args.plazaId
    const { error } = await supabase.from('favorites').insert(insert)
    // 멱등 — UNIQUE 위반 (23505) 도 success
    if (error && (error as any).code !== '23505') throw error
    return true
  }
}

/**
 * 매물 등록.
 */
export async function createProperty(
  _supabase: SupabaseClient,
  _userId: string,
  _plaza: string,
  _input: PropertyCreateInput,
): Promise<Property> {
  throw new Error('not implemented')
}

/**
 * 매물 수정.
 */
export async function updateProperty(
  _supabase: SupabaseClient,
  _id: string,
  _plaza: string,
  _patch: Partial<PropertyCreateInput>,
): Promise<Property> {
  throw new Error('not implemented')
}

/**
 * 매물 삭제. (R2 미디어 cleanup 은 server side cron 으로 처리)
 */
export async function deleteProperty(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from('properties').delete().eq('id', id)
  if (error) throw error
}

/**
 * 사용자의 이번 달 등록 매물 수 (월 한도 체크용).
 */
export async function countUserPropertiesThisMonth(
  _supabase: SupabaseClient,
  _userId: string,
): Promise<number> {
  throw new Error('not implemented')
}

/**
 * 새 매물 작성 — 광장 web POST /api/properties 와 동일.
 * 서버에서 plaza_id 자동, 월 한도 체크, agent/일반 권한 처리.
 *
 * RN 은 지도 위젯·panorama·instagram/youtube embed 는 미지원 — 핵심 필드만.
 */
export interface PropertyPostInput {
  title: string
  property_type: string
  transaction_type: string
  /** 매매/전세=매매가, 월세=보증금 */
  price: number
  /** 월세만 사용 */
  monthly_rent?: number | null
  maintenance_fee?: number | null
  area_sqm: number
  floor_info?: string | null
  total_floors?: number | null
  rooms?: number
  bathrooms?: number
  direction?: string | null
  parking?: boolean
  elevator?: boolean
  pet_allowed?: boolean
  move_in_date?: string | null
  address: string
  address_detail?: string | null
  lat?: number | null
  lng?: number | null
  description: string
  features?: string[] | null
  images?: string[] | null
  instagram_post_url?: string | null
  youtube_post_url?: string | null
  panorama_images?: Array<{ url: string; title?: string | null }> | null
}

interface PropFetchAdapter {
  (input: string, init?: RequestInit): Promise<Response>
}

/** 매물 수정 — PATCH /api/properties/[id]. */
export async function updatePropertyPost(
  fetcher: PropFetchAdapter,
  id: string,
  input: PropertyPostInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetcher(`/api/properties/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: input.title,
        property_type: input.property_type,
        transaction_type: input.transaction_type,
        price: input.price,
        monthly_rent: input.monthly_rent ?? null,
        maintenance_fee: input.maintenance_fee ?? null,
        area_sqm: input.area_sqm,
        floor_info: input.floor_info ?? null,
        total_floors: input.total_floors ?? null,
        rooms: input.rooms ?? 1,
        bathrooms: input.bathrooms ?? 1,
        direction: input.direction ?? null,
        parking: input.parking ?? false,
        elevator: input.elevator ?? false,
        pet_allowed: input.pet_allowed ?? false,
        move_in_date: input.move_in_date ?? null,
        address: input.address,
        address_detail: input.address_detail ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        description: input.description,
        features: input.features && input.features.length > 0 ? input.features : null,
        images: input.images && input.images.length > 0 ? input.images : null,
        instagram_post_url: input.instagram_post_url ?? null,
        youtube_post_url: input.youtube_post_url ?? null,
        panorama_images: input.panorama_images && input.panorama_images.length > 0 ? input.panorama_images : null,
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: data?.error || '처리에 실패했습니다' }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '처리에 실패했습니다' }
  }
}

export async function createPropertyPost(
  fetcher: PropFetchAdapter,
  input: PropertyPostInput,
): Promise<{
  ok: boolean
  postId?: string
  error?: string
  monthlyLimitExceeded?: boolean
}> {
  try {
    const r = await fetcher('/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: input.title,
        property_type: input.property_type,
        transaction_type: input.transaction_type,
        price: input.price,
        monthly_rent: input.monthly_rent ?? null,
        maintenance_fee: input.maintenance_fee ?? null,
        area_sqm: input.area_sqm,
        floor_info: input.floor_info ?? null,
        total_floors: input.total_floors ?? null,
        rooms: input.rooms ?? 1,
        bathrooms: input.bathrooms ?? 1,
        direction: input.direction ?? null,
        parking: input.parking ?? false,
        elevator: input.elevator ?? false,
        pet_allowed: input.pet_allowed ?? false,
        move_in_date: input.move_in_date ?? null,
        address: input.address,
        address_detail: input.address_detail ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        description: input.description,
        features: input.features && input.features.length > 0 ? input.features : null,
        images: input.images && input.images.length > 0 ? input.images : null,
        instagram_post_url: input.instagram_post_url ?? null,
        youtube_post_url: input.youtube_post_url ?? null,
        panorama_images: input.panorama_images && input.panorama_images.length > 0 ? input.panorama_images : null,
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      return {
        ok: false,
        monthlyLimitExceeded: data?.code === 'monthly_limit_exceeded',
        error: data?.error || '처리에 실패했습니다',
      }
    }
    return { ok: true, postId: data?.property?.id }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '처리에 실패했습니다' }
  }
}

export const PROPERTY_TYPES = [
  '아파트', '빌라', '오피스텔', '원룸', '투룸', '주택', '펜션', '상가', '사무실', '토지',
] as const

export const PROPERTY_TRANSACTION_TYPES = ['매매', '전세', '월세'] as const

export const PROPERTY_DIRECTIONS = [
  '남향', '동향', '서향', '북향', '남동향', '남서향', '북동향', '북서향',
] as const

export const PROPERTY_FEATURES = [
  '신축', '리모델링', '풀옵션', '에어컨', '냉장고', '세탁기',
  '인덕션', '베란다', '발코니', '드레스룸', '팬트리', '복층',
  '테라스', '마당', 'CCTV', '경비실', '24시간경비', '주차장',
  '엘리베이터', '반려동물가능', '즉시입주', '저층', '고층',
] as const
