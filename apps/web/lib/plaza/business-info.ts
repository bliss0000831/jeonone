/**
 * 광장별 사업자 정보 (통신판매중개자 면책고지 / 약관 사업자란).
 *
 * - DB: plazas.business_info JSONB
 * - 관리자 페이지에서 입력 → 약관·푸터·면책 띠에 자동 주입
 * - 광장별 격리 (slug → 행 1개)
 *
 * 비어있는 값은 빈 문자열로 통일. 어떤 필드든 채워지지 않은 상태일 수 있으므로
 * 렌더 시점에 안전한 폴백 처리를 해야 함.
 */
import { createClient } from '@/lib/supabase/server'
import { getCurrentPlaza } from './server'

export type BusinessInfo = {
  business_name: string      // 상호 (예: '광장')
  ceo_name: string           // 대표자명
  business_number: string    // 사업자등록번호 (000-00-00000)
  mailorder_number: string   // 통신판매업 신고번호
  address: string            // 사업장 소재지
  phone: string              // 대표전화
  email: string              // 대표이메일
  job_info_number: string    // 직업정보제공사업 신고번호 (구인구직 운영 시)
  privacy_officer: string    // 개인정보 보호책임자
}

export const EMPTY_BUSINESS_INFO: BusinessInfo = {
  business_name: '',
  ceo_name: '',
  business_number: '',
  mailorder_number: '',
  address: '',
  phone: '',
  email: '',
  job_info_number: '',
  privacy_officer: '',
}

/** 채워지지 않은 필드는 '[미등록]' 폴백. 약관 등 사람이 읽는 곳에서 사용. */
export function withFallback(info: BusinessInfo, fallback = '[미등록]'): BusinessInfo {
  const out = { ...info }
  ;(Object.keys(out) as (keyof BusinessInfo)[]).forEach((k) => {
    if (!out[k] || out[k].trim().length === 0) out[k] = fallback
  })
  return out
}

/** 사업자 정보가 의미있게 채워졌는지 (최소 상호+대표자+사업자번호) */
export function isBusinessInfoFilled(info: BusinessInfo): boolean {
  return !!(info.business_name?.trim() && info.ceo_name?.trim() && info.business_number?.trim())
}

function normalize(raw: unknown): BusinessInfo {
  if (!raw || typeof raw !== 'object') return EMPTY_BUSINESS_INFO
  const r = raw as Record<string, unknown>
  return {
    business_name:    typeof r.business_name === 'string' ? r.business_name : '',
    ceo_name:         typeof r.ceo_name === 'string' ? r.ceo_name : '',
    business_number:  typeof r.business_number === 'string' ? r.business_number : '',
    mailorder_number: typeof r.mailorder_number === 'string' ? r.mailorder_number : '',
    address:          typeof r.address === 'string' ? r.address : '',
    phone:            typeof r.phone === 'string' ? r.phone : '',
    email:            typeof r.email === 'string' ? r.email : '',
    job_info_number:  typeof r.job_info_number === 'string' ? r.job_info_number : '',
    privacy_officer:  typeof r.privacy_officer === 'string' ? r.privacy_officer : '',
  }
}

/** 특정 광장의 사업자 정보. 없으면 빈 객체. */
export async function getPlazaBusinessInfo(plazaId: string | null): Promise<BusinessInfo> {
  if (!plazaId) return EMPTY_BUSINESS_INFO
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('plazas')
      .select('business_info')
      .eq('id', plazaId)
      .single()
    return normalize((data as { business_info?: unknown } | null)?.business_info)
  } catch {
    return EMPTY_BUSINESS_INFO
  }
}

/** 현재 요청 광장의 사업자 정보. 허브면 빈 객체. */
export async function getCurrentPlazaBusinessInfo(): Promise<BusinessInfo> {
  const plaza = await getCurrentPlaza()
  return getPlazaBusinessInfo(plaza)
}
