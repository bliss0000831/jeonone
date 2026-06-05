/**
 * 마이페이지 역할 설정 — 광장 web 의 components/profile/role-config.ts 1:1 매핑.
 *
 * 매핑:
 *   - lucide icon → ionicons name (역할 뱃지/탭)
 *   - tailwind badge class → RN 색
 *   - tailwind cover gradient → 색 배열 [from, via, to]
 *   - sidebar blocks: intro/stats/verify/specialties/hours/serviceAreas/contact (역할별 노출 매트릭스)
 *   - POSTS_CATEGORIES_BY_ROLE / ROLE_EXCLUDE_FROM_POSTS — posts 탭 칩/필터
 */

export type AccountType =
  | "user" | "business" | "producer"

export type ProfileTabId =
  | "posts" | "products"
  | "saved" | "info"

export interface ProfileTabDef {
  id: ProfileTabId
  label: string
  icon: string
}

/** 사이드바 블록 노출 매트릭스 (info 탭) */
export interface SidebarBlocks {
  intro: boolean
  stats: boolean
  verify: boolean
  specialties: boolean
  hours: boolean
  serviceAreas: boolean
  contact: boolean
}

export interface RoleConfig {
  type: AccountType
  label: string
  shortLabel?: string
  iconName: string
  badgeBg: string
  /** 뱃지 글자색 */
  badgeFg: string
  coverColors: [string, string, string]
  tabs: ProfileTabDef[]
  sidebar: SidebarBlocks
  extraCta?: Array<"call" | "inquiry">
}

const POSTS_TAB: ProfileTabDef = {
  id: "posts", label: "게시물", icon: "document-text-outline",
}

const baseSidebar: SidebarBlocks = {
  intro: true, stats: false, verify: false,
  specialties: false, hours: false, serviceAreas: false, contact: true,
}

export const ROLE_CONFIG: Record<AccountType, RoleConfig> = {
  user: {
    type: "user", label: "일반",
    iconName: "person-outline",
    badgeBg: "#f1f5f9", badgeFg: "#475569",
    coverColors: ["#a5f3fc", "#bae6fd", "#a7f3d0"],
    tabs: [POSTS_TAB],
    sidebar: { ...baseSidebar, intro: true },
  },
  business: {
    type: "business", label: "사장님",
    iconName: "storefront-outline",
    badgeBg: "#f97316", badgeFg: "#ffffff",
    coverColors: ["#fcd34d", "#fdba74", "#fda4af"],
    tabs: [POSTS_TAB],
    sidebar: { ...baseSidebar, intro: true, hours: true, serviceAreas: true, verify: true },
    extraCta: ["call"],
  },
  producer: {
    type: "producer", label: "로컬푸드 생산자", shortLabel: "생산자",
    iconName: "leaf-outline",
    badgeBg: "#22c55e", badgeFg: "#ffffff",
    coverColors: ["#bef264", "#86efac", "#34d399"],
    tabs: [
      { id: "products", label: "상품", icon: "leaf-outline" },
      POSTS_TAB,
    ],
    sidebar: { ...baseSidebar, intro: true, verify: true, specialties: true, serviceAreas: true },
    extraCta: ["inquiry"],
  },
}

export function resolveRole(accountType: string | null | undefined): RoleConfig {
  return ROLE_CONFIG[(accountType || "user") as AccountType] ?? ROLE_CONFIG.user
}

export function tabsForSelf(role: RoleConfig): ProfileTabDef[] {
  // 웹 tabsForMode 의 self 분기와 동일 라벨 변환
  const renamed = role.tabs.map((t) => {
    if (t.id === "products") return { ...t, label: "내 상품" }
    if (t.id === "posts") return { ...t, label: "내 글" }
    return t
  })
  // self 모드: 찜 추가 + 모두에게 정보 추가 (웹과 동일)
  return [
    ...renamed,
    { id: "saved", label: "찜", icon: "heart-outline" },
    { id: "info", label: "정보", icon: "information-circle-outline" },
  ]
}

// ─── Posts 탭 카테고리 칩 (역할별) ──────────────────────────

export type PostsCategory = { key: string; label: string }

export const BASE_POSTS_CATEGORIES: PostsCategory[] = [
  { key: "all",          label: "전체" },
  { key: "secondhand",   label: "농기구" },
  { key: "local_food",   label: "로컬푸드" },
  { key: "jobs",         label: "일손" },
  { key: "board",        label: "마을소식" },
  { key: "sharing",      label: "나눔" },
]

export const POSTS_CATEGORIES_BY_ROLE: Record<AccountType, PostsCategory[]> = {
  user:     BASE_POSTS_CATEGORIES,
  producer: BASE_POSTS_CATEGORIES,
  business: BASE_POSTS_CATEGORIES,
}

/**
 * 역할별로 "내 글" 에서 빼야 할 UnifiedPost.kind 목록.
 * 역할 전용 콘텐츠는 자기 탭 (products) 에 이미 있어 중복 방지.
 */
export const ROLE_EXCLUDE_FROM_POSTS: Record<AccountType, string[]> = {
  user:     [],
  producer: ["local_food"],    // products 탭
  business: [],
}

// ─── Saved 탭 카테고리 칩 ───────────────────────────────────

export const SAVED_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: "all",          label: "전체" },
  { key: "secondhand",   label: "농기구" },
  { key: "local_food",   label: "로컬푸드" },
  { key: "sharing",      label: "나눔" },
  { key: "board",        label: "마을소식" },
]
