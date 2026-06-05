import {
  User, Store, Leaf,
  FileText, Heart, Info,
  type LucideIcon,
} from "lucide-react"

export type AccountType =
  | "user"
  | "business"
  | "producer"

export type ProfileTabId =
  // 공개 탭
  | "posts"           // 게시물 (모든 직책 공통)
  | "listings"        // 매물 (중개사)
  | "products"        // 상품/메뉴 (사장님, 생산자)
  | "portfolio"       // 포트폴리오 (인테리어)
  | "services"        // 서비스 (이사/청소/수리)
  | "reviews"         // 후기
  | "moim"            // 모임
  | "gift"            // 나눔
  | "group-buying"    // 공구
  // 마이페이지 전용
  | "saved"           // 찜
  | "chats"           // 채팅
  // 모바일 전용 (사이드바 내용)
  | "info"            // 정보 (소개/지표/인증/전문분야/영업시간/지역)

export interface ProfileTabDef {
  id: ProfileTabId
  label: string
  icon: LucideIcon
  /** "self" → 마이페이지에만 · "other" → 타인 프로필에만 · 생략 시 양쪽 모두 */
  mode?: "self" | "other"
  /** true 면 lg 이상 뷰포트에서 숨김 (모바일/태블릿 전용) */
  mobileOnly?: boolean
}

export interface SidebarBlocks {
  intro: boolean         // "소개" 블록
  stats: boolean         // 응답률/거래건수 등
  verify: boolean        // 인증 뱃지
  specialties: boolean   // 전문분야 / 서비스 범위
  hours: boolean         // 영업시간
  serviceAreas: boolean  // 서비스 지역
  contact: boolean       // 연락처(전화/웹사이트/카카오톡)
}

export interface RoleConfig {
  type: AccountType
  label: string                    // "공인중개사"
  shortLabel?: string              // 뱃지용 짧은 라벨 (생략 시 label)
  icon: LucideIcon
  badgeClass: string               // "bg-blue-500 text-white"
  coverGradient: string            // Tailwind gradient class
  tabs: ProfileTabDef[]            // 기본 탭 순서 (self 모드에선 뒤에 saved/chats 자동 추가)
  sidebar: SidebarBlocks
  defaultHighlights: string[]      // 하이라이트 시드 (사용자가 수정 가능)
  /** 타인 프로필에서 노출될 CTA 추가 액션 (메시지/팔로우/공유는 공통) */
  extraCta?: Array<"call" | "inquiry">
}

const baseSidebar: SidebarBlocks = {
  intro: true,
  stats: false,
  verify: false,
  specialties: false,
  hours: false,
  serviceAreas: false,
  contact: true,
}

// reviewsTab 제거 — 후기는 신뢰지수 카운터 클릭 시 모달로 표시
const postsTab: ProfileTabDef = { id: "posts", label: "게시물", icon: FileText }

export const ROLE_CONFIG: Record<AccountType, RoleConfig> = {
  // 1. 일반인
  user: {
    type: "user",
    label: "일반",
    icon: User,
    badgeClass: "bg-secondary text-secondary-foreground border border-border",
    coverGradient: "bg-gradient-to-br from-cyan-200 via-sky-200 to-emerald-200",
    // 일반인: "내 글" 단일 탭 (안에서 권한 카테고리 필터로 분기)
    // → tabsForMode 에서 self 모드일 때 "찜" 추가 + 모두에게 "정보" 추가
    //   최종: 내 글 / 찜 / 정보
    tabs: [postsTab],
    sidebar: { ...baseSidebar, intro: true },
    defaultHighlights: [],
  },

  // 2. 사장님
  business: {
    type: "business",
    label: "사장님",
    icon: Store,
    badgeClass: "bg-orange-500 text-white",
    coverGradient: "bg-gradient-to-br from-amber-300 via-orange-300 to-rose-300",
    tabs: [postsTab],
    sidebar: { ...baseSidebar, intro: true, hours: true, serviceAreas: true, verify: true },
    defaultHighlights: ["영업중", "메뉴", "이벤트", "찾아오시는길"],
    extraCta: ["call"],
  },

  // 3. 생산자 (로컬푸드)
  producer: {
    type: "producer",
    label: "로컬푸드 생산자",
    shortLabel: "생산자",
    icon: Leaf,
    badgeClass: "bg-green-500 text-white",
    coverGradient: "bg-gradient-to-br from-lime-300 via-green-300 to-emerald-400",
    tabs: [
      { id: "products", label: "상품", icon: Leaf },
      postsTab,
    ],
    sidebar: { ...baseSidebar, intro: true, verify: true, specialties: true, serviceAreas: true },
    defaultHighlights: ["제철", "예약주문", "농장일지", "레시피"],
    extraCta: ["inquiry"],
  },
}

export function resolveRole(accountType: string | null | undefined): RoleConfig {
  const key = (accountType || "user") as AccountType
  return ROLE_CONFIG[key] ?? ROLE_CONFIG.user
}

/** 모드·뷰포트별 탭 구성
 *  - self 모드: 찜/채팅 자동 추가
 *  - 모바일에선 "정보" 탭(사이드바 콘텐츠) 자동 추가 (mobileOnly 플래그로 lg+에서 숨김)
 */
export function tabsForMode(role: RoleConfig, mode: "self" | "other"): ProfileTabDef[] {
  const base = role.tabs
    .filter((t) => !t.mode || t.mode === mode)
    .map((t) => {
      // self: 역할 전용 탭 라벨에 "내 " prefix 를 붙여 소유감 강조
      //  - listings(매물) → 내 매물
      //  - products(메뉴/상품) → 내 메뉴·상품  (business)
      //  - products(상품)     → 내 상품        (producer)
      //  - services(서비스)   → 내 서비스      (이사/청소/수리)
      //  - portfolio           → 내 포트폴리오 (interior)
      //  - posts(게시물)       → 내 글
      if (mode === "self") {
        if (t.id === "listings") return { ...t, label: "내 매물" }
        if (t.id === "products") {
          // business: "메뉴/상품" → "내 메뉴·상품"
          // producer: "상품" → "내 상품"
          return role.type === "business"
            ? { ...t, label: "내 메뉴·상품" }
            : { ...t, label: "내 상품" }
        }
        if (t.id === "services") return { ...t, label: "내 서비스" }
        if (t.id === "portfolio") return { ...t, label: "내 포트폴리오" }
        if (t.id === "posts" && t.label === "게시물") return { ...t, label: "내 글" }
        return t
      }
      if (t.id === "posts" && t.label === "게시물") return { ...t, label: "글" }
      return t
    })
  const tail: ProfileTabDef[] = []
  if (mode === "self") {
    tail.push({ id: "saved", label: "찜", icon: Heart, mode: "self" })
  }
  // 정보 탭: 모든 뷰포트에서 노출 (모바일과 동일한 단일 컬럼 UX 유지)
  tail.push({ id: "info", label: "정보", icon: Info })
  return [...base, ...tail]
}
