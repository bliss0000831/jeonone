/**
 * 인증 신청 도메인 — verification_requests + account_type_requests.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export type VerifyType = "phone" | "business" | "agent" | "producer" | "service"

export interface VerifyRequest {
  id: string
  type: VerifyType
  status: "pending" | "approved" | "rejected"
  reject_reason: string | null
  data: Record<string, any>
  documents: string[]
  created_at: string
}

export async function listVerifyRequests(
  supabase: SupabaseClient,
  userId: string,
): Promise<VerifyRequest[]> {
  const { data } = await supabase
    .from("verification_requests")
    .select("id, type, status, reject_reason, data, documents, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
  return (data ?? []) as VerifyRequest[]
}

export async function createVerifyRequest(
  supabase: SupabaseClient,
  args: {
    userId: string
    type: VerifyType
    data: Record<string, any>
    documents: string[]
  },
): Promise<VerifyRequest> {
  const { data, error } = await supabase
    .from("verification_requests")
    .insert({
      user_id: args.userId,
      type: args.type,
      status: "pending",
      data: args.data,
      documents: args.documents,
    })
    .select()
    .single()
  if (error) throw error
  return data as VerifyRequest
}

// ─── 계정 유형 신청 (account-upgrade) ──────────────────

export type RequestedType =
  | "agent" | "business" | "producer"
  | "interior" | "moving" | "cleaning" | "repair"

/**
 * 계정 유형 신청 — account_type_requests 테이블 행.
 *
 * 실제 DB 컬럼:
 *   id, user_id, requested_type, previous_type, status,
 *   business_name, business_number, office_address, contact_phone, intro,
 *   business_cert_urls, license_urls, extra_docs_urls,
 *   admin_note, reviewed_at, reviewed_by, submitted_at, updated_at, plaza_id
 */
export interface AccountTypeRequest {
  id: string
  requested_type: RequestedType
  previous_type: string | null
  status: "pending" | "approved" | "rejected" | "cancelled"
  business_name: string | null
  business_number: string | null
  office_address: string | null
  contact_phone: string | null
  intro: string | null
  business_cert_urls: string[] | null
  license_urls: string[] | null
  extra_docs_urls: string[] | null
  admin_note: string | null
  submitted_at: string
}

export async function listAccountTypeRequests(
  supabase: SupabaseClient,
  userId: string,
): Promise<AccountTypeRequest[]> {
  const { data } = await supabase
    .from("account_type_requests")
    .select(
      "id, requested_type, previous_type, status, business_name, business_number, office_address, contact_phone, intro, business_cert_urls, license_urls, extra_docs_urls, admin_note, submitted_at",
    )
    .eq("user_id", userId)
    .order("submitted_at", { ascending: false })
  return (data ?? []) as AccountTypeRequest[]
}

/**
 * 계정 유형 신청 생성.
 *
 * 보안 참고: 가능하면 모바일에서도 /api/account-upgrade POST 를 호출하는 것을 권장합니다.
 * 서버 사이드 API 는 R2 URL 소유권 검증, rate limit, ban guard 등 추가 보안 로직을 제공합니다.
 */
export async function createAccountTypeRequest(
  supabase: SupabaseClient,
  args: {
    userId: string
    requestedType: RequestedType
    previousType: string | null
    businessName: string
    businessNumber?: string
    officeAddress: string
    contactPhone?: string
    intro?: string
    businessCertUrls: string[]
    licenseUrls?: string[]
    extraDocsUrls?: string[]
  },
): Promise<AccountTypeRequest> {
  const { data, error } = await supabase
    .from("account_type_requests")
    .insert({
      user_id: args.userId,
      requested_type: args.requestedType,
      previous_type: args.previousType,
      status: "pending" as const,
      business_name: args.businessName,
      business_number: args.businessNumber || null,
      office_address: args.officeAddress,
      contact_phone: args.contactPhone || null,
      intro: args.intro || null,
      business_cert_urls: args.businessCertUrls,
      license_urls: args.licenseUrls ?? [],
      extra_docs_urls: args.extraDocsUrls ?? [],
    })
    .select()
    .single()
  if (error) throw error
  return data as AccountTypeRequest
}
