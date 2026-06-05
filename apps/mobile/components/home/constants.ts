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

// ── 모듈 스코프 캐시 — 탭 전환/홈 언마운트 후에도 유지되어 지역 변경 시 즉시 표시. ──
export const REGION_NEWS_CACHE: Record<string, NewsItem[]> = {}
export const REGION_NEWS_INFLIGHT: Record<string, Promise<NewsItem[]> | undefined> = {}
export const REGION_WEATHER_CACHE: Record<string, WeatherData> = {}
export const REGION_WEATHER_INFLIGHT: Record<string, Promise<WeatherData | null> | undefined> = {}

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
