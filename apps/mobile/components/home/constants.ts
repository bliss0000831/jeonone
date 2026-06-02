/**
 * 홈 화면 모듈-스코프 상수 & 캐시.
 */
import type { NewsItem, WeatherData } from "@gwangjang/features/home"

// ── 타입 ───────────────────────────────────────────────────
export type SellerType = "all" | "agent" | "individual"

export interface Property {
  id: string
  title: string
  price: number
  property_type: string
  transaction_type: string
  area: number | null
  address: string | null
  images: string[] | null
  views: number
  likes: number
  status: string
  user_id: string
  seller_type: string | null
  created_at: string
  effective_at: string | null
  is_featured: boolean | null
}

export interface DomainPost {
  id: string
  title: string
  images?: string[] | null
  thumbnail?: string | null
  price?: number | null
  group_price?: number | null
  original_price?: number | null
  store_name?: string | null
  category?: string | null
  status?: string
  created_at?: string
}

export interface SortOption {
  value:
    | "latest"
    | "priceAsc"
    | "priceDesc"
    | "areaDesc"
    | "areaAsc"
    | "pricePerArea"
    | "views"
    | "likes"
  label: string
}

export interface BannerData {
  id: string
  title: string
  subtitle: string
  description: string
  image_url?: string | null
  href: string
  opacity?: number | null
  gradient?: string | null
}

// ── 모듈 스코프 캐시 — 탭 전환/홈 언마운트 후에도 유지되어 지역 변경 시 즉시 표시. ──
export const REGION_NEWS_CACHE: Record<string, NewsItem[]> = {}
export const REGION_NEWS_INFLIGHT: Record<string, Promise<NewsItem[]> | undefined> = {}
export const REGION_WEATHER_CACHE: Record<string, WeatherData> = {}
export const REGION_WEATHER_INFLIGHT: Record<string, Promise<WeatherData | null> | undefined> = {}

// 인라인 배너 데이터 — 광장 web defaultBanners 동등 (api-client 워크스페이스 dep 회피)
export const DEFAULT_BANNERS: BannerData[] = [
  { id: "0", title: "춘천광장", subtitle: "더 나은 집, 더 가까운 이웃", description: "호수의 도시 춘천에서 따뜻한 이웃을 만나세요", href: "/", image_url: null },
  { id: "1", title: "우리동네 매물", subtitle: "춘천시 부동산 정보를 한눈에", description: "전세, 월세, 매매까지 신뢰할 수 있는 매물 정보", href: "/property", image_url: null },
  { id: "2", title: "동네 모임", subtitle: "함께하는 즐거움", description: "운동, 취미, 동호회 모임을 한 곳에서", href: "/clubs", image_url: null },
  { id: "3", title: "공동구매", subtitle: "이웃과 함께 더 저렴하게", description: "공동구매로 알뜰하게 장보기", href: "/group-buying", image_url: null },
  { id: "4", title: "로컬푸드", subtitle: "신선한 동네 농산물", description: "춘천 농가 직거래로 더 신선하게", href: "/local-food", image_url: null },
]

// web defaultBanners.gradient (from-X-700 via-Y-600 to-Z-600) Tailwind 매핑
// emerald-700/teal-600/cyan-600, slate-700/gray-600/zinc-600 등 — 광장 web 정독
export const HERO_GRADIENTS: [string, string, string][] = [
  ["#047857", "#0d9488", "#0891b2"], // emerald-700 → teal-600 → cyan-600 (춘천광장)
  ["#1e40af", "#2563eb", "#0ea5e9"], // blue-800 → blue-600 → sky-500 (매물)
  ["#7c3aed", "#9333ea", "#c026d3"], // violet-700 → purple-600 → fuchsia-600 (모임)
  ["#dc2626", "#f97316", "#facc15"], // red-600 → orange-500 → yellow-400 (공구)
  ["#15803d", "#16a34a", "#84cc16"], // green-700 → green-600 → lime-500 (로컬푸드)
]

export const SORT_OPTIONS: SortOption[] = [
  { value: "latest", label: "최신순" },
  { value: "priceAsc", label: "가격낮은순" },
  { value: "priceDesc", label: "가격높은순" },
  { value: "areaDesc", label: "면적넓은순" },
  { value: "areaAsc", label: "면적좁은순" },
  { value: "pricePerArea", label: "평당가낮은순" },
  { value: "views", label: "조회순" },
  { value: "likes", label: "찜많은순" },
]

// 8 도메인 hub — 광장 web CategoryMiniNav 정독 미러 (apps/web/components/home-page.tsx line 415+)
// items 배열 lucide-react 아이콘 / ICON_COLORS Tailwind 600 톤 1:1 매핑
//   board: MessageSquare → chatbubbles
//   secondhand: ShoppingCart → cart   (이전에 bag-handle 이었음 — 수정)
//   local-food: Leaf → leaf
//   group-buying: Users → people      (이전에 cart 이었음 — 수정)
//   jobs: Briefcase → briefcase
//   new-store: Store → storefront
//   sharing: HandHeart → heart        (이전에 gift 이었음 — 수정)
//   clubs: UserCircle2 → person-circle (이전에 people 이었음 — 수정)
export const HUB_ITEMS = [
  { href: "/board" as const,        icon: "chatbubbles",   label: "커뮤니티", color: "#0284c7" }, // sky-600
  { href: "/secondhand" as const,   icon: "cart",          label: "중고거래", color: "#d97706" }, // amber-600
  { href: "/local-food" as const,   icon: "leaf",          label: "로컬푸드", color: "#0d9488" }, // teal-600
  { href: "/group-buying" as const, icon: "people",        label: "공동구매", color: "#e11d48" }, // rose-600
  { href: "/jobs" as const,         icon: "briefcase",     label: "구인구직", color: "#4f46e5" }, // indigo-600
  { href: "/new-store" as const,    icon: "storefront",    label: "신장개업", color: "#ea580c" }, // orange-600
  { href: "/sharing" as const,      icon: "heart",         label: "나눔",     color: "#059669" }, // emerald-600
  { href: "/clubs" as const,        icon: "person-circle", label: "모임",     color: "#9333ea" }, // purple-600
]

// ── 모임 카테고리 placeholder — 제목 키워드 기반 vivid 그라디언트 + 컬러 이모지 ──
//   (단조로운 단색 아이콘 대신 OS 이모지로 카테고리 즉시 식별)
export const CLUB_THEMES: { keywords: string[]; emoji: string; gradient: [string, string]; thumb: string }[] = [
  // 운동
  { keywords: ["축구", "풋살"],          emoji: "⚽",  gradient: ["#10b981", "#047857"],
    thumb: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400&h=280&fit=crop" },
  { keywords: ["야구"],                 emoji: "⚾",  gradient: ["#0ea5e9", "#1e40af"],
    thumb: "https://images.unsplash.com/photo-1529768167801-9173d94c2a42?w=400&h=280&fit=crop" },
  { keywords: ["농구"],                 emoji: "🏀",  gradient: ["#fb923c", "#c2410c"],
    thumb: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=400&h=280&fit=crop" },
  { keywords: ["배드민턴"],              emoji: "🏸",  gradient: ["#facc15", "#ca8a04"],
    thumb: "https://images.unsplash.com/photo-1521537634581-0dced2fee2ef?w=400&h=280&fit=crop" },
  { keywords: ["테니스"],                emoji: "🎾",  gradient: ["#a3e635", "#65a30d"],
    thumb: "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400&h=280&fit=crop" },
  { keywords: ["탁구"],                 emoji: "🏓",  gradient: ["#f87171", "#b91c1c"],
    thumb: "https://images.unsplash.com/photo-1609710228159-0fa9bd7c0827?w=400&h=280&fit=crop" },
  { keywords: ["배구"],                 emoji: "🏐",  gradient: ["#fbbf24", "#d97706"],
    thumb: "https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=400&h=280&fit=crop" },
  { keywords: ["골프"],                 emoji: "⛳",  gradient: ["#22c55e", "#15803d"],
    thumb: "https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=400&h=280&fit=crop" },
  { keywords: ["볼링"],                 emoji: "🎳",  gradient: ["#06b6d4", "#0e7490"],
    thumb: "https://images.unsplash.com/photo-1553306832-db8b67918826?w=400&h=280&fit=crop" },
  { keywords: ["수영", "다이빙"],        emoji: "🏊",  gradient: ["#38bdf8", "#0369a1"],
    thumb: "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=400&h=280&fit=crop" },
  { keywords: ["등산", "하이킹", "트레킹"], emoji: "⛰️", gradient: ["#16a34a", "#14532d"],
    thumb: "https://images.unsplash.com/photo-1551632811-561732d1e306?w=400&h=280&fit=crop" },
  { keywords: ["자전거", "사이클", "라이딩"], emoji: "🚴", gradient: ["#14b8a6", "#0e7490"],
    thumb: "https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=400&h=280&fit=crop" },
  { keywords: ["러닝", "마라톤", "조깅"],  emoji: "🏃",  gradient: ["#f97316", "#c2410c"],
    thumb: "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=400&h=280&fit=crop" },
  { keywords: ["요가", "필라테스", "스트레칭"], emoji: "🧘", gradient: ["#84cc16", "#4d7c0f"],
    thumb: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&h=280&fit=crop" },
  { keywords: ["헬스", "근력", "웨이트"], emoji: "💪",  gradient: ["#64748b", "#1e293b"],
    thumb: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=280&fit=crop" },
  { keywords: ["복싱", "격투", "주짓수", "킥복싱"], emoji: "🥊", gradient: ["#ef4444", "#7f1d1d"],
    thumb: "https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=400&h=280&fit=crop" },
  { keywords: ["스키", "스노보드", "보드"], emoji: "🎿", gradient: ["#38bdf8", "#1e3a8a"],
    thumb: "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=400&h=280&fit=crop" },
  { keywords: ["서핑"],                 emoji: "🏄",  gradient: ["#06b6d4", "#0c4a6e"],
    thumb: "https://images.unsplash.com/photo-1502680390548-bdbac40f7154?w=400&h=280&fit=crop" },
  { keywords: ["낚시"],                 emoji: "🎣",  gradient: ["#0284c7", "#0c4a6e"],
    thumb: "https://images.unsplash.com/photo-1504309092620-4d0ec726efa4?w=400&h=280&fit=crop" },
  // 취미/문화
  { keywords: ["보드", "카드", "게임"],   emoji: "🎮",  gradient: ["#a855f7", "#6b21a8"],
    thumb: "https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=400&h=280&fit=crop" },
  { keywords: ["독서", "책", "북"],      emoji: "📚",  gradient: ["#b45309", "#78350f"],
    thumb: "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=400&h=280&fit=crop" },
  { keywords: ["사진"],                 emoji: "📸",  gradient: ["#1f2937", "#0f172a"],
    thumb: "https://images.unsplash.com/photo-1452587925148-ce544e77e70d?w=400&h=280&fit=crop" },
  { keywords: ["영화"],                 emoji: "🎬",  gradient: ["#1e293b", "#581c87"],
    thumb: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400&h=280&fit=crop" },
  { keywords: ["음악", "기타", "노래", "밴드"], emoji: "🎸", gradient: ["#d946ef", "#86198f"],
    thumb: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400&h=280&fit=crop" },
  { keywords: ["요리", "쿠킹"],          emoji: "🍳",  gradient: ["#f97316", "#9a3412"],
    thumb: "https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=400&h=280&fit=crop" },
  { keywords: ["맛집", "식사", "회식"],   emoji: "🍻",  gradient: ["#dc2626", "#7f1d1d"],
    thumb: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=280&fit=crop" },
  { keywords: ["카페", "커피"],          emoji: "☕",  gradient: ["#a16207", "#451a03"],
    thumb: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400&h=280&fit=crop" },
  { keywords: ["여행"],                 emoji: "✈️",  gradient: ["#0ea5e9", "#075985"],
    thumb: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400&h=280&fit=crop" },
  { keywords: ["언어", "영어", "회화"],   emoji: "💬",  gradient: ["#10b981", "#065f46"],
    thumb: "https://images.unsplash.com/photo-1543109740-4bdb38fda756?w=400&h=280&fit=crop" },
  { keywords: ["스터디", "공부"],        emoji: "📖",  gradient: ["#3b82f6", "#1e3a8a"],
    thumb: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=400&h=280&fit=crop" },
  // 동물/기타
  { keywords: ["반려", "강아지", "고양이"], emoji: "🐶", gradient: ["#d97706", "#78350f"],
    thumb: "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400&h=280&fit=crop" },
]

export const CLUB_DEFAULT: { emoji: string; gradient: [string, string]; thumb: string } = {
  emoji: "🎯",
  gradient: ["#6366f1", "#a855f7"],
  thumb: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=400&h=280&fit=crop",
}

export type HolmesType = "interior" | "moving" | "cleaning" | "repair"

export const HOLMES_CATS: { key: HolmesType; icon: any; color: string; label: string }[] = [
  { key: "interior", icon: "color-palette", color: "#a855f7", label: "인테리어" },
  { key: "moving",   icon: "car-sport",     color: "#eab308", label: "이사" },
  { key: "cleaning", icon: "sparkles",      color: "#ec4899", label: "청소" },
  { key: "repair",   icon: "construct",     color: "#f97316", label: "수리" },
]
