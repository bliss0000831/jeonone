/**
 * Service Requests (도와주세요) 도메인 — fetcher 어댑터 주입 + Supabase 호출 혼합.
 *
 * 광장 web /service-requests/[id] 는 /api/service-requests/[id] 를 호출하므로
 * RN 도 같은 엔드포인트를 gwangjangFetch 로 호출 (Bearer 자동).
 * - GET    /api/service-requests/[id]            → { request, responses }
 * - POST   /api/service-requests                 → 새 요청 작성
 * - POST   /api/service-requests/[id]/responses  → 새 응답 작성
 * - PATCH  /api/service-requests/[id]            → 수정 / 상태 변경
 * - DELETE /api/service-requests/[id]            → 삭제
 *
 * 응답 작성·삭제·상태변경 권한 검사는 서버 라우트에서 처리.
 */

export type ServiceRequestStatus = "open" | "matched" | "closed"

export const SERVICE_TYPES = ["interior", "moving", "cleaning", "repair"] as const
export type ServiceType = (typeof SERVICE_TYPES)[number]

export const SERVICE_TYPE_LABEL: Record<ServiceType, string> = {
  interior: "인테리어",
  moving: "이사",
  cleaning: "청소",
  repair: "수리",
}

export interface ServiceRequest {
  id: string
  user_id: string
  title: string
  content: string
  service_type: ServiceType
  region: string | null
  district: string | null
  dong: string | null
  budget_min: number | null
  budget_max: number | null
  desired_date: string | null
  status: ServiceRequestStatus
  views: number
  created_at: string
  author: {
    id: string
    nickname: string | null
    full_name: string | null
    avatar_url: string | null
    account_type: string | null
  } | null
}

export interface ServiceRequestResponse {
  id: string
  user_id: string
  content: string
  created_at: string
  author: {
    id: string
    nickname: string | null
    full_name: string | null
    avatar_url: string | null
    account_type: string | null
  } | null
}

/**
 * 새 서비스 요청 작성 입력.
 * budgetMin/Max 는 "원" 단위 — UI 가 만원 단위 입력을 받으면 곱해서 보낼 것.
 */
export interface ServiceRequestCreateInput {
  title: string
  content: string
  serviceType: ServiceType
  region?: string | null
  district?: string | null
  dong?: string | null
  budgetMin?: number | null
  budgetMax?: number | null
  desiredDate?: string | null
}

interface FetchAdapter {
  (input: string, init?: RequestInit): Promise<Response>
}

export async function getServiceRequest(
  fetcher: FetchAdapter,
  id: string,
): Promise<{ request: ServiceRequest | null; responses: ServiceRequestResponse[] }> {
  try {
    const r = await fetcher(`/api/service-requests/${id}`)
    if (!r.ok) return { request: null, responses: [] }
    const data = await r.json()
    return {
      request: (data.request as ServiceRequest) ?? null,
      responses: (data.responses as ServiceRequestResponse[]) ?? [],
    }
  } catch {
    return { request: null, responses: [] }
  }
}

export async function createServiceRequest(
  fetcher: FetchAdapter,
  input: ServiceRequestCreateInput,
): Promise<{ ok: boolean; postId?: string; error?: string }> {
  try {
    const r = await fetcher("/api/service-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title.trim(),
        content: input.content.trim(),
        serviceType: input.serviceType,
        region: input.region ?? null,
        district: input.district ?? null,
        dong: input.dong ?? null,
        budgetMin: input.budgetMin ?? null,
        budgetMax: input.budgetMax ?? null,
        desiredDate: input.desiredDate ?? null,
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: data?.error || "요청 등록 실패" }
    return { ok: true, postId: data?.request?.id }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "처리에 실패했습니다" }
  }
}

export async function createServiceRequestResponse(
  fetcher: FetchAdapter,
  id: string,
  content: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetcher(`/api/service-requests/${id}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      return { ok: false, error: j?.error || "응답 실패" }
    }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "응답 실패" }
  }
}

/** 서비스 요청 수정 — PATCH /api/service-requests/[id]. */
export async function updateServiceRequest(
  fetcher: FetchAdapter,
  id: string,
  input: ServiceRequestCreateInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetcher(`/api/service-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title.trim(),
        content: input.content.trim(),
        serviceType: input.serviceType,
        region: input.region ?? null,
        district: input.district ?? null,
        dong: input.dong ?? null,
        budgetMin: input.budgetMin ?? null,
        budgetMax: input.budgetMax ?? null,
        desiredDate: input.desiredDate ?? null,
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: data?.error || "처리에 실패했습니다" }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "처리에 실패했습니다" }
  }
}

export async function setServiceRequestStatus(
  fetcher: FetchAdapter,
  id: string,
  status: ServiceRequestStatus,
): Promise<boolean> {
  try {
    const r = await fetcher(`/api/service-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    return r.ok
  } catch {
    return false
  }
}

export async function deleteServiceRequest(
  fetcher: FetchAdapter,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetcher(`/api/service-requests/${id}`, { method: "DELETE" })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      return { ok: false, error: j?.error || "삭제 실패" }
    }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "삭제 실패" }
  }
}

/** 예산 포맷터 (web 의 formatBudget 1:1 미러) */
export function formatBudget(min: number | null, max: number | null): string {
  const fmt = (n: number) => {
    if (n >= 100_000_000)
      return `${(n / 100_000_000).toFixed(n % 100_000_000 === 0 ? 0 : 1)}억`
    if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만원`
    return `${n.toLocaleString()}원`
  }
  if (min && max) return `${fmt(min)} ~ ${fmt(max)}`
  if (min) return `${fmt(min)} 이상`
  if (max) return `${fmt(max)} 이하`
  return "예산 협의"
}
