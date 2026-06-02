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

/** basePath → 허용된 account_type 목록. null = 로그인 사용자 모두 가능. */
export const DOMAIN_REGISTER_ROLES: Record<string, AccountType[] | null> = {
  "/property": ALL_ROLES, // 매물 — agent 분기는 register 화면에서 처리
  "/requests": NON_AGENT_ROLES,
  "/service-requests": NON_AGENT_ROLES,
  "/local-food": ["producer"],
  "/group-buying": ["business"],
  "/interior": ["interior"],
  "/moving": ["moving"],
  "/cleaning": ["cleaning"],
  "/repair": ["repair"],
  "/new-store": ["business"],
  // 모든 로그인 사용자 공통
  "/board": null,
  "/sharing": null,
  "/secondhand": null,
  "/jobs": null,
  "/clubs": null,
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
