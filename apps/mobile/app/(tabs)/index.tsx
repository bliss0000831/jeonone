/**
 * HomeTab — Baemin-style home screen.
 *
 * Sections (top → bottom):
 *   1. Header: plaza name (chevron → PlazaSelector) + search + bell + hamburger
 *   2. Hero Banner Carousel (infinite loop — unchanged behaviour)
 *   3. Category Grid: 2 rows x 4 columns (fixed, not scrollable)
 *   4. Content Feed: property → neighbourhood trade → neighbourhood activity → city news
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image as RNImage,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  StatusBar,
  useWindowDimensions,
} from "react-native"
import { Image } from "expo-image"
import { SafeAreaView } from "react-native-safe-area-context"
import { useFocusEffect, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { useThemedStyles } from "@/components/useColorScheme"
import {
  getWeather,
  listChuncheonEvents,
  listNews,
  type ChuncheonEvent,
  type NewsItem,
  type WeatherData,
} from "@gwangjang/features/home"

import { LinearGradient } from "expo-linear-gradient"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { gwangjangFetch, getSupabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { prefetchChatTab, prefetchMypageTab } from "@/lib/prefetch-tabs"
import { HeaderActions } from "@/components/HeaderActions"
import { PropertyFilterModal, type PropertyFilterValue } from "@/components/PropertyFilterModal"
import { PropertyMapView } from "@/components/PropertyMapView"
import { LocationSelector, loadUserLocation, type UserLocation } from "@/components/LocationSelector"
import PlazaSelector from "@/components/PlazaSelector"
import { useCurrentPlazaState, plazaCityName } from "@/lib/plaza"
import { ScrollFadeHint } from "@/components/ScrollFadeHint"
import { useHorizontalEnd } from "@/lib/use-horizontal-end"
import {
  REGION_NEWS_CACHE,
  REGION_WEATHER_CACHE,
  DEFAULT_BANNERS,
  HERO_GRADIENTS,
  SORT_OPTIONS,
  HUB_ITEMS,
  type SellerType,
  type Property,
  type DomainPost,
  type BannerData,
  type SortOption,
} from "@/components/home/constants"
import { txColor, formatPropertyPrice } from "@/components/home/formatters"
import { PropertyMiniCard } from "@/components/home/PropertyMiniCard"
import { FavoriteButton } from "@/components/FavoriteButton"
import { DomainSection, TabbedDomainGroup } from "@/components/home/DomainSection"
import { HolmesCarousel } from "@/components/home/HolmesCarousel"
import { CityNewsCard } from "@/components/home/CityNewsCard"

// ─── Category Tabs (배민-style tabbed grid) ─────────────────────────────────
interface CatItem { href: string; img: number; label: string }
interface CatTab { key: string; label: string; items: CatItem[] }

const CATEGORY_TABS: CatTab[] = [
  {
    key: "neighborhood",
    label: "우리동네",
    items: [
      { href: "/property?seller_type=agent", img: require("@/assets/icons/category/necktie.png"), label: "중개사 매물" },
      { href: "/property?seller_type=individual", img: require("@/assets/icons/category/house.png"), label: "직거래 매물" },
      { href: "/requests",                   img: require("@/assets/icons/category/raising-hand.png"), label: "구해주세요" },
      { href: "/service-requests",           img: require("@/assets/icons/category/hammer-and-wrench.png"), label: "도와주세요" },
      { href: "/interior",                   img: require("@/assets/icons/category/artist-palette.png"), label: "인테리어" },
      { href: "/moving",                     img: require("@/assets/icons/category/delivery-truck.png"), label: "이사" },
      { href: "/cleaning",                   img: require("@/assets/icons/category/broom.png"), label: "청소" },
      { href: "/repair",                     img: require("@/assets/icons/category/wrench.png"), label: "수리" },
    ],
  },
  {
    key: "market",
    label: "동네장터",
    items: [
      { href: "/secondhand",    img: require("@/assets/icons/category/shopping-cart.png"), label: "중고거래" },
      { href: "/sharing",       img: require("@/assets/icons/category/gift-heart.png"), label: "나눔" },
      { href: "/group-buying",  img: require("@/assets/icons/category/handshake.png"), label: "공동구매" },
      { href: "/local-food",    img: require("@/assets/icons/category/leafy-green.png"), label: "로컬푸드" },
      { href: "/new-store",     img: require("@/assets/icons/category/party-popper.png"), label: "신장개업" },
      { href: "/jobs",          img: require("@/assets/icons/category/briefcase.png"), label: "구인구직" },
      { href: "/clubs",         img: require("@/assets/icons/category/people-hugging.png"), label: "모임" },
    ],
  },
  {
    key: "board",
    label: "커뮤니티",
    items: [
      { href: "/board?type=free",       img: require("@/assets/icons/category/speech-balloon.png"), label: "자유게시판" },
      { href: "/board?type=food",       img: require("@/assets/icons/category/fork-knife-plate.png"), label: "맛집추천" },
      { href: "/board?type=life",       img: require("@/assets/icons/category/light-bulb.png"), label: "생활정보" },
      { href: "/board?type=daily",      img: require("@/assets/icons/category/camera-with-flash.png"), label: "일상공유" },
      { href: "/board?type=qna",        img: require("@/assets/icons/category/question-mark.png"), label: "질문답변" },
    ],
  },
  {
    key: "info",
    label: "생활정보",
    items: [
      { href: "/news",            img: require("@/assets/icons/category/newspaper.png"), label: "뉴스" },
      { href: "/news?tab=weather", img: require("@/assets/icons/category/sun-behind-cloud.png"), label: "날씨" },
      { href: "/news?tab=events", img: require("@/assets/icons/category/calendar.png"), label: "행사달력" },
      { href: "/gas-stations",    img: require("@/assets/icons/category/fuel-pump.png"), label: "주유소" },
      { href: "/toilets",         img: require("@/assets/icons/category/restroom.png"), label: "화장실" },
    ],
  },
]

// ═══════════════════════════════════════════════════════════════════════════════
// HomeTab
// ═══════════════════════════════════════════════════════════════════════════════

export default function HomeTab() {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const { user } = useAuth()
  const { width } = useWindowDimensions()
  const plazaState = useCurrentPlazaState()
  const currentPlaza = plazaState.id
  const PLAZA_NAME = plazaState.name
  const CITY_NAME = plazaCityName(plazaState.name)

  // ── Refs ──────────────────────────────────────────────────
  const mainScrollRef = useRef<FlatList>(null)
  const catSwipeRef = useRef<FlatList>(null)
  const mapSectionYRef = useRef(0)
  const propScrollRef = useRef<ScrollView>(null)
  const propEnd = useHorizontalEnd()

  // ── Properties ──────────────────────────────────────────────
  const [properties, setProperties] = useState<Property[]>([])
  const [propertiesLoading, setPropertiesLoading] = useState(true)
  const [propertiesError, setPropertiesError] = useState(false)
  const [sellerType, setSellerType] = useState<SellerType>("all")
  const [sortBy, setSortBy] = useState<SortOption["value"]>("latest")
  const [quickFilter, setQuickFilter] = useState<"none" | "nearby" | "popular" | "new">("none")

  // ── Modals / UI state ──────────────────────────────────────
  const [sortOpen, setSortOpen] = useState(false)
  const [plazaSelectorOpen, setPlazaSelectorOpen] = useState(false)
  const [activeCatTab, setActiveCatTab] = useState("neighborhood")
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [searchInput, setSearchInput] = useState("")
  const searchInputRef = useRef<TextInput>(null)
  const [subRegion, setSubRegion] = useState<string>("동네 설정")
  const [locationOpen, setLocationOpen] = useState(false)
  const [userLoc, setUserLoc] = useState<UserLocation | null>(null)

  // ── Property filter modal ──────────────────────────────────
  const [filterOpen, setFilterOpen] = useState(false)
  const [filter, setFilter] = useState<PropertyFilterValue>({
    propertyType: "전체",
    transactionType: "전체",
    sellerType: "전체",
    option: "전체",
    minPrice: null,
    maxPrice: null,
    minArea: null,
    maxArea: null,
  })

  // Map mode — click list item to open InfoWindow on map (web 1:1)
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null)

  // ── "방금 올라왔어요" — 카테고리별 최신 1건 ──────────────
  // fallbackIcon: require() 결과 (number)
  interface RecentItem {
    id: string
    title: string
    thumbnail: string | null
    fallbackIcon: number
    category: string
    categoryLabel: string
    categoryColor: string
    location: string | null
    chips: string[]
    timeAgo: string
    href: string
    views: number
    likes: number
  }
  const [recentItems, setRecentItems] = useState<RecentItem[]>([])
  const [recentError, setRecentError] = useState(false)
  // 카테고리 → FavoriteButton kind (하트 토글용)
  const RECENT_FAV_KIND: Record<string, string> = {
    property: "property",
    sharing: "sharing", board: "board", clubs: "club", group_buying: "group-buying",
    local_food: "local-food", new_store: "new-store", interior: "interior", cleaning: "cleaning",
    secondhand: "secondhand", moving: "moving", repair: "repair",
  }

  const loadRecentItems = useCallback(async () => {
    if (!currentPlaza) return
    setRecentError(false)
    const supabase = getSupabase()
    const firstImg = (imgs: unknown) =>
      Array.isArray(imgs) && imgs.length > 0 && typeof imgs[0] === "string" ? imgs[0] : null
    const ago = (iso: string) => {
      const d = Date.now() - new Date(iso).getTime()
      const m = Math.floor(d / 60000)
      if (m < 1) return "방금"
      if (m < 60) return `${m}분 전`
      const h = Math.floor(m / 60)
      if (h < 24) return `${h}시간 전`
      return `${Math.floor(h / 24)}일 전`
    }
    // 카테고리/주제별 기본 이미지 (Unsplash 무료 — 300x200 crop)
    const DEFAULT_THUMBS: Record<string, string> = {
      local_food:    "https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=300&h=200&fit=crop",
      new_store:     "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=300&h=200&fit=crop",
      interior:      "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=300&h=200&fit=crop",
      cleaning:      "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=300&h=200&fit=crop",
      sharing:       "https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=300&h=200&fit=crop",
      group_buying:  "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=300&h=200&fit=crop",
    }
    // 모임 종목별
    const CLUB_THUMBS: Record<string, string> = {
      러닝:     "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=300&h=200&fit=crop",
      배드민턴: "https://images.unsplash.com/photo-1521537634581-0dced2fee2ef?w=300&h=200&fit=crop",
      축구:     "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=300&h=200&fit=crop",
      농구:     "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=300&h=200&fit=crop",
      테니스:   "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=300&h=200&fit=crop",
      등산:     "https://images.unsplash.com/photo-1551632811-561732d1e306?w=300&h=200&fit=crop",
      수영:     "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=300&h=200&fit=crop",
      자전거:   "https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=300&h=200&fit=crop",
      요가:     "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=300&h=200&fit=crop",
      기타:     "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=300&h=200&fit=crop",
    }
    // 게시판 유형별
    const BOARD_THUMBS: Record<string, string> = {
      free:    "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=300&h=200&fit=crop",
      food:    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=300&h=200&fit=crop",
      life:    "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=300&h=200&fit=crop",
      daily:   "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=300&h=200&fit=crop",
      qna:     "https://images.unsplash.com/photo-1633613286991-611fe299c4be?w=300&h=200&fit=crop",
    }
    const fmtPrice = (n: number | null | undefined) => {
      if (!n) return null
      if (n >= 100000000) return `${(n / 100000000).toFixed(n % 100000000 === 0 ? 0 : 1)}억`
      if (n >= 10000) {
        const man = n / 10000
        return man % 1 === 0 ? `${man}만` : `${man.toFixed(1)}만`
      }
      return n.toLocaleString()
    }
    const cats: Array<{
      table: string; select: string; category: string; label: string;
      color: string; hrefPrefix: string; icon: number; defaultThumb: string;
      mapRow: (r: any) => { title: string; thumbnail: string | null; location: string | null; chips: string[] }
    }> = [
      { table: "properties", select: "*", category: "property", label: "부동산", color: "#2563eb", hrefPrefix: "/property",
        icon: require("@/assets/icons/category/house.png"), defaultThumb: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=300&h=200&fit=crop",
        mapRow: (r) => ({ title: r.title, thumbnail: firstImg(r.images), location: r.location ?? r.address ?? null,
          chips: [
            formatPropertyPrice(r),
            ...(r.transaction_type ? [r.transaction_type] : []),
          ] }) },
      { table: "sharing_posts", select: "id, title, images, location, status, created_at", category: "sharing", label: "나눔", color: "#ef4444", hrefPrefix: "/sharing",
        icon: require("@/assets/icons/category/gift-heart.png"), defaultThumb: DEFAULT_THUMBS.sharing,
        mapRow: (r) => ({ title: r.title, thumbnail: firstImg(r.images), location: r.location,
          chips: [r.status === "reserved" ? "예약중" : r.status === "completed" ? "나눔완료" : "나눔중"] }) },
      { table: "clubs", select: "id, title, images, category, current_members, max_members, created_at", category: "clubs", label: "모임", color: "#6366f1", hrefPrefix: "/clubs",
        icon: require("@/assets/icons/category/busts-in-silhouette.png"), defaultThumb: "",
        mapRow: (r) => ({ title: r.title, thumbnail: firstImg(r.images) || CLUB_THUMBS[r.category] || CLUB_THUMBS["기타"], location: null,
          chips: [r.max_members ? `${r.current_members ?? 0}/${r.max_members}명` : `${r.current_members ?? 0}명 참여`] }) },
      { table: "group_buying_posts", select: "id, title, images, current_participants, max_participants, status, created_at", category: "group_buying", label: "공동구매", color: "#8b5cf6", hrefPrefix: "/group-buying",
        icon: require("@/assets/icons/category/handshake.png"), defaultThumb: DEFAULT_THUMBS.group_buying,
        mapRow: (r) => ({ title: r.title, thumbnail: firstImg(r.images), location: null,
          chips: [
            r.status === "closed" ? "마감" : "모집중",
            ...(r.max_participants ? [`${r.current_participants ?? 0}/${r.max_participants}명`] : []),
          ] }) },
      { table: "local_food", select: "id, title, images, price, farm_name, created_at", category: "local_food", label: "로컬푸드", color: "#22c55e", hrefPrefix: "/local-food",
        icon: require("@/assets/icons/category/leafy-green.png"), defaultThumb: DEFAULT_THUMBS.local_food,
        mapRow: (r) => ({ title: r.title, thumbnail: firstImg(r.images), location: null,
          chips: [
            ...(r.price ? [`${fmtPrice(r.price)}원`] : []),
            ...(r.farm_name ? [r.farm_name] : []),
          ] }) },
      { table: "new_store_posts", select: "id, title, images, store_name, address, created_at", category: "new_store", label: "신장개업", color: "#f97316", hrefPrefix: "/new-store",
        icon: require("@/assets/icons/category/party-popper.png"), defaultThumb: DEFAULT_THUMBS.new_store,
        mapRow: (r) => ({ title: r.store_name || r.title || "신규 매장", thumbnail: firstImg(r.images), location: null,
          chips: [...(r.address ? [r.address] : [])] }) },
      { table: "interior_posts", select: "id, title, images, service_region, service_district, min_price, max_price, price_unit, created_at", category: "interior", label: "인테리어", color: "#a855f7", hrefPrefix: "/interior",
        icon: require("@/assets/icons/category/artist-palette.png"), defaultThumb: DEFAULT_THUMBS.interior,
        mapRow: (r) => { const unit = r.price_unit || "만원"; return { title: r.title, thumbnail: firstImg(r.images), location: [r.service_region, r.service_district].filter(Boolean).join(" ") || null,
          chips: [
            ...(r.min_price || r.max_price ? [[r.min_price, r.max_price].filter(Boolean).join("~") + unit] : []),
            ...(r.service_region ? [r.service_region] : []),
          ] } } },
      { table: "cleaning_posts", select: "id, title, images, service_region, service_district, min_price, max_price, price_unit, created_at", category: "cleaning", label: "청소", color: "#ec4899", hrefPrefix: "/cleaning",
        icon: require("@/assets/icons/category/broom.png"), defaultThumb: DEFAULT_THUMBS.cleaning,
        mapRow: (r) => { const unit = r.price_unit || "만원"; return { title: r.title, thumbnail: firstImg(r.images), location: [r.service_region, r.service_district].filter(Boolean).join(" ") || null,
          chips: [
            ...(r.min_price || r.max_price ? [[r.min_price, r.max_price].filter(Boolean).join("~") + unit] : []),
            ...(r.service_region ? [r.service_region] : []),
          ] } } },
      { table: "secondhand_posts", select: "*", category: "secondhand", label: "중고거래", color: "#10b981", hrefPrefix: "/secondhand",
        icon: require("@/assets/icons/category/shopping-cart.png"), defaultThumb: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=300&h=200&fit=crop",
        mapRow: (r) => ({ title: r.title, thumbnail: firstImg(r.images), location: r.location,
          chips: [r.price > 0 ? `${fmtPrice(r.price)}원` : "가격 제안"] }) },
      { table: "moving_posts", select: "*", category: "moving", label: "이사", color: "#0ea5e9", hrefPrefix: "/moving",
        icon: require("@/assets/icons/category/delivery-truck.png"), defaultThumb: "https://images.unsplash.com/photo-1530563885674-66db50a1af19?w=300&h=200&fit=crop",
        mapRow: (r) => { const unit = r.price_unit || "만원"; return { title: r.title, thumbnail: firstImg(r.images), location: [r.service_region, r.service_district].filter(Boolean).join(" ") || null,
          chips: [
            ...(r.min_price || r.max_price ? [[r.min_price, r.max_price].filter(Boolean).join("~") + unit] : []),
            ...(r.service_region ? [r.service_region] : []),
          ] } } },
      { table: "repair_posts", select: "*", category: "repair", label: "수리", color: "#f43f5e", hrefPrefix: "/repair",
        icon: require("@/assets/icons/category/hammer-and-wrench.png"), defaultThumb: "https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=300&h=200&fit=crop",
        mapRow: (r) => { const unit = r.price_unit || "만원"; return { title: r.title, thumbnail: firstImg(r.images), location: [r.service_region, r.service_district].filter(Boolean).join(" ") || null,
          chips: [
            ...(r.min_price || r.max_price ? [[r.min_price, r.max_price].filter(Boolean).join("~") + unit] : []),
            ...(r.service_region ? [r.service_region] : []),
          ] } } },
      { table: "jobs_posts", select: "*", category: "jobs", label: "구인구직", color: "#14b8a6", hrefPrefix: "/jobs",
        icon: require("@/assets/icons/category/briefcase.png"), defaultThumb: "https://images.unsplash.com/photo-1521791136064-7986c2920216?w=300&h=200&fit=crop",
        mapRow: (r) => ({ title: r.title, thumbnail: firstImg(r.images), location: r.location,
          chips: [
            ...(r.hourly_wage ? [`시급 ${Number(r.hourly_wage).toLocaleString()}원`] : []),
            r.kind === "seeking" ? "구직" : "구인",
          ] }) },
    ]
    try {
      const results = await Promise.all(
        cats.map(async (c) => {
          // select("*") — 테이블마다 views/likes 컬럼명이 달라(views/view_count, likes/like_count)
          // 안전하게 전체 컬럼을 가져온 뒤 아래에서 폴백 처리 (1행이라 부담 없음)
          let q: any = (supabase as any).from(c.table).select("*")
            .order("created_at", { ascending: false }).limit(1)
          if (c.table !== "profiles") q = q.eq("plaza_id", currentPlaza)
          const { data } = await q
          if (!data || data.length === 0) return null
          const r = data[0]
          const mapped = c.mapRow(r)
          return {
            id: r.id,
            title: mapped.title,
            thumbnail: mapped.thumbnail || c.defaultThumb,
            fallbackIcon: c.icon,
            category: c.category,
            categoryLabel: c.label,
            categoryColor: c.color,
            location: mapped.location,
            chips: mapped.chips,
            timeAgo: ago(r.created_at),
            href: `${c.hrefPrefix}/${r.id}`,
            views: Number(r.views ?? r.view_count ?? 0) || 0,
            likes: Number(r.likes ?? r.like_count ?? 0) || 0,
          } as RecentItem
        }),
      )
      // 셔플 — Fisher-Yates
      const items = results.filter(Boolean) as RecentItem[]
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[items[i], items[j]] = [items[j], items[i]]
      }
      setRecentItems(items)
    } catch (e) {
      console.warn("[home] recent items failed", e)
      setRecentError(true)
    }
  }, [currentPlaza])

  // ── Hero Carousel ─────────────────────────────────────────
  const [banners, setBanners] = useState<BannerData[]>(DEFAULT_BANNERS)
  const [bannerIndex, setBannerIndex] = useState(0)

  // 1) Cache instant load
  useEffect(() => {
    if (!currentPlaza) return
    ;(async () => {
      try {
        const cached = await AsyncStorage.getItem(`hero_banners_cache:${currentPlaza}`)
        if (cached) {
          const parsed = JSON.parse(cached) as BannerData[]
          if (Array.isArray(parsed) && parsed.length > 0) {
            setBanners(parsed)
            parsed.forEach((b) => {
              if (b.image_url) Image.prefetch(b.image_url).catch(() => {})
            })
          }
        }
      } catch {}
    })()
  }, [currentPlaza])

  // Background prefetch chat / mypage tabs
  useEffect(() => {
    if (!user?.id || !currentPlaza) return
    const t = setTimeout(() => {
      prefetchChatTab(user.id, currentPlaza).catch(() => {})
      prefetchMypageTab(user.id, currentPlaza).catch(() => {})
    }, 800)
    return () => clearTimeout(t)
  }, [user?.id, currentPlaza])

  // 2) Fetch latest banners from DB + cache
  useEffect(() => {
    if (!currentPlaza) return
    ;(async () => {
      try {
        const supabase = getSupabase()
        const { data } = await supabase
          .from("hero_banners")
          .select("id, title, subtitle, description, href, image_url, gradient, opacity, order_index, is_active")
          .eq("is_active", true)
          .eq("plaza_id", currentPlaza)
          .order("order_index", { ascending: true })
        if (data && data.length > 0) {
          const next = data.map((d: any) => ({
            id: String(d.id),
            title: d.title ?? "",
            subtitle: d.subtitle ?? "",
            description: d.description ?? "",
            href: d.href ?? "/",
            image_url: d.image_url ?? null,
            opacity: d.opacity ?? 40,
            gradient: d.gradient ?? null,
          }))
          setBanners(next)
          AsyncStorage.setItem(
            `hero_banners_cache:${currentPlaza}`,
            JSON.stringify(next),
          ).catch(() => {})
          next.forEach((b) => {
            if (b.image_url) Image.prefetch(b.image_url).catch(() => {})
          })
        }
      } catch {
        // RLS / table missing — use defaultBanners
      }
    })()
  }, [currentPlaza])

  // Swipe detection — pause auto-rotate after user touch
  const bannerListRef = useRef<FlatList<BannerData>>(null)
  const userInteractedRef = useRef<number>(0)

  // ── Infinite loop — clone first/last slides ────────────────
  const displayBanners = useMemo(() => {
    if (banners.length <= 1) return banners
    return [banners[banners.length - 1], ...banners, banners[0]]
  }, [banners])
  const [scrollPos, setScrollPos] = useState(1)
  const scrollPosRef = useRef(scrollPos)

  // Reset to position 1 when banners load
  useEffect(() => {
    if (banners.length <= 1) return
    setScrollPos(1)
    setBannerIndex(0)
    requestAnimationFrame(() => {
      bannerListRef.current?.scrollToIndex({ index: 1, animated: false })
    })
  }, [banners.length])

  useEffect(() => { scrollPosRef.current = scrollPos }, [scrollPos])

  // Auto-rotate every 5s (pause 8s after user swipe)
  useEffect(() => {
    if (banners.length <= 1) return
    const totalLen = banners.length + 2
    const t = setInterval(() => {
      if (Date.now() - userInteractedRef.current < 8000) return
      const cur = scrollPosRef.current
      // 끝(clone 영역)에 도달했으면 진짜 첫 슬라이드(index 1)로 리셋 후 다음 틱에 진행
      if (cur >= totalLen - 1) {
        bannerListRef.current?.scrollToIndex({ index: 1, animated: false })
        scrollPosRef.current = 1
        return
      }
      const next = cur + 1
      bannerListRef.current?.scrollToIndex({ index: next, animated: true })
    }, 5000)
    return () => clearInterval(t)
  }, [banners.length])

  const currentBanner = banners[bannerIndex]

  function onBannerScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const w = e.nativeEvent.layoutMeasurement.width
    if (w <= 0) return
    const pos = Math.round(e.nativeEvent.contentOffset.x / w)
    if (pos !== scrollPos) {
      setScrollPos(pos)
      const N = banners.length
      const realIdx = pos === 0 ? N - 1 : pos === N + 1 ? 0 : pos - 1
      if (realIdx !== bannerIndex && realIdx >= 0 && realIdx < N) {
        setBannerIndex(realIdx)
      }
    }
  }

  function onBannerMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const w = e.nativeEvent.layoutMeasurement.width
    if (w <= 0) return
    const pos = Math.round(e.nativeEvent.contentOffset.x / w)
    const N = banners.length
    if (N <= 1) return
    if (pos === 0) {
      bannerListRef.current?.scrollToIndex({ index: N, animated: false })
      setScrollPos(N)
    } else if (pos === N + 1) {
      bannerListRef.current?.scrollToIndex({ index: 1, animated: false })
      setScrollPos(1)
    }
  }

  function onBannerScrollBegin() {
    userInteractedRef.current = Date.now()
  }

  // ── Domain previews ───────────────────────────────────────
  const [sharingPosts, setSharingPosts] = useState<DomainPost[]>([])
  const [groupBuyingPosts, setGroupBuyingPosts] = useState<DomainPost[]>([])
  const [localFoodPosts, setLocalFoodPosts] = useState<DomainPost[]>([])
  const [newStorePosts, setNewStorePosts] = useState<DomainPost[]>([])
  const [clubPosts, setClubPosts] = useState<DomainPost[]>([])
  const [secondhandPosts, setSecondhandPosts] = useState<DomainPost[]>([])
  const [jobsPosts, setJobsPosts] = useState<DomainPost[]>([])
  const [interiorPosts, setInteriorPosts] = useState<DomainPost[]>([])
  const [movingPosts, setMovingPosts] = useState<DomainPost[]>([])
  const [cleaningPosts, setCleaningPosts] = useState<DomainPost[]>([])
  const [repairPosts, setRepairPosts] = useState<DomainPost[]>([])

  // ── News / events / weather ───────────────────────────────
  const [news, setNews] = useState<NewsItem[]>([])
  const [events, setEvents] = useState<ChuncheonEvent[]>([])
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [plazaCoverage, setPlazaCoverage] = useState<string[]>([])

  // Plaza coverage load
  useEffect(() => {
    if (!currentPlaza) return
    ;(async () => {
      const supabase = getSupabase()
      const { data } = await supabase
        .from("plazas")
        .select("coverage")
        .eq("id", currentPlaza)
        .maybeSingle()
      const cov = (data as any)?.coverage
      setPlazaCoverage(Array.isArray(cov) ? cov : [])
    })()
  }, [currentPlaza])

  // ── Common state ──────────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // ── loadProperties ────────────────────────────────────────
  const loadProperties = useCallback(async () => {
    setPropertiesLoading(true)
    setPropertiesError(false)
    try {
      const supabase = getSupabase()
      let q = supabase
        .from("properties")
        .select("*")
        .eq("plaza_id", currentPlaza)
        .eq("status", "active")

      if (sellerType === "agent") q = q.eq("seller_type", "agent")
      else if (sellerType === "individual") q = q.eq("seller_type", "individual")

      if (filter.propertyType !== "전체") q = q.eq("property_type", filter.propertyType)
      if (filter.transactionType !== "전체") q = q.eq("transaction_type", filter.transactionType)
      if (filter.sellerType !== "전체") q = q.eq("seller_type", filter.sellerType)
      if (filter.option === "parking") q = (q as any).eq("parking", true)
      if (filter.option === "elevator") q = (q as any).eq("elevator", true)
      if (filter.option === "pet") q = (q as any).eq("pet_allowed", true)
      if (filter.district && filter.district !== "전체") q = q.ilike("address", `%${filter.district}%`)
      if (filter.minPrice != null) q = q.gte("price", filter.minPrice)
      if (filter.maxPrice != null) q = q.lte("price", filter.maxPrice)
      if (filter.minArea != null) q = q.gte("area", filter.minArea)
      if (filter.maxArea != null) q = q.lte("area", filter.maxArea)

      if (quickFilter === "new") {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        q = q.gte("created_at", sevenDaysAgo)
      }
      if (quickFilter === "nearby" && userLoc?.dong) {
        q = q.ilike("address", `%${userLoc.dong}%`)
      }

      q = (q as any).order("is_featured", { ascending: false, nullsFirst: false })
      switch (sortBy) {
        case "priceAsc":   q = q.order("price", { ascending: true });  break
        case "priceDesc":  q = q.order("price", { ascending: false }); break
        case "areaDesc":   q = q.order("area",  { ascending: false }); break
        case "areaAsc":    q = q.order("area",  { ascending: true });  break
        case "views":      q = q.order("views", { ascending: false }); break
        case "likes":      q = q.order("likes", { ascending: false }); break
        case "pricePerArea":
        case "latest":
        default:           q = q.order("effective_at", { ascending: false }); break
      }

      q = q.limit(20)
      const { data } = await q
      let rows = (data ?? []) as unknown as Property[]

      if (sortBy === "pricePerArea") {
        rows = [...rows].sort((a, b) => {
          const aP = a.area && a.area > 0 ? (a.price ?? 0) / a.area : Number.POSITIVE_INFINITY
          const bP = b.area && b.area > 0 ? (b.price ?? 0) / b.area : Number.POSITIVE_INFINITY
          return aP - bP
        })
      }
      if (quickFilter === "popular") {
        rows = [...rows].sort((a, b) =>
          ((b.views ?? 0) + (b.likes ?? 0) * 10) - ((a.views ?? 0) + (a.likes ?? 0) * 10),
        )
      }

      setProperties(rows)
    } catch (e) {
      console.warn("[home] properties load failed", e)
      setPropertiesError(true)
    } finally {
      setPropertiesLoading(false)
    }
  }, [currentPlaza, sellerType, sortBy, quickFilter, filter, userLoc])

  // ── loadDomainPreviews ────────────────────────────────────
  const loadDomainPreviews = useCallback(async () => {
    if (!currentPlaza) return
    const supabase = getSupabase()
    const fetch = (table: string, statusFilter: { col: string; val: string }, order: { col: string; asc: boolean }, limit: number) => {
      let q: any = (supabase as any).from(table).select("*")
      if (table === "group_buying_posts" || table === "local_food") {
        q = q.or(`plaza_id.eq.${currentPlaza},visibility.eq.national`)
      } else {
        q = q.eq("plaza_id", currentPlaza)
      }
      q = q.eq(statusFilter.col, statusFilter.val)
      q = q.order(order.col, { ascending: order.asc })
      q = q.limit(limit)
      return q
    }
    try {
      const [sh, gb, ns, lf, cl, se, jb, ip, mp, cp, rp] = await Promise.all([
        fetch("sharing_posts",      { col: "status", val: "active" },     { col: "created_at",   asc: false }, 4),
        fetch("group_buying_posts", { col: "status", val: "recruiting" }, { col: "effective_at", asc: false }, 4),
        fetch("new_store_posts",    { col: "status", val: "active" },     { col: "effective_at", asc: false }, 4),
        fetch("local_food",         { col: "status", val: "available" },  { col: "effective_at", asc: false }, 4),
        fetch("clubs",              { col: "status", val: "recruiting" }, { col: "created_at",   asc: false }, 4),
        fetch("secondhand_posts",   { col: "status", val: "active" },     { col: "effective_at", asc: false }, 4),
        fetch("jobs_posts",         { col: "status", val: "active" },     { col: "effective_at", asc: false }, 4),
        fetch("interior_posts",     { col: "status", val: "active" },     { col: "effective_at", asc: false }, 8),
        fetch("moving_posts",       { col: "status", val: "active" },     { col: "effective_at", asc: false }, 8),
        fetch("cleaning_posts",     { col: "status", val: "active" },     { col: "effective_at", asc: false }, 8),
        fetch("repair_posts",       { col: "status", val: "active" },     { col: "effective_at", asc: false }, 8),
      ])
      setSharingPosts((sh?.data ?? []) as DomainPost[])
      setGroupBuyingPosts((gb?.data ?? []) as DomainPost[])
      setNewStorePosts((ns?.data ?? []) as DomainPost[])
      setLocalFoodPosts((lf?.data ?? []) as DomainPost[])
      setClubPosts((cl?.data ?? []) as DomainPost[])
      setInteriorPosts((ip?.data ?? []) as DomainPost[])
      setMovingPosts((mp?.data ?? []) as DomainPost[])
      setCleaningPosts((cp?.data ?? []) as DomainPost[])
      setRepairPosts((rp?.data ?? []) as DomainPost[])
      setSecondhandPosts((se?.data ?? []) as DomainPost[])
      setJobsPosts((jb?.data ?? []) as DomainPost[])
    } catch (e) {
      console.warn("[home] domain previews failed", e)
    }
  }, [currentPlaza])

  // ── loadInfoSections ──────────────────────────────────────
  const loadInfoSections = useCallback(async () => {
    const f = (u: string, init?: any) => gwangjangFetch(u, init as any)
    try {
      const [n, e, w] = await Promise.all([
        listNews(f, { q: "", region: "", page: 1, refreshKey }),
        listChuncheonEvents(getSupabase(), currentPlaza),
        getWeather(f, { region: "", refreshKey }),
      ])
      setNews(n.news.filter((it: any) => !!it.thumbnail && String(it.thumbnail).trim().length > 0 && !/pressian/i.test(String(it.url ?? "")) && !/프레시안/.test(String(it.press ?? ""))).slice(0, 5))
      setEvents(e.slice(0, 5))
      setWeather(w)
    } catch (err) {
      console.warn("[home] info sections failed", err)
    }
  }, [refreshKey, currentPlaza])

  useEffect(() => {
    loadProperties()
    loadDomainPreviews()
    loadInfoSections()
    loadRecentItems()
  }, [loadProperties, loadDomainPreviews, loadInfoSections, loadRecentItems])

  // Re-fetch on screen focus (skip first mount, throttle 5s)
  // 5s: 글 작성/수정 후 홈 복귀 시 최신 반영되도록 짧게. 탭 빠른 전환 시 중복 fetch 만 방지.
  const firstHomeFocusRef = useRef(true)
  const lastFetchRef = useRef(0)
  useFocusEffect(
    useCallback(() => {
      if (firstHomeFocusRef.current) {
        firstHomeFocusRef.current = false
        lastFetchRef.current = Date.now()
        return
      }
      if (Date.now() - lastFetchRef.current < 5_000) return
      lastFetchRef.current = Date.now()
      loadProperties()
      loadDomainPreviews()
      loadRecentItems()
    }, [loadProperties, loadDomainPreviews, loadRecentItems]),
  )

  // Load user location from AsyncStorage
  useEffect(() => {
    ;(async () => {
      const loc = await loadUserLocation()
      if (loc) {
        setUserLoc(loc)
        if (loc.dong) setSubRegion(loc.dong)
        else if (loc.sigungu) setSubRegion(loc.sigungu)
      } else {
        setUserLoc(null)
        setSubRegion("동네 설정")
      }
    })()
  }, [currentPlaza])

  // User profile — sub_region for location display
  useEffect(() => {
    if (!user) {
      setSubRegion("")
      return
    }
    const supabase = getSupabase()
    ;(async () => {
      const [profRes, ppRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("sub_region, location")
          .eq("id", user.id)
          .maybeSingle(),
        currentPlaza
          ? supabase
              .from("plaza_profiles")
              .select("location")
              .eq("user_id", user.id)
              .eq("plaza_id", currentPlaza)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
      ])
      const profRaw: any = profRes?.data || {}
      const ppData: any = ppRes?.data || {}
      const sr = profRaw.sub_region
      if (sr && typeof sr === "string") {
        setSubRegion(sr)
      } else if (ppData.location) {
        const parts = (ppData.location as string).split(" ").filter(Boolean)
        if (parts.length > 0) setSubRegion(parts[parts.length - 1])
        else setSubRegion("")
      } else {
        setSubRegion("")
      }
    })()
  }, [user, currentPlaza])

  // ── Pull-to-refresh ───────────────────────────────────────
  async function onRefresh() {
    setRefreshing(true)
    setRefreshKey((k) => k + 1)
    Object.keys(REGION_NEWS_CACHE).forEach((k) => delete REGION_NEWS_CACHE[k])
    Object.keys(REGION_WEATHER_CACHE).forEach((k) => delete REGION_WEATHER_CACHE[k])
    try {
      await Promise.all([loadProperties(), loadDomainPreviews(), loadInfoSections(), loadRecentItems()])
    } finally {
      setRefreshing(false)
    }
  }

  const filteredProperties = properties
  const displayedProperties = filteredProperties.slice(0, 7)

  // ── Category grid renderItem (M7 perf: extract from inline) ──
  const renderCategoryItem = useCallback(
    ({ item: tab }: { item: CatTab }) => (
      <View style={[styles.categoryGrid, { width }]}>
        {tab.items.map((item) => (
          <Pressable
            key={item.href}
            style={styles.categoryItem}
            onPress={() => router.push(item.href as any)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <View style={styles.categoryIconWrap}>
              <RNImage
                source={item.img}
                style={styles.categoryIcon3d}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.categoryLabel}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    ),
    [width, router],
  )

  // ── FlatList section data for lazy rendering ─────────────
  type HomeSectionKey = "catAndBanner" | "recent" | "property" | "trade" | "activity" | "news"
  const homeSections = useMemo<HomeSectionKey[]>(
    () => ["catAndBanner", "recent", "property", "trade", "activity", "news"],
    [],
  )
  const homeSectionKeyExtractor = useCallback((item: HomeSectionKey) => item, [])

  // ═══════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* ── C안: 고정 헤더 + 검색바 (화이트 미니멀) ────────── */}
      <SafeAreaView style={styles.headerSafeArea} edges={["top"]}>
        <View style={styles.header}>
          <Pressable
            style={styles.plazaNameWrap}
            onPress={() => setPlazaSelectorOpen(true)}
          >
            <Ionicons name="location" size={18} color={lightColors.ink900} style={{ marginTop: 1.5 }} />
            <Text style={styles.plazaNameText}>{PLAZA_NAME}</Text>
            <Ionicons name="chevron-down" size={14} color={lightColors.ink500} />
          </Pressable>
          <HeaderActions cityName={CITY_NAME} />
        </View>

        {/* 검색바 — 그레이 필 */}
        <View style={styles.searchBar}>
          <TextInput
            ref={searchInputRef}
            style={styles.searchBarInput}
            placeholder="우리 동네 뭐 있지?"
            placeholderTextColor="#9ca3af"
            accessibilityLabel="통합 검색"
            value={searchInput}
            onChangeText={setSearchInput}
            onSubmitEditing={() => {
              if (searchInput.trim()) {
                router.push({ pathname: "/(tabs)/search", params: { q: searchInput.trim() } } as any)
                setSearchInput("")
              }
            }}
            returnKeyType="search"
          />
          <Ionicons name="search-outline" size={18} color="#9ca3af" />
        </View>
      </SafeAreaView>

      <FlatList
        ref={mainScrollRef}
        data={homeSections}
        keyExtractor={homeSectionKeyExtractor}
        contentContainerStyle={{ paddingBottom: 0 }}
        style={styles.scrollBg}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        initialNumToRender={3}
        maxToRenderPerBatch={2}
        windowSize={3}
        renderItem={({ item: sectionKey }) => {
          switch (sectionKey) {
            case "catAndBanner":
              return (
        <View style={styles.contentArea}>
          {/* Category Tabs */}
          <View style={styles.catTabBar}>
            {CATEGORY_TABS.map((t) => {
              const active = activeCatTab === t.key
              return (
                <Pressable
                  key={t.key}
                  onPress={() => {
                    setActiveCatTab(t.key)
                    const idx = CATEGORY_TABS.findIndex((c) => c.key === t.key)
                    catSwipeRef.current?.scrollToIndex({ index: idx, animated: true })
                  }}
                  style={[styles.catTab, active && styles.catTabActive]}
                >
                  <Text style={[styles.catTabText, active && styles.catTabTextActive]}>
                    {t.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
          {/* Swipeable category grids */}
          <FlatList
            ref={catSwipeRef}
            data={CATEGORY_TABS}
            keyExtractor={(t) => t.key}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            getItemLayout={(_, index) => ({
              length: width,
              offset: width * index,
              index,
            })}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / (width))
              if (CATEGORY_TABS[idx]) setActiveCatTab(CATEGORY_TABS[idx].key)
            }}
            scrollEventThrottle={16}
            renderItem={renderCategoryItem}
          />

          {/* ── 배너 카드 ────────── */}
          <View style={styles.heroBannerWrap}>
            <View style={styles.heroCard}>
              <FlatList
                ref={bannerListRef}
                data={displayBanners}
                keyExtractor={(b, i) => `${b.id}-${i}`}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={onBannerScroll}
                onScrollBeginDrag={onBannerScrollBegin}
                onMomentumScrollEnd={onBannerMomentumEnd}
                scrollEventThrottle={16}
                getItemLayout={(_, index) => ({
                  length: width - spacing[4] * 2,
                  offset: (width - spacing[4] * 2) * index,
                  index,
                })}
                initialScrollIndex={banners.length > 1 ? 1 : 0}
                initialNumToRender={2}
                maxToRenderPerBatch={3}
                onScrollToIndexFailed={(info) => {
                  const offset = info.averageItemLength * info.index
                  bannerListRef.current?.scrollToOffset({ offset, animated: false })
                  setTimeout(() => {
                    bannerListRef.current?.scrollToIndex({
                      index: info.index,
                      animated: false,
                    })
                  }, 50)
                }}
                renderItem={({ item, index }) => (
                  <Pressable
                    onPress={() => router.push(item.href as any)}
                    style={[styles.hero, { width: width - spacing[4] * 2 }]}
                  >
                    {item.image_url ? (
                      <>
                        <Image
                          source={{ uri: item.image_url }}
                          style={StyleSheet.absoluteFill as any}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          transition={200}
                        />
                        <View
                          style={[
                            StyleSheet.absoluteFill as any,
                            {
                              backgroundColor: "#000000",
                              opacity: ((item.opacity ?? 40) / 100),
                            },
                          ]}
                        />
                      </>
                    ) : (
                      <LinearGradient
                        colors={HERO_GRADIENTS[index % HERO_GRADIENTS.length]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill as any}
                      />
                    )}
                    <View style={styles.heroContent}>
                      <Text style={styles.heroTitle}>{item.title}</Text>
                      <Text style={styles.heroSubtitle}>{item.subtitle}</Text>
                      <Text style={styles.heroDesc}>{item.description}</Text>
                      {item.id !== "0" && (
                        <View style={styles.heroBtnText}>
                          <Text style={styles.heroBtnLabel}>바로가기 →</Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                )}
              />
              {/* Page indicator */}
              <View style={styles.heroProgress} pointerEvents="none">
                {banners.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.heroProgressSeg,
                      i === bannerIndex && styles.heroProgressSegActive,
                    ]}
                  />
                ))}
              </View>
            </View>
          </View>

          {/* 배너 ↔ 콘텐츠 구분선 */}
          <View style={styles.categoryDivider} />
        </View>
              )
            case "recent":
              return (
        <View style={styles.contentArea}>
        {/* ═══════════════════════════════════════════════ */}
        {/*    SECTION: 방금 올라왔어요                      */}
        {/* ═══════════════════════════════════════════════ */}
        {recentError && recentItems.length === 0 && (
          <View style={styles.recentSection}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>방금 올라왔어요</Text>
              </View>
            </View>
            <Pressable onPress={() => loadRecentItems()} style={styles.recentRetryBox}>
              <Text style={styles.recentRetryText}>불러오지 못했어요</Text>
              <View style={styles.recentRetryBtn}>
                <Text style={styles.recentRetryBtnText}>다시 시도</Text>
              </View>
            </Pressable>
          </View>
        )}
        {recentItems.length > 0 && (
          <View style={styles.recentSection}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>방금 올라왔어요</Text>
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentScroll}
            >
              {recentItems.map((item) => (
                <Pressable
                  key={`${item.category}-${item.id}`}
                  style={({ pressed }) => [styles.recentCard, pressed && { transform: [{ scale: 0.98 }] }]}
                  onPress={() => router.push(item.href as any)}
                >
                  <View style={styles.recentThumbWrap}>
                    {item.thumbnail ? (
                      <Image
                        source={{ uri: item.thumbnail }}
                        style={styles.recentThumb}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={150}
                      />
                    ) : (
                      <View style={[styles.recentThumb, styles.recentThumbPlaceholder]}>
                        <Text style={[styles.recentPlaceholderText, { color: "#0284c733" }]}>
                          {item.categoryLabel.charAt(0)}
                        </Text>
                      </View>
                    )}
                    {/* 카테고리 배지 — 좌상단 흰 알약 + 딥블루 텍스트 */}
                    <View style={styles.recentBadge}>
                      <Text style={styles.recentBadgeText}>{item.categoryLabel}</Text>
                    </View>
                  </View>
                  <View style={styles.recentCardBody}>
                    {/* 1줄: 제목 */}
                    <Text style={styles.recentTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {/* 2줄: 카테고리별 핵심정보(금액/인원 등) */}
                    {item.chips.length > 0 && (
                      <Text style={styles.recentKeyInfo} numberOfLines={1}>
                        {item.chips[0]}
                      </Text>
                    )}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

          <View style={styles.categoryDivider} />
        </View>
              )
            case "property":
              return (
        <View style={styles.contentArea}>
        {/* ═══════════════════════════════════════════════ */}
        {/*    SECTION: 매물                                */}
        {/* ═══════════════════════════════════════════════ */}
        <View style={styles.sectionGroup}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>우리동네 매물</Text>
            </View>
            <Pressable
              style={styles.viewAll}
              onPress={() => router.push("/property" as any)}
            >
              <Text style={styles.viewAllText}>전체보기</Text>
              <Ionicons name="chevron-forward" size={14} color={lightColors.primary} />
            </Pressable>
          </View>

          {/* Seller-type segment + map toggle */}
          <View
            style={styles.sellerSegmentWrap}
            onLayout={(e) => {
              mapSectionYRef.current = e.nativeEvent.layout.y
            }}
          >
            <View style={styles.sellerSegment}>
              <Pressable
                onPress={() => setSellerType("all")}
                style={[
                  styles.sellerSegItem,
                  sellerType === "all" && styles.sellerSegItemActive,
                ]}
              >
                <Text
                  style={[
                    styles.sellerSegText,
                    sellerType === "all"
                      ? { color: lightColors.ink900, fontWeight: "700" }
                      : { color: lightColors.ink500 },
                  ]}
                >
                  전체 매물
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSellerType("agent")}
                style={[
                  styles.sellerSegItem,
                  sellerType === "agent" && styles.sellerSegItemActive,
                ]}
              >
                <Ionicons
                  name="business-outline"
                  size={13}
                  color={sellerType === "agent" ? lightColors.ink900 : lightColors.ink500}
                />
                <Text
                  style={[
                    styles.sellerSegText,
                    sellerType === "agent"
                      ? { color: lightColors.ink900, fontWeight: "700" }
                      : { color: lightColors.ink500 },
                  ]}
                >
                  공인중개사
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSellerType("individual")}
                style={[
                  styles.sellerSegItem,
                  sellerType === "individual" && styles.sellerSegItemActive,
                ]}
              >
                <Ionicons
                  name="people-outline"
                  size={13}
                  color={sellerType === "individual" ? lightColors.ink900 : lightColors.ink500}
                />
                <Text
                  style={[
                    styles.sellerSegText,
                    sellerType === "individual"
                      ? { color: lightColors.ink900, fontWeight: "700" }
                      : { color: lightColors.ink500 },
                  ]}
                >
                  일반
                </Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => setSellerType(sellerType === "map" as any ? "all" : "map" as any)}
              style={[
                styles.mapPill,
                sellerType === ("map" as any) && styles.mapPillActive,
              ]}
              hitSlop={6}
            >
              <Ionicons
                name="map-outline"
                size={16}
                color={sellerType === ("map" as any) ? "#ffffff" : lightColors.primary}
              />
              <Text
                style={[
                  styles.mapPillText,
                  sellerType === ("map" as any) && { color: "#ffffff" },
                ]}
              >
                지도
              </Text>
            </Pressable>
          </View>

          {/* Quick filter chips + action icons */}
          <View style={styles.chipActionRow}>
            <View style={styles.chipActionLeft}>
              <QuickFilterChip
                label="내 주변"
                active={quickFilter === "nearby"}
                onPress={() => {
                  // 위치 미설정 시 필터가 무작동이므로 안내 + 위치 설정 유도
                  if (quickFilter !== "nearby" && !userLoc?.dong) {
                    Alert.alert(
                      "동네 설정 필요",
                      "내 주변 매물을 보려면 먼저 동네를 설정해주세요.",
                      [
                        { text: "취소", style: "cancel" },
                        { text: "동네 설정", onPress: () => setLocationOpen(true) },
                      ],
                    )
                    return
                  }
                  setQuickFilter(quickFilter === "nearby" ? "none" : "nearby")
                }}
              />
              <QuickFilterChip
                label="인기"
                active={quickFilter === "popular"}
                onPress={() => setQuickFilter(quickFilter === "popular" ? "none" : "popular")}
              />
              <QuickFilterChip
                label="신규"
                active={quickFilter === "new"}
                onPress={() => setQuickFilter(quickFilter === "new" ? "none" : "new")}
              />
            </View>
            <View style={styles.actionIcons}>
              {(() => {
                const filterActive =
                  filter.propertyType !== "전체" ||
                  filter.transactionType !== "전체" ||
                  filter.sellerType !== "전체" ||
                  filter.option !== "전체" ||
                  (filter.district != null && filter.district !== "전체") ||
                  filter.minPrice != null ||
                  filter.maxPrice != null ||
                  filter.minArea != null ||
                  filter.maxArea != null
                const anyActive = filterActive || quickFilter !== "none"
                return (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                    <Pressable
                      onPress={() => setFilterOpen(true)}
                      style={[styles.actionIcon, filterActive && styles.actionIconAccent]}
                      hitSlop={4}
                    >
                      <Ionicons
                        name="options"
                        size={18}
                        color={filterActive ? lightColors.primary : lightColors.ink700}
                      />
                    </Pressable>
                    {anyActive && (
                      <Pressable
                        onPress={() => {
                          setQuickFilter("none")
                          setFilter({
                            propertyType: "전체",
                            transactionType: "전체",
                            sellerType: "전체",
                            option: "전체",
                            district: "전체",
                            minPrice: null,
                            maxPrice: null,
                            minArea: null,
                            maxArea: null,
                          })
                        }}
                        hitSlop={10}
                        style={styles.resetX}
                      >
                        <Ionicons name="close" size={18} color="#dc2626" />
                      </Pressable>
                    )}
                  </View>
                )
              })()}
              <Pressable
                onPress={() => setSortOpen((v) => !v)}
                style={styles.actionIcon}
                hitSlop={4}
              >
                <Ionicons name="swap-vertical" size={18} color={lightColors.ink700} />
              </Pressable>
            </View>
          </View>

          {/* Property carousel / map view */}
          {propertiesLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={lightColors.primary} />
            </View>
          ) : propertiesError ? (
            <View style={[styles.center, { paddingVertical: 24 }]}>
              <Ionicons name="alert-circle-outline" size={32} color={lightColors.ink500} />
              <Text style={{ color: lightColors.ink500, fontSize: 13, marginTop: 8 }}>데이터를 불러오지 못했습니다</Text>
              <Pressable onPress={loadProperties} style={{ marginTop: 8, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6, backgroundColor: lightColors.primary }}>
                <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>다시 시도</Text>
              </Pressable>
            </View>
          ) : (sellerType as any) === "map" ? (
            <View>
              <View style={{ paddingHorizontal: spacing[3] }}>
                <PropertyMapView
                  properties={filteredProperties as any}
                  plazaId={currentPlaza}
                  height={420}
                  selectedId={selectedMapId}
                />
              </View>
              <View style={{ paddingHorizontal: spacing[3], paddingTop: spacing[3] }}>
                <Text style={styles.mapListTitle}>매물 {filteredProperties.length}건</Text>
                {filteredProperties.length === 0 ? (
                  <View style={styles.empty}>
                    <Ionicons name="home-outline" size={32} color={lightColors.ink500} />
                    <Text style={styles.emptyText}>등록된 매물이 없습니다</Text>
                  </View>
                ) : (
                  <View style={{ gap: 8 }}>
                    {filteredProperties.slice(0, 20).map((p) => (
                      <Pressable
                        key={p.id}
                        onPress={() => {
                          setSelectedMapId(null)
                          setTimeout(() => setSelectedMapId(p.id), 0)
                        }}
                        style={({ pressed }) => [
                          styles.mapListRow,
                          pressed && { opacity: 0.85 },
                        ]}
                      >
                        {p.images?.[0] ? (
                          <Image source={{ uri: p.images[0] }} style={styles.mapListThumb} cachePolicy="memory-disk" transition={150} contentFit="cover" />
                        ) : (
                          <View style={[styles.mapListThumb, styles.mapListThumbFallback]}>
                            <Ionicons name="home-outline" size={20} color={lightColors.ink500} />
                          </View>
                        )}
                        <View style={{ flex: 1, gap: 2 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <View
                              style={[
                                styles.mapListBadge,
                                { backgroundColor: txColor(p.transaction_type) },
                              ]}
                            />
                            <Text style={styles.mapListType}>{p.transaction_type}</Text>
                          </View>
                          <Text style={styles.mapListPrice}>{formatPropertyPrice(p)}</Text>
                          <Text style={styles.mapListTitle2} numberOfLines={1}>
                            {p.title}
                          </Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Text style={styles.mapListAddr} numberOfLines={1}>
                              {p.address ?? ""}
                            </Text>
                            {!!p.views && (
                              <Text style={styles.mapListViews}>· 👁 {p.views}</Text>
                            )}
                          </View>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </View>
          ) : displayedProperties.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="home-outline" size={32} color={lightColors.ink500} />
              <Text style={styles.emptyText}>등록된 매물이 없습니다</Text>
            </View>
          ) : (
            <View style={{ position: "relative" }}>
              <ScrollView
                ref={propScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.propertyHScroll}
                onScroll={propEnd.onScroll}
                onContentSizeChange={(w) => propEnd.onContentSize(w)}
                onLayout={(e) => propEnd.onLayout(e.nativeEvent.layout.width)}
                scrollEventThrottle={32}
              >
                {displayedProperties.map((p, i) => (
                  <View key={p.id} style={styles.propertyHCardWrap}>
                    <PropertyMiniCard
                      post={p}
                      highlighted={i === 0 && !!p.is_featured}
                      onPress={() => router.push(`/property/${p.id}` as any)}
                      fillWidth
                    />
                  </View>
                ))}
                <Pressable
                  onPress={() => router.push("/property" as any)}
                  style={({ pressed }) => [
                    styles.propertyMoreCard,
                    pressed && { transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <View
                    style={[
                      styles.propertyMoreIcon,
                      { backgroundColor: lightColors.primary + "1A" },
                    ]}
                  >
                    <Ionicons name="arrow-forward" size={22} color={lightColors.primary} />
                  </View>
                  <Text style={styles.propertyMoreText}>더 보기</Text>
                </Pressable>
              </ScrollView>
              <ScrollFadeHint atEnd={propEnd.atEnd} onPress={() => propEnd.advance(propScrollRef)} />
            </View>
          )}

          {/* Holmes carousel */}
          <HolmesCarousel
            interior={interiorPosts}
            moving={movingPosts}
            cleaning={cleaningPosts}
            repair={repairPosts}
            onMore={(t) => router.push(`/${t}` as any)}
            onCardPress={(t, id) => router.push(`/${t}/${id}` as any)}
          />
        </View>

          <View style={styles.categoryDivider} />
        </View>
              )
            case "trade":
              return (
        <View style={styles.contentArea}>
        {/* ═══════════════════════════════════════════════ */}
        {/*    SECTION: 동네 거래                            */}
        {/* ═══════════════════════════════════════════════ */}
        <View style={styles.sectionGroup}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>동네 거래</Text>
            </View>
          </View>

          <TabbedDomainGroup
            tabs={[
              {
                key: "group_buying",
                title: "공동구매",
                icon: "people-outline",
                color: "#f59e0b",
                posts: groupBuyingPosts,
                basePath: "/group-buying",
                showPrice: true,
                showDiscount: true,
                onMore: () => router.push("/group-buying" as any),
              },
              {
                key: "local_food",
                title: "로컬푸드",
                icon: "leaf-outline",
                color: "#22c55e",
                posts: localFoodPosts,
                basePath: "/local-food",
                showPrice: true,
                onMore: () => router.push("/local-food" as any),
              },
            ]}
          />

          <TabbedDomainGroup
            tabs={[
              {
                key: "secondhand",
                title: "중고거래",
                icon: "cart-outline",
                color: "#10b981",
                posts: secondhandPosts,
                basePath: "/secondhand",
                showPrice: true,
                onMore: () => router.push("/secondhand" as any),
              },
              {
                key: "sharing",
                title: "나눔",
                icon: "heart-outline",
                color: "#ef4444",
                posts: sharingPosts,
                basePath: "/sharing",
                onMore: () => router.push("/sharing" as any),
              },
            ]}
          />
        </View>

          <View style={styles.categoryDivider} />
        </View>
              )
            case "activity":
              return (
        <View style={styles.contentArea}>
        {/* ═══════════════════════════════════════════════ */}
        {/*    SECTION: 동네 활동                            */}
        {/* ═══════════════════════════════════════════════ */}
        <View style={styles.sectionGroup}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>동네 활동</Text>
            </View>
          </View>

          <TabbedDomainGroup
            tabs={[
              {
                key: "clubs",
                title: "모임",
                icon: "people-circle-outline",
                color: "#0ea5e9",
                posts: clubPosts,
                basePath: "/clubs",
                onMore: () => router.push("/clubs" as any),
              },
              {
                key: "jobs",
                title: "구인구직",
                icon: "briefcase-outline",
                color: "#8b5cf6",
                posts: jobsPosts,
                basePath: "/jobs",
                onMore: () => router.push("/jobs" as any),
              },
            ]}
          />

          <DomainSection
            title="신장개업"
            icon="storefront-outline"
            color="#ec4899"
            posts={newStorePosts}
            basePath="/new-store"
            useStoreName
            onMore={() => router.push("/new-store" as any)}
          />
        </View>

          <View style={styles.categoryDivider} />
        </View>
              )
            case "news":
              return (
        <View style={[styles.contentArea, { paddingBottom: spacing[8] }]}>
        {/* ═══════════════════════════════════════════════ */}
        {/*    SECTION: 도시 소식                            */}
        {/* ═══════════════════════════════════════════════ */}
        <View style={styles.sectionGroup}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>{CITY_NAME} 소식</Text>
            </View>
          </View>

          <CityNewsCard
            cityName={CITY_NAME}
            news={news}
            events={events}
            weather={weather}
            coverage={plazaCoverage}
            onOpenNews={() => router.push("/news" as any)}
            onRefresh={() => setRefreshKey((k) => k + 1)}
          />

          {/* Nearby utilities */}
          <View style={styles.findRow}>
            <Pressable
              onPress={() => router.push("/toilets" as any)}
              style={({ pressed }) => [styles.findCard, pressed && { opacity: 0.7 }]}
            >
              <View style={[styles.findIcon, { backgroundColor: "rgba(59,130,246,0.1)" }]}>
                <Ionicons name="trail-sign-outline" size={22} color="#3b82f6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.findTitle}>내 주변 화장실</Text>
                <Text style={styles.findSub}>위치 찾기 →</Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => router.push("/gas-stations" as any)}
              style={({ pressed }) => [styles.findCard, pressed && { opacity: 0.7 }]}
            >
              <View style={[styles.findIcon, { backgroundColor: "rgba(234,88,12,0.1)" }]}>
                <Ionicons name="car-outline" size={22} color="#ea580c" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.findTitle}>내 주변 주유소</Text>
                <Text style={styles.findSub}>위치 찾기 →</Text>
              </View>
            </Pressable>
          </View>
        </View>
        </View>
              )
            default:
              return null
          }
        }}
      />

      {/* ── Modals ──────────────────────────────────────────── */}

      {/* Plaza selector bottom sheet */}
      <PlazaSelector
        visible={plazaSelectorOpen}
        onClose={() => setPlazaSelectorOpen(false)}
        currentPlazaId={currentPlaza}
        currentPlazaName={PLAZA_NAME}
      />

      {/* Search input modal */}
      <Modal
        visible={searchModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSearchModalOpen(false)}
        statusBarTranslucent
      >
        <Pressable style={styles.searchModalBackdrop} onPress={() => setSearchModalOpen(false)}>
          <Pressable style={styles.searchModalContent} onPress={() => {}}>
            <View style={styles.searchModalInputRow}>
              <Ionicons name="search-outline" size={20} color="#9ca3af" />
              <TextInput
                ref={searchInputRef}
                style={styles.searchModalInput}
                value={searchInput}
                onChangeText={setSearchInput}
                placeholder="검색어를 입력하세요"
                placeholderTextColor="#9ca3af"
                autoFocus
                returnKeyType="search"
                onSubmitEditing={() => {
                  const trimmed = searchInput.trim()
                  if (!trimmed) return
                  setSearchModalOpen(false)
                  setSearchInput("")
                  router.push(`/(tabs)/search?q=${encodeURIComponent(trimmed)}` as any)
                }}
              />
              {searchInput.length > 0 && (
                <Pressable hitSlop={8} onPress={() => setSearchInput("")}>
                  <Ionicons name="close-circle" size={18} color="#d1d5db" />
                </Pressable>
              )}
            </View>
            <Pressable
              style={[
                styles.searchModalBtn,
                !searchInput.trim() && { opacity: 0.4 },
              ]}
              disabled={!searchInput.trim()}
              onPress={() => {
                const trimmed = searchInput.trim()
                if (!trimmed) return
                setSearchModalOpen(false)
                router.push(`/(tabs)/search?q=${encodeURIComponent(trimmed)}` as any)
              }}
            >
              <Text style={styles.searchModalBtnText}>검색</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Sort bottom sheet */}
      <Modal
        visible={sortOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSortOpen(false)}
        statusBarTranslucent
      >
        <Pressable style={styles.sortBackdrop} onPress={() => setSortOpen(false)}>
          <Pressable
            style={styles.sortSheet}
            onPress={(e) => e.stopPropagation && e.stopPropagation()}
          >
            <Text style={styles.sortSheetTitle}>정렬</Text>
            {SORT_OPTIONS.map((o) => (
              <Pressable
                key={o.value}
                onPress={() => {
                  setSortBy(o.value)
                  setSortOpen(false)
                }}
                style={[
                  styles.sortSheetItem,
                  sortBy === o.value && styles.sortMenuItemActive,
                ]}
              >
                <Text
                  style={[
                    styles.sortSheetItemText,
                    sortBy === o.value && {
                      color: lightColors.primary,
                      fontWeight: "700",
                    },
                  ]}
                >
                  {o.label}
                </Text>
                {sortBy === o.value && (
                  <Ionicons name="checkmark" size={18} color={lightColors.primary} />
                )}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Property filter modal */}
      <PropertyFilterModal
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        value={filter}
        onChange={setFilter}
        showDistrict
        plazaId={currentPlaza}
      />

      {/* Location selector modal */}
      <LocationSelector
        visible={locationOpen}
        onClose={() => setLocationOpen(false)}
        location={userLoc}
        plazaId={currentPlaza}
        onLocationChange={(loc) => {
          setUserLoc(loc)
          if (loc.dong) setSubRegion(loc.dong)
          else if (loc.sigungu) setSubRegion(loc.sigungu)
        }}
      />
    </View>
  )
}

// ─── Helper Components ────────────────────────────────────────────────────────

const QuickFilterChip = memo(function QuickFilterChip({
  label,
  active,
  onPress,
}: {
  icon?: any
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.quickFilterChip, active && styles.quickFilterChipActive]}
    >
      <Text
        style={[
          styles.quickFilterChipText,
          active && { color: "#ffffff", fontWeight: "700" },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
})

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(colors: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    recentRetryBox: { marginHorizontal: spacing[4], paddingVertical: 24, alignItems: "center", borderRadius: 12, backgroundColor: colors.card ?? "#f3f4f6", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border ?? "#e5e7eb" },
    recentRetryText: { color: colors.ink500, fontSize: 13, marginBottom: 8 },
    recentRetryBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primary },
    recentRetryBtnText: { color: "#ffffff", fontSize: 13, fontWeight: "600" },

    // ═════ Header — 고정 화이트 (C안: 토스/카카오 미니멀) ═════
    headerSafeArea: {
      backgroundColor: "#ffffff",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing[4],
      paddingVertical: 8,
    },
    plazaNameWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    plazaPin: {
      width: 20,
      height: 20,
    } as any,
    plazaNameText: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.ink900,
      letterSpacing: -0.3,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    headerBtn: {
      padding: 6,
      position: "relative",
    },
    avatarBtn: {
      width: 32, height: 32, borderRadius: 999,
      overflow: "hidden",
      borderWidth: 2, borderColor: "rgba(244,63,94,0.6)",
      backgroundColor: colors.muted,
      alignItems: "center", justifyContent: "center",
      marginLeft: 6,
    },
    avatarImg: { width: "100%", height: "100%" },
    // Search bar (연한 그레이 필 — 토스 스타일)
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: spacing[4],
      marginTop: 0,
      marginBottom: 8,
      paddingHorizontal: 14,
      height: 56,
      borderRadius: 28,
      backgroundColor: "#f3f4f6",
      gap: 8,
    },
    searchBarInput: {
      flex: 1,
      fontSize: 14,
      color: colors.ink900,
      padding: 0,
    },
    // Search modal
    searchModalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "flex-start",
      paddingTop: 80,
    },
    searchModalContent: {
      marginHorizontal: spacing[4],
      backgroundColor: "#ffffff",
      borderRadius: 16,
      padding: 16,
      gap: 12,
      shadowColor: "#000",
      shadowOpacity: 0.15,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    searchModalInputRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#f3f4f6",
      borderRadius: 12,
      paddingHorizontal: 14,
      height: 48,
      gap: 10,
    },
    searchModalInput: {
      flex: 1,
      fontSize: 16,
      color: "#111827",
      padding: 0,
    },
    searchModalBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
    },
    searchModalBtnText: {
      color: "#ffffff",
      fontSize: 16,
      fontWeight: "700",
    },
    notifBadge: {
      position: "absolute", top: 2, right: 2,
      minWidth: 14, height: 14, paddingHorizontal: 3, borderRadius: 999,
      backgroundColor: "#ef4444",
      alignItems: "center", justifyContent: "center",
    },
    notifBadgeText: { color: "#ffffff", fontSize: 9, fontWeight: "700" },
    loginBtn: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: "#f3f4f6",
    },
    loginBtnText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.ink900,
    },

    scrollBg: {
      backgroundColor: "#ffffff",
    },
    // ═════ Hero Banner — 둥근 카드 + 그림자 (카테고리 아래) ═════
    heroBannerWrap: {
      paddingHorizontal: spacing[4],
      paddingTop: 0,
      paddingBottom: 4,
    },
    heroCard: {
      borderRadius: 16,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    hero: {
      minHeight: 140,
      backgroundColor: "#0d6ec5",
      justifyContent: "flex-end",
      alignItems: "stretch",
      position: "relative",
      overflow: "hidden",
    },
    heroContent: {
      paddingHorizontal: spacing[4],
      paddingTop: 16, paddingBottom: 20,
      gap: 2,
      alignItems: "flex-start",
    },
    heroTitle: {
      fontSize: 24, fontWeight: "800", color: "#ffffff",
      letterSpacing: -0.5, lineHeight: 30,
      textShadowColor: "rgba(0,0,0,0.5)",
      textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 },
    },
    heroSubtitle: {
      fontSize: 14, fontWeight: "600", color: "rgba(255,255,255,0.95)",
      textShadowColor: "rgba(0,0,0,0.4)",
      textShadowRadius: 3,
      marginTop: 2,
    },
    heroDesc: {
      fontSize: 12, color: "rgba(255,255,255,0.8)",
      textShadowColor: "rgba(0,0,0,0.4)",
      textShadowRadius: 3,
      marginTop: 4,
    },
    heroBtnText: {
      flexDirection: "row", alignItems: "center", gap: 4,
      marginTop: 10,
      backgroundColor: "rgba(255,255,255,0.2)",
      paddingHorizontal: 12, paddingVertical: 6,
      borderRadius: 8,
    },
    heroBtnLabel: {
      fontSize: 13, fontWeight: "700", color: "#ffffff",
    },
    heroProgress: {
      position: "absolute", bottom: 10,
      left: spacing[4], right: spacing[4],
      flexDirection: "row", gap: 4,
    },
    heroProgressSeg: {
      flex: 1, height: 3, borderRadius: 2,
      backgroundColor: "rgba(255,255,255,0.3)",
    },
    heroProgressSegActive: {
      backgroundColor: "#ffffff",
    },

    // ═════ Main content area (below banner) ═════
    contentArea: {
      backgroundColor: "#ffffff",
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      marginTop: 0,
      overflow: "hidden",
    },
    catTabBar: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: "#f1f5f9",
      paddingHorizontal: spacing[4],
      gap: 24,
    },
    catTab: {
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    catTabActive: {
      borderBottomColor: colors.ink900,
    },
    catTabText: {
      fontSize: 14,
      fontWeight: "600",
      color: "#94a3b8",
    },
    catTabTextActive: {
      color: colors.ink900,
      fontWeight: "800",
    },
    categoryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      paddingHorizontal: spacing[2],
      paddingTop: 12,
      paddingBottom: 16,
    },
    categoryItem: {
      width: "25%",
      alignItems: "center",
      paddingVertical: 10,
      gap: 6,
    },
    categoryIconWrap: {
      width: 56,
      height: 56,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#f3f4f6",
      borderRadius: 16,
    },
    categoryIcon3d: {
      width: 42,
      height: 42,
    } as any,
    categoryLabel: {
      fontSize: 11,
      fontWeight: "400",
      color: colors.ink900,
      textAlign: "center",
    },
    categoryDivider: {
      height: 8,
      backgroundColor: "#f1f5f9",
    },

    // ═════ 방금 올라왔어요 ═════
    recentSection: {
      paddingTop: 20,
      paddingBottom: 16,
    },
    recentScroll: {
      paddingHorizontal: spacing[4],
      gap: 12,
      paddingTop: 12,
    },
    // 매물 카드(PropertyMiniCard) 디자인과 동일 — 이미지+배지+하트+제목+가격+위치+조회/좋아요
    recentCard: {
      width: 196,
      backgroundColor: colors.background,
      borderRadius: 16,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: 0.04,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
    recentThumbWrap: {
      position: "relative",
      width: "100%",
      aspectRatio: 4 / 3,
      borderRadius: 16,
      overflow: "hidden",
      backgroundColor: colors.muted,
    },
    recentThumb: {
      width: "100%",
      height: "100%",
    },
    recentThumbPlaceholder: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.muted,
    },
    recentPlaceholderText: {
      fontSize: 36,
      fontWeight: "700",
    },
    recentBadge: {
      position: "absolute",
      top: 8,
      left: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: "rgba(255,255,255,0.95)",
      shadowColor: "#000",
      shadowOpacity: 0.15,
      shadowRadius: 2,
      shadowOffset: { width: 0, height: 1 },
      elevation: 2,
    },
    recentBadgeText: {
      color: "#0284c7",
      fontSize: 11,
      fontWeight: "700",
    },
    recentHeart: {
      position: "absolute",
      top: 6,
      right: 6,
    },
    recentCardBody: {
      paddingHorizontal: 10,
      paddingTop: 8,
      paddingBottom: 10,
      gap: 3,
    },
    recentHighlight: {
      fontSize: 17,
      fontWeight: "800",
      letterSpacing: -0.3,
      color: colors.ink900,
    },
    recentTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.ink900,
      lineHeight: 19,
    },
    recentKeyInfo: {
      fontSize: 14,
      fontWeight: "700",
      color: "#0284c7",
      letterSpacing: -0.2,
    },
    recentAddrRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
    },
    recentAddr: {
      fontSize: 11,
      color: colors.ink500,
      flex: 1,
    },
    recentFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    recentAgo: {
      fontSize: 10,
      color: colors.ink500,
    },
    recentStats: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
    },
    recentStatText: {
      fontSize: 10,
      color: colors.ink500,
      marginRight: 3,
    },

    // ═════ Section Groups ═════
    sectionGroup: {
      paddingTop: 20,
      paddingBottom: 12,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing[4],
      marginBottom: 4,
    },
    sectionTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: "600",
      letterSpacing: -0.4,
      color: colors.ink900,
    },
    viewAll: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
    },
    viewAllText: {
      fontSize: 12,
      color: colors.primary,
      fontWeight: "600",
    },

    // ═════ Seller Segment ═════
    sellerSegmentWrap: {
      paddingHorizontal: spacing[4],
      paddingTop: spacing[3],
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    sellerSegment: {
      flexDirection: "row",
      backgroundColor: "#eef0f3",
      borderRadius: 999,
      padding: 3,
    },
    sellerSegItem: {
      flexDirection: "row", alignItems: "center", gap: 5,
      paddingHorizontal: 12, paddingVertical: 7,
      borderRadius: 999,
    },
    sellerSegItemActive: {
      backgroundColor: "#ffffff",
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
      elevation: 2,
    },
    sellerSegText: { fontSize: 12.5, fontWeight: "500" },

    // Map pill
    mapPill: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingHorizontal: 14, paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: "#ffffff",
      borderWidth: 1,
      borderColor: colors.primary,
      shadowColor: colors.primary,
      shadowOpacity: 0.15,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    mapPillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
      shadowOpacity: 0.35,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 5,
    },
    mapPillText: {
      fontSize: 13, fontWeight: "700", color: colors.primary,
      letterSpacing: -0.2,
    },

    // ═════ Chips + Actions ═════
    chipActionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing[4],
      paddingTop: spacing[3],
      paddingBottom: spacing[2],
      gap: 8,
    },
    chipActionLeft: {
      flexDirection: "row",
      flexShrink: 1,
      gap: 6,
    },
    quickFilterChip: {
      flexDirection: "row", alignItems: "center", gap: 4,
      paddingHorizontal: 12, paddingVertical: 0,
      height: 38,
      borderRadius: 999,
      borderWidth: 1, borderColor: colors.border,
      backgroundColor: colors.background,
      justifyContent: "center",
    },
    quickFilterChipActive: {
      backgroundColor: "#1f2937",
      borderColor: "#1f2937",
    },
    quickFilterChipText: {
      fontSize: 13, fontWeight: "600", color: colors.ink900,
      lineHeight: 16, includeFontPadding: false, textAlignVertical: "center",
    } as any,
    actionIcons: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    actionIcon: {
      width: 46, height: 38, borderRadius: 999,
      alignItems: "center", justifyContent: "center",
      borderWidth: 1, borderColor: colors.border,
      backgroundColor: "#ffffff",
    },
    actionIconAccent: {
      backgroundColor: colors.primary + "0F",
      borderColor: colors.primary,
    },
    resetX: {
      width: 46, height: 38, borderRadius: 999,
      alignItems: "center", justifyContent: "center",
      backgroundColor: "#fee2e2",
      borderWidth: 1, borderColor: "#fca5a5",
      marginLeft: 4,
    },

    // ═════ Property carousel ═════
    propertyHScroll: {
      paddingHorizontal: spacing[3],
      gap: spacing[2],
    },
    propertyHCardWrap: {
      width: 200,
    },
    propertyMoreCard: {
      width: 200,
      height: 280,
      borderRadius: 16,
      borderWidth: 1, borderStyle: "dashed",
      borderColor: "rgba(0,0,0,0.12)",
      backgroundColor: "rgba(255,255,255,0.6)",
      alignItems: "center", justifyContent: "center",
      gap: 10,
    },
    propertyMoreIcon: {
      width: 48, height: 48, borderRadius: 999,
      alignItems: "center", justifyContent: "center",
    },
    propertyMoreText: {
      fontSize: 13, fontWeight: "700", color: colors.ink900,
    },

    // ═════ Map mode list ═════
    mapListTitle: {
      fontSize: 14, fontWeight: "700", color: colors.ink900, marginBottom: 10,
    },
    mapListRow: {
      flexDirection: "row", gap: 10,
      backgroundColor: "#ffffff", padding: 10, borderRadius: 10,
      borderWidth: 1, borderColor: colors.border,
    },
    mapListThumb: {
      width: 64, height: 64, borderRadius: 8, backgroundColor: colors.muted,
    },
    mapListThumbFallback: {
      alignItems: "center", justifyContent: "center",
    },
    mapListBadge: {
      width: 6, height: 6, borderRadius: 999,
    },
    mapListType: {
      fontSize: 11, fontWeight: "700", color: colors.ink900,
    },
    mapListPrice: {
      fontSize: 14, fontWeight: "800", color: colors.ink900,
    },
    mapListTitle2: {
      fontSize: 12, color: colors.ink700,
    },
    mapListAddr: {
      fontSize: 11, color: colors.ink500, flex: 1,
    },
    mapListViews: {
      fontSize: 11, color: colors.ink500,
    },

    // ═════ Empty / Center ═════
    center: { padding: spacing[8], alignItems: "center" },
    empty: { padding: spacing[8], alignItems: "center", gap: spacing[2] },
    emptyText: { color: colors.ink500, fontSize: fontSize.sm },

    // ═════ Nearby Utilities ═════
    findRow: {
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 16,
      marginTop: 12,
    },
    findCard: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: "#ffffff",
      borderWidth: 1,
      borderColor: colors.border,
    },
    findIcon: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: "center", justifyContent: "center",
    },
    findTitle: { fontSize: 13, fontWeight: "700", color: colors.ink900 },
    findSub: { fontSize: 11, color: colors.ink500, marginTop: 2 },

    // ═════ Sort Modal ═════
    sortBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "flex-end",
    },
    sortSheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingHorizontal: 8,
      paddingTop: 12,
      paddingBottom: 24,
    },
    sortSheetTitle: {
      fontSize: 14, fontWeight: "700", color: colors.ink900,
      paddingHorizontal: 12, paddingVertical: 8,
      marginBottom: 4,
    },
    sortSheetItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderRadius: 8,
    },
    sortSheetItemText: {
      fontSize: 14, color: colors.ink900,
    },
    sortMenuItemActive: {
      backgroundColor: colors.primary + "0F",
    },
  })
}

// Module-level fallback styles for helper components
const styles = makeStyles(lightColors)
