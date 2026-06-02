/**
 * 사업자 정보 조회 — account_type_requests에서 가장 최근 승인된 요청의 사업자 정보 반환.
 */
export interface BusinessInfo {
  business_name: string | null
  business_number: string | null
  registration_number: string | null
  office_address: string | null
  contact_phone: string | null
  requested_type: string
}

export async function getBusinessInfo(supabase: any, userId: string): Promise<BusinessInfo | null> {
  const { data } = await supabase
    .from('account_type_requests')
    .select('business_name, business_number, registration_number, office_address, contact_phone, requested_type')
    .eq('user_id', userId)
    .eq('status', 'approved')
    .order('reviewed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data || (!data.business_name && !data.business_number && !data.office_address)) return null
  return data as BusinessInfo
}
