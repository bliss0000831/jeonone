/**
 * Property Requests (매물 요청) 도메인 — fetcher 어댑터 주입 + Supabase 호출 혼합.
 *
 * 광장 web /requests/[id] 는 /api/property-requests/[id] 를 호출하므로
 * RN 도 같은 엔드포인트를 gwangjangFetch 로 호출 (Bearer 자동).
 * - GET    /api/property-requests/[id]            → { request, responses }
 * - POST   /api/property-requests/[id]/responses  → 새 응답 작성
 * - PATCH  /api/property-requests/[id]            → 상태 변경
 * - DELETE /api/property-requests/[id]            → 삭제
 *
 * 응답 작성·삭제·상태변경 권한 검사는 서버 라우트에서 처리.
 */

export type RequestStatus = "open" | "matched" | "closed"

export interface PropertyRequest {
  id: string
  user_id: string
  title: string
  content: string
  region: string | null
  district: string | null
  dong: string | null
  property_type: string | null
  transaction_type: string | null
  budget_min: number | null
  budget_max: number | null
  move_in_date: string | null
  status: RequestStatus
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

export interface RequestResponse {
  id: string
  user_id: string
  content: string
  property_id: string | null
  created_at: string
  author: {
    id: string
    nickname: string | null
    full_name: string | null
    avatar_url: string | null
    account_type: string | null
  } | null
}

interface FetchAdapter {
  (input: string, init?: RequestInit): Promise<Response>
}

export async function getPropertyRequest(
  fetcher: FetchAdapter,
  id: string,
): Promise<{ request: PropertyRequest | null; responses: RequestResponse[] }> {
  try {
    const r = await fetcher(`/api/property-requests/${id}`)
    if (!r.ok) return { request: null, responses: [] }
    const data = await r.json()
    return {
      request: (data.request as PropertyRequest) ?? null,
      responses: (data.responses as RequestResponse[]) ?? [],
    }
  } catch {
    return { request: null, responses: [] }
  }
}

export async function createRequestResponse(
  fetcher: FetchAdapter,
  id: string,
  content: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetcher(`/api/property-requests/${id}/responses`, {
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

export async function setRequestStatus(
  fetcher: FetchAdapter,
  id: string,
  status: RequestStatus,
): Promise<boolean> {
  try {
    const r = await fetcher(`/api/property-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    return r.ok
  } catch {
    return false
  }
}

export async function deletePropertyRequest(
  fetcher: FetchAdapter,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetcher(`/api/property-requests/${id}`, { method: "DELETE" })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      return { ok: false, error: j?.error || "삭제 실패" }
    }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "삭제 실패" }
  }
}

/**
 * 새 매물 요청 작성 — 광장 web POST /api/property-requests 와 동일 엔드포인트.
 * 공인중개사(account_type='agent') 는 작성 불가 — 서버에서 차단.
 *
 * budgetMin/Max 는 "원" 단위 — UI 가 만원 단위 입력을 받으면 곱해서 보낼 것.
 */
export interface PropertyRequestCreateInput {
  title: string
  content: string
  region?: string | null
  district?: string | null
  dong?: string | null
  propertyType?: string | null
  transactionType?: string | null
  budgetMin?: number | null
  budgetMax?: number | null
  moveInDate?: string | null
}

/** 매물 요청 수정 — PATCH /api/property-requests/[id]. */
export async function updatePropertyRequest(
  fetcher: FetchAdapter,
  id: string,
  input: PropertyRequestCreateInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetcher(`/api/property-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title.trim(),
        content: input.content.trim(),
        region: input.region ?? null,
        district: input.district ?? null,
        dong: input.dong ?? null,
        propertyType: input.propertyType ?? null,
        transactionType: input.transactionType ?? null,
        budgetMin: input.budgetMin ?? null,
        budgetMax: input.budgetMax ?? null,
        moveInDate: input.moveInDate ?? null,
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: data?.error || "처리에 실패했습니다" }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "처리에 실패했습니다" }
  }
}

export async function createPropertyRequest(
  fetcher: FetchAdapter,
  input: PropertyRequestCreateInput,
): Promise<{ ok: boolean; postId?: string; error?: string }> {
  try {
    const r = await fetcher("/api/property-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title.trim(),
        content: input.content.trim(),
        region: input.region ?? null,
        district: input.district ?? null,
        dong: input.dong ?? null,
        propertyType: input.propertyType ?? null,
        transactionType: input.transactionType ?? null,
        budgetMin: input.budgetMin ?? null,
        budgetMax: input.budgetMax ?? null,
        moveInDate: input.moveInDate ?? null,
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: data?.error || "요청 등록 실패" }
    return { ok: true, postId: data?.request?.id }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "처리에 실패했습니다" }
  }
}

export const REQUEST_PROPERTY_TYPES = [
  "아파트", "빌라", "오피스텔", "원룸", "투룸", "주택", "상가", "사무실", "토지",
] as const

export const REQUEST_TRANSACTION_TYPES = ["매매", "전세", "월세"] as const

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
