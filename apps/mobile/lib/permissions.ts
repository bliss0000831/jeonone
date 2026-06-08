/**
 * 도메인별 등록 권한 매핑.
 *
 * 웹/모바일 공용 의도 — RegisterSheet 의 roles 와 1:1.
 * basePath 키로 조회 → null = 모든 로그인 사용자 가능, 배열 = 해당 account_type 만.
 *
 * 사용처:
 *   - apps/mobile/components/DomainListScreen.tsx (상단 + 버튼 노출 제어)
 *   - apps/mobile/components/RegisterSheet.tsx (등록 시트 카드 필터)
 */

export type AccountType =
  | "user"
  | "agent"
  | "producer"
  | "business"
  | "interior"
  | "moving"
  | "cleaning"
  | "repair"

const NON_AGENT_ROLES: AccountType[] = [
  "user",
  "producer",
  "business",
  "interior",
  "moving",
  "cleaning",
  "repair",
]

const ALL_ROLES: AccountType[] = [...NON_AGENT_ROLES, "agent"]

/**
 * basePath → 허용된 account_type 목록. null = 로그인 사용자 모두 가능.
 *
 * 전원일기: 권한 구분 없이 모든 로그인 사용자가 모든 도메인에 등록 가능
 * (관리자는 canRegisterDomain 의 isAdmin 으로 항상 통과). 옛 광장의 역할별
 * 잠금(producer/business 등)은 제거 — 누구나 로컬푸드·농기구·일손 등록 가능.
 */
export const DOMAIN_REGISTER_ROLES: Record<string, AccountType[] | null> = {
  "/local-food": null,
  "/secondhand": null,
  "/jobs": null,
  "/sharing": null,
  "/board": null,
  "/auction": null,
  "/rental": null,
  "/clubs": null,
  "/group-buying": null,
  "/property": null,
  "/requests": null,
  "/service-requests": null,
}

export function normalizeAccountType(raw: string | null | undefined): AccountType {
  if (!raw) return "user"
  // DB 의 'individual' 은 'user' 로 정규화 (web 1:1)
  if (raw === "individual") return "user"
  return (raw as AccountType)
}

/** admin/superadmin 은 모두 통과. 그 외는 매핑 검사. */
export function canRegisterDomain(
  basePath: string,
  accountType: string | null | undefined,
  opts: { isAdmin?: boolean } = {},
): boolean {
  if (opts.isAdmin) return true
  const allowed = DOMAIN_REGISTER_ROLES[basePath]
  if (allowed === undefined) return false // 알 수 없는 도메인 — 보수적으로 차단
  if (allowed === null) return true // 공용 도메인
  return allowed.includes(normalizeAccountType(accountType))
}
