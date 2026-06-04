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
  | "user" | "business" | "agent" | "producer"
  | "interior" | "moving" | "cleaning" | "repair"

export type ProfileTabId =
  | "posts" | "listings" | "products" | "portfolio" | "services"
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
    tabs: [
      { id: "products", label: "메뉴/상품", icon: "storefront-outline" },
      POSTS_TAB,
    ],
    sidebar: { ...baseSidebar, intro: true, hours: true, serviceAreas: true, verify: true },
    extraCta: ["call"],
  },
  agent: {
    type: "agent", label: "공인중개사", shortLabel: "중개사",
    iconName: "business-outline",
    badgeBg: "#3b82f6", badgeFg: "#ffffff",
    coverColors: ["#60a5fa", "#22d3ee", "#34d399"],
    tabs: [
      { id: "listings", label: "매물", icon: "business-outline" },
      POSTS_TAB,
    ],
    sidebar: { ...baseSidebar, intro: true, stats: true, verify: true, specialties: true, serviceAreas: true },
    extraCta: ["call", "inquiry"],
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
  interior: {
    type: "interior", label: "인테리어",
    iconName: "color-palette-outline",
    badgeBg: "#a855f7", badgeFg: "#ffffff",
    coverColors: ["#d6d3d1", "#d4d4d8", "#a3a3a3"],
    tabs: [
      { id: "portfolio", label: "포트폴리오", icon: "color-palette-outline" },
      POSTS_TAB,
    ],
    sidebar: { ...baseSidebar, intro: true, stats: true, verify: true, specialties: true, serviceAreas: true },
    extraCta: ["call", "inquiry"],
  },
  moving: {
    type: "moving", label: "이사 전문가", shortLabel: "이사",
    iconName: "car-outline",
    badgeBg: "#eab308", badgeFg: "#ffffff",
    coverColors: ["#fde047", "#fcd34d", "#fdba74"],
    tabs: [
      { id: "services", label: "서비스", icon: "car-outline" },
      POSTS_TAB,
    ],
    sidebar: { ...baseSidebar, intro: true, stats: true, verify: true, specialties: true, serviceAreas: true },
    extraCta: ["call", "inquiry"],
  },
  cleaning: {
    type: "cleaning", label: "청소 전문가", shortLabel: "청소",
    iconName: "sparkles-outline",
    badgeBg: "#ec4899", badgeFg: "#ffffff",
    coverColors: ["#bae6fd", "#a5f3fc", "#bfdbfe"],
    tabs: [
      { id: "services", label: "서비스", icon: "sparkles-outline" },
      POSTS_TAB,
    ],
    sidebar: { ...baseSidebar, intro: true, stats: true, verify: true, specialties: true, serviceAreas: true },
    extraCta: ["call", "inquiry"],
  },
  repair: {
    type: "repair", label: "수리 전문가", shortLabel: "수리",
    iconName: "build-outline",
    badgeBg: "#ea580c", badgeFg: "#ffffff",
    coverColors: ["#cbd5e1", "#d1d5db", "#a1a1aa"],
    tabs: [
      { id: "services", label: "서비스", icon: "build-outline" },
      POSTS_TAB,
    ],
    sidebar: { ...baseSidebar, intro: true, stats: true, verify: true, specialties: true, serviceAreas: true },
    extraCta: ["call", "inquiry"],
  },
}

export function resolveRole(accountType: string | null | undefined): RoleConfig {
  return ROLE_CONFIG[(accountType || "user") as AccountType] ?? ROLE_CONFIG.user
}

export function tabsForSelf(role: RoleConfig): ProfileTabDef[] {
  // 웹 tabsForMode 의 self 분기와 동일 라벨 변환
  const renamed = role.tabs.map((t) => {
    if (t.id === "listings") return { ...t, label: "내 매물" }
    if (t.id === "products") {
      return role.type === "business"
        ? { ...t, label: "내 메뉴·상품" }
        : { ...t, label: "내 상품" }
    }
    if (t.id === "services") return { ...t, label: "내 서비스" }
    if (t.id === "portfolio") return { ...t, label: "내 포트폴리오" }
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
  agent:    BASE_POSTS_CATEGORIES.filter((c) => c.key !== "property"),
  producer: BASE_POSTS_CATEGORIES,
  business: BASE_POSTS_CATEGORIES,
  interior: BASE_POSTS_CATEGORIES,
  moving:   BASE_POSTS_CATEGORIES,
  cleaning: BASE_POSTS_CATEGORIES,
  repair:   BASE_POSTS_CATEGORIES,
}

/**
 * 역할별로 "내 글" 에서 빼야 할 UnifiedPost.kind 목록.
 * 역할 전용 콘텐츠는 자기 탭 (listings/portfolio/services/products) 에 이미 있어 중복 방지.
 */
export const ROLE_EXCLUDE_FROM_POSTS: Record<AccountType, string[]> = {
  user:     [],
  agent:    ["property"],      // 매물 탭
  producer: ["local_food"],    // products 탭
  business: ["group_buying"],  // products 탭 (메뉴/상품)
  interior: ["interior"],      // portfolio 탭
  moving:   ["moving"],        // services 탭
  cleaning: ["cleaning"],      // services 탭
  repair:   ["repair"],        // services 탭
}

// ─── Saved 탭 카테고리 칩 ───────────────────────────────────

export const SAVED_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: "all",          label: "전체" },
  { key: "property",     label: "부동산" },
  { key: "interior",     label: "홈즈" }, // interior + moving + cleaning + repair 합산
  { key: "sharing",      label: "나눔" },
  { key: "group_buying", label: "공동구매" },
  { key: "local_food",   label: "로컬푸드" },
  { key: "new_store",    label: "신장개업" },
  { key: "club",         label: "모임" },
  { key: "board",        label: "게시판" },
]

/** "홈즈" 카테고리에 포함되는 kinds */
export const INTERIOR_GROUP = ["interior", "moving", "cleaning", "repair"]
