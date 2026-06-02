"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import dynamicImport from "next/dynamic"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import { Header } from "@/components/header"
import { FilterBar } from "@/components/filter-bar"
import { PropertyCard } from "@/components/property-card"
import { PullToRefreshWrapper } from "@/components/pull-to-refresh-wrapper"
import { BottomNav } from "@/components/bottom-nav"
import { HeroBannerClient, type BannerData } from "@/components/hero-banner-client"
import { Property, FilterOptions } from "@/types/app"
import { Search, Building2, Users, Paintbrush, ChevronRight, ChevronDown, Truck, SprayCan, Wrench, Home, Heart, ShoppingCart, Store, Leaf, MessageSquare, Utensils, Lightbulb, Camera, HelpCircle, Briefcase, UserCircle2, HandHeart, KeyRound, Map } from "lucide-react"
// 동적 import — Naver Maps SDK (~300KB+) 가 "지도로 보기" 누를 때만 로드
const PropertyMapView = dynamicImport(
  () => import("@/components/property-map-view").then((m) => m.PropertyMapView),
  { ssr: false, loading: () => <div className="w-full h-[500px] bg-muted/30 rounded-md animate-pulse" /> },
)
import { ServiceCard, ServicePost } from "@/components/service-card"
import { SharingCard, SharingPost } from "@/components/sharing-card"
import { GroupBuyingCard, GroupBuyingPost } from "@/components/group-buying-card"
import { NewStoreCard, NewStorePost } from "@/components/new-store-card"
import { EditableIcon } from "@/components/editable-icon"
import { CategoryMiniNav } from "@/components/category-mini-nav"
import { useLabel } from "@/components/site-labels-client"
import { LocalFoodCard, LocalFoodPost } from "@/components/local-food-card"
import { ClubCard, ClubPost } from "@/components/club-card"
import { SecondhandCard, type SecondhandPost } from "@/components/secondhand-card"
import { JobsCard, type JobsPost } from "@/components/jobs-card"
import Link from "next/link"
import { User } from "@supabase/supabase-js"
import { UserLocation } from "@/components/location-selector"
import { formatShortLocation } from "@/lib/constants/korea-regions"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
// ChuncheonNews 는 홈 페이지 하단 위젯 — 첫 LCP 무관 → dynamic import (-50KB JS)
const ChuncheonNews = dynamicImport(
  () => import("@/components/chuncheon-news").then((m) => m.ChuncheonNews),
  { ssr: false, loading: () => <div className="max-w-7xl mx-auto px-4 py-6 h-[400px]" /> },
)
// NearbyToilets 는 /toilets 전용 페이지로 이동됨
// PlazaLiveWidget — 페이지 하단 위젯 (below the fold). 초기 번들 분리.
const PlazaLiveWidget = dynamicImport(
  () => import("@/components/plaza-live-widget").then((m) => m.PlazaLiveWidget),
  { ssr: false, loading: () => <div className="max-w-3xl mx-auto px-4 py-8 h-[400px]" /> },
)

interface HomePageProps {
  properties: Property[]
  user: User | null
  banners: BannerData[]
  /** SSR 초기 데이터 — 서버에서 미리 가져온 각 섹션 게시물 (없으면 클라이언트에서 fetch) */
  initialData?: {
    interiorPosts?: ServicePost[]
    movingPosts?: ServicePost[]
    cleaningPosts?: ServicePost[]
    repairPosts?: ServicePost[]
    sharingPosts?: SharingPost[]
    groupBuyingPosts?: GroupBuyingPost[]
    localFoodPosts?: LocalFoodPost[]
    newStorePosts?: NewStorePost[]
    clubPosts?: ClubPost[]
    secondhandPosts?: SecondhandPost[]
    jobsPosts?: JobsPost[]
  }
}

type QuickFilter = "none" | "nearby" | "popular" | "new"
type SellerTypeFilter = "all" | "agent" | "individual" | "map"

const LOCATION_STORAGE_KEY = "user-location"

export function HomePage({ properties, user, banners, initialData }: HomePageProps) {
  const [filters, setFilters] = useState<FilterOptions>({
    propertyType: "전체",
    transactionType: "전체",
    district: "전체"
  })
  const [searchAddress, setSearchAddress] = useState("")
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("none")
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null)
  const [sellerTypeFilter, setSellerTypeFilter] = useState<SellerTypeFilter>("all")
  // 배너 carousel index — HeroBanner 와 CategoryMiniNav 가 같은 이미지 배경을 공유하기 위해 부모로 끌어올림
  const [bannerIndex, setBannerIndex] = useState(0)
  const [sortBy, setSortBy] = useState<"latest" | "priceAsc" | "priceDesc" | "areaDesc">("latest")
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userAccountType, setUserAccountType] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [interiorPosts, setInteriorPosts] = useState<ServicePost[]>(initialData?.interiorPosts ?? [])
  const [movingPosts, setMovingPosts] = useState<ServicePost[]>(initialData?.movingPosts ?? [])
  const [cleaningPosts, setCleaningPosts] = useState<ServicePost[]>(initialData?.cleaningPosts ?? [])
  const [repairPosts, setRepairPosts] = useState<ServicePost[]>(initialData?.repairPosts ?? [])
  const [sharingPosts, setSharingPosts] = useState<SharingPost[]>(initialData?.sharingPosts ?? [])
  const [groupBuyingPosts, setGroupBuyingPosts] = useState<GroupBuyingPost[]>(initialData?.groupBuyingPosts ?? [])
  const [localFoodPosts, setLocalFoodPosts] = useState<LocalFoodPost[]>(initialData?.localFoodPosts ?? [])
  const [newStorePosts, setNewStorePosts] = useState<NewStorePost[]>(initialData?.newStorePosts ?? [])
  const [clubPosts, setClubPosts] = useState<ClubPost[]>(initialData?.clubPosts ?? [])
  const [secondhandPosts, setSecondhandPosts] = useState<SecondhandPost[]>(initialData?.secondhandPosts ?? [])
  const [jobsPosts, setJobsPosts] = useState<JobsPost[]>(initialData?.jobsPosts ?? [])
  // H6: 로딩 상태 — SSR 초기 데이터가 있으면 로딩 완료 상태로 시작
  const [serviceLoading, setServiceLoading] = useState(!initialData)
  const [communityLoading, setCommunityLoading] = useState(true)
  const [propertyHubOpen, setPropertyHubOpen] = useState(false)
  // 슈퍼관리자 편집 가능한 미니네비 라벨
  const lblMiniBoard       = useLabel("home.minimav.board.label",        "게시판")
  const lblMiniSecondhand  = useLabel("home.minimav.secondhand.label",   "중고거래")
  const lblMiniSharing     = useLabel("home.minimav.sharing.label",      "나눔")
  const lblMiniClubs       = useLabel("home.minimav.clubs.label",        "모임")
  const lblMiniLocalFood   = useLabel("home.minimav.local_food.label",   "로컬푸드")
  const lblMiniGroupBuying = useLabel("home.minimav.group_buying.label", "공동구매")
  const lblMiniJobs        = useLabel("home.minimav.jobs.label",         "구인구직")
  const lblMiniNewStore    = useLabel("home.minimav.new_store.label",    "신장개업")
  // 슈퍼관리자가 편집 가능한 매물 허브 라벨
  const lblPropertyHubTitle    = useLabel("home.hub.property.title", "매물 더 보기")
  const lblPropertyHubSubtitle = useLabel("home.hub.property.subtitle", "공인중개사 · 일반인 · 의뢰 요청")
  const lblAgentTitle    = useLabel("home.hub.property.agent.title", "공인중개사 매물")
  const lblAgentSubtitle = useLabel("home.hub.property.agent.subtitle", "검증된 중개사 매물")
  const lblIndividualTitle    = useLabel("home.hub.property.individual.title", "일반인 매물")
  const lblIndividualSubtitle = useLabel("home.hub.property.individual.subtitle", "이웃이 내놓은 매물")
  const lblRequestTitle    = useLabel("home.hub.property.request.title", "구해주세요")
  const lblRequestSubtitle = useLabel("home.hub.property.request.subtitle", "중개사에게 매물 요청")
  const [showAllProperties, setShowAllProperties] = useState(false)

  // 저장된 위치 불러오기
  useEffect(() => {
    const saved = localStorage.getItem(LOCATION_STORAGE_KEY)
    if (saved) {
      try {
        setUserLocation(JSON.parse(saved))
      } catch {
        // ignore
      }
    }
  }, [])

  // 사용자 역할 및 위치 가져오기
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user) return
      const supabase = createClient()
      const { data } = await supabase
        .from('profiles')
        .select('role, account_type, location, is_admin')
        .eq('id', user.id)
        .single()
      if (data) {
        setUserRole(data.role)
        setUserAccountType(data.account_type)
        // role이 'admin' 또는 'superadmin'이면 관리자
        setIsAdmin(data.role === 'admin' || data.role === 'superadmin')
        
        // 프로필에 저장된 location 은 localStorage 가 "아직 비어있을 때"만 기본값으로 사용.
        // (사용자가 헤더에서 직접 고른 동네를 매 페이지 이동 시 덮어쓰면 안 됨)
        if (data.location && typeof data.location === 'string') {
          const already = localStorage.getItem(LOCATION_STORAGE_KEY)
          if (!already) {
            const parts = data.location.split(' ')
            if (parts.length >= 2) {
              const parsedLocation: UserLocation = {
                sido: parts[0],
                sigungu: parts[1],
                dong: parts.slice(2).join(' ') || undefined
              }
              setUserLocation(parsedLocation)
              localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(parsedLocation))
            }
          }
        }
      }
    }
    fetchUserProfile()
  }, [user])

  // 서비스 게시글 가져오기 — 11개 테이블을 Promise.all 로 병렬화
  // (이전엔 순차 await 로 550~1100ms 블로킹. 병렬로 -700ms 절감)
  // userLocation 영향받는 4개와 plaza 만 영향받는 7개를 분리 의존:
  //   - 위치 의존 4개 (interior/moving/cleaning/repair) → [userLocation, plaza]
  //   - 위치 무관 7개 (sharing/group_buying/new_store/local_food/clubs/secondhand/jobs) → [plaza]
  const plazaKey = (typeof window !== 'undefined') ? getCurrentPlazaClient() : null
  // service_region = sido(시/도), service_district = sigungu(시/군/구) 로 저장됨 (등록 폼 기준).
  // 기존엔 존재하지 않는 region/district 필드를 읽어 항상 null → 위치 필터 무작동이었음.
  const region = userLocation?.sido ?? null
  const district = userLocation?.sigungu ?? null

  // 위치 의존 4개 — SSR 초기 데이터가 있고 위치 미설정이면 첫 마운트 스킵
  const skipInitialServiceFetch = useRef(!!initialData && !region && !district)
  useEffect(() => {
    if (skipInitialServiceFetch.current) {
      skipInitialServiceFetch.current = false
      return
    }
    const supabase = createClient()
    const plaza = getCurrentPlazaClient()

    const applyLocationFilter = (query: any) => {
      if (plaza) query = query.eq('plaza_id', plaza)
      if (region) {
        query = query.eq('service_region', region)
        if (district) query = query.eq('service_district', district)
      }
      return query
    }

    const make = (table: string) =>
      applyLocationFilter(
        (supabase as any).from(table).select('*').eq('status', 'active'),
      )
        .order('effective_at', { ascending: false })
        .limit(8)

    Promise.all([
      make('interior_posts'),
      make('moving_posts'),
      make('cleaning_posts'),
      make('repair_posts'),
    ]).then(([i, m, c, r]: any[]) => {
      if (i.data) setInteriorPosts(i.data as ServicePost[])
      if (m.data) setMovingPosts(m.data as ServicePost[])
      if (c.data) setCleaningPosts(c.data as ServicePost[])
      if (r.data) setRepairPosts(r.data as ServicePost[])
      setServiceLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, district, plazaKey])

  // 위치 무관 7개 — plaza 만 의존 (위치 바꿔도 재호출 X)
  // SSR 초기 데이터가 있으면 첫 마운트 스킵
  const skipInitialPlazaFetch = useRef(!!initialData)
  useEffect(() => {
    if (skipInitialPlazaFetch.current) {
      skipInitialPlazaFetch.current = false
      return
    }
    const supabase = createClient()
    const plaza = getCurrentPlazaClient()
    const withPlaza = (query: any) => (plaza ? query.eq('plaza_id', plaza) : query)

    const sharingQ = withPlaza(
      supabase.from('sharing_posts')
        .select('*')
        .eq('status', 'active'),
    ).order('likes', { ascending: false }).order('created_at', { ascending: false }).limit(4)

    const groupBuyingQ = withPlaza(
      supabase.from('group_buying_posts')
        .select('*')
        .eq('status', 'recruiting'),
    ).order('effective_at', { ascending: false }).limit(20)

    const newStoreQ = withPlaza(
      supabase.from('new_store_posts')
        .select('*')
        .eq('status', 'active'),
    ).order('likes', { ascending: false }).order('effective_at', { ascending: false }).limit(4)

    const localFoodQ = withPlaza(
      supabase
        .from('local_food')
        .select('*, author:profiles!user_id(id, nickname, avatar_url)')
        .eq('status', 'available'),
    ).order('effective_at', { ascending: false }).limit(4)

    const clubsQ = withPlaza(
      supabase.from('clubs')
        .select('*')
        .eq('status', 'recruiting'),
    ).order('created_at', { ascending: false }).limit(4)

    const secondhandQ = withPlaza(
      supabase.from('secondhand_posts')
        .select('*')
        .eq('status', 'active'),
    ).order('effective_at', { ascending: false }).limit(4)

    const jobsQ = withPlaza(
      supabase.from('jobs_posts')
        .select('*')
        .eq('status', 'active'),
    ).order('effective_at', { ascending: false }).limit(4)

    Promise.all([sharingQ, groupBuyingQ, newStoreQ, localFoodQ, clubsQ, secondhandQ, jobsQ]).then(
      ([sh, gb, ns, lf, cl, se, jb]: any[]) => {
        if (sh.data) setSharingPosts(sh.data as SharingPost[])
        if (gb.data) {
          // 할인율 기준 정렬
          const sorted = (gb.data as GroupBuyingPost[]).sort((a, b) => {
            const dA = a.original_price && a.original_price > 0
              ? ((a.original_price - a.group_price) / a.original_price) * 100
              : 0
            const dB = b.original_price && b.original_price > 0
              ? ((b.original_price - b.group_price) / b.original_price) * 100
              : 0
            return dB - dA
          })
          setGroupBuyingPosts(sorted.slice(0, 4))
        }
        if (ns.data) setNewStorePosts(ns.data as NewStorePost[])
        if (lf.data) setLocalFoodPosts(lf.data as LocalFoodPost[])
        if (cl.data) setClubPosts(cl.data as ClubPost[])
        if (se.data) setSecondhandPosts(se.data as SecondhandPost[])
        if (jb.data) setJobsPosts(jb.data as JobsPost[])
        setCommunityLoading(false)
      },
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plazaKey])

  // 위치 변경 핸들러
  const handleLocationChange = (location: UserLocation) => {
    setUserLocation(location)
    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(location))
  }

  // 빠른 필터 핸들러
  const handleQuickFilter = (filter: QuickFilter) => {
    if (quickFilter === filter) {
      setQuickFilter("none")
    } else {
      setQuickFilter(filter)
    }
  }

  // 필터링된 매물 목록 — single-pass 최적화 (sort 4번 → 1번, new Date 매번 생성 제거)
  const filteredProperties = useMemo(() => {
    // 미리 한 번만 계산 (props/state 변경 시에만 재실행)
    const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000
    const nearbyNeedle =
      quickFilter === 'nearby' && userLocation
        ? userLocation.dong || userLocation.sigungu || userLocation.sido
        : null
    const nearbyBase = nearbyNeedle ? nearbyNeedle.replace(/\d+동$/, '동') : null
    const searchPrefix = searchAddress ? searchAddress.split(' ')[0] : null

    // ── 1) Single-pass filter — 모든 조건 하나의 루프에서
    const filtered: typeof properties = []
    for (const p of properties) {
      // 판매자 유형
      if (sellerTypeFilter !== 'all') {
        const sellerType = p.seller_type || 'individual'
        if (sellerTypeFilter === 'agent' && sellerType !== 'agent') continue
        if (sellerTypeFilter === 'individual' && sellerType !== 'individual') continue
      }
      // 매물 / 거래 유형
      if (filters.propertyType !== '전체' && p.propertyType !== filters.propertyType) continue
      if (filters.transactionType !== '전체' && p.transactionType !== filters.transactionType) continue
      // 지역
      if (filters.district !== '전체' && !p.address?.includes(filters.district as string)) continue
      // 판매자 유형 (모달에서 선택된 경우)
      if (filters.sellerType && filters.sellerType !== '전체') {
        const st = p.seller_type || 'individual'
        if (st !== filters.sellerType) continue
      }
      // 옵션 (주차/엘리베이터/반려동물)
      if (filters.option && filters.option !== '전체') {
        if (filters.option === 'parking' && !p.parking) continue
        if (filters.option === 'elevator' && !p.elevator) continue
        if (filters.option === 'pet' && !p.petAllowed) continue
      }
      // 주소 검색
      if (searchPrefix && !p.address?.includes(searchPrefix)) continue
      // 가격/면적
      if (filters.minPrice != null && p.price < filters.minPrice) continue
      if (filters.maxPrice != null && p.price > filters.maxPrice) continue
      if (filters.minArea != null && p.area < filters.minArea) continue
      if (filters.maxArea != null && p.area > filters.maxArea) continue
      // 빠른 필터: 내 주변
      if (nearbyNeedle) {
        const addr = p.address || ''
        if (!addr.includes(nearbyNeedle) && !(nearbyBase !== nearbyNeedle && addr.includes(nearbyBase!))) {
          continue
        }
      }
      // 빠른 필터: 신규 (최근 7일)
      if (quickFilter === 'new') {
        if (new Date(p.createdAt).getTime() < sevenDaysAgoMs) continue
      }
      filtered.push(p)
    }

    // ── 2) Single sort — quickFilter / sortBy 통합, is_featured 우선까지 한 번에
    const getSortKey = (p: typeof properties[number]): [number, number] => {
      // 1차 키: is_featured 우선 (음수가 위로)
      const featureKey = p.is_featured ? 0 : 1
      // 2차 키: quickFilter 또는 sortBy 따라 다름
      let secondaryKey: number
      if (quickFilter === 'popular') {
        secondaryKey = -((p.views || 0) + (p.likes || 0) * 10)
      } else if (quickFilter === 'new') {
        secondaryKey = -new Date(p.createdAt).getTime()
      } else if (sortBy === 'priceAsc') {
        secondaryKey = p.price || 0
      } else if (sortBy === 'priceDesc') {
        secondaryKey = -(p.price || 0)
      } else if (sortBy === 'areaDesc') {
        secondaryKey = -(p.area || 0)
      } else {
        // latest (default)
        secondaryKey = -new Date(p.createdAt).getTime()
      }
      return [featureKey, secondaryKey]
    }

    let result = filtered.sort((a, b) => {
      const [aF, aS] = getSortKey(a)
      const [bF, bS] = getSortKey(b)
      if (aF !== bF) return aF - bF
      return aS - bS
    })

    // popular 은 상위 20개만
    if (quickFilter === 'popular') {
      result = result.slice(0, 20)
    }

    return result
  }, [properties, filters, searchAddress, quickFilter, userLocation, sellerTypeFilter, sortBy])

  // 표시할 매물 수 계산 (3줄 = 모바일 6개, 태블릿 9개, 데스크톱 12개)
  const maxDisplayCount = 12
  const displayedProperties = showAllProperties 
    ? filteredProperties 
    : filteredProperties.slice(0, maxDisplayCount)
  const hasMoreProperties = filteredProperties.length > maxDisplayCount

  // 결과 제목 — useMemo 로 sellerTypeFilter/quickFilter/userLocation 변경 시에만 재계산
  const resultTitle = useMemo(() => {
    let prefix = ""
    if (sellerTypeFilter === "agent") prefix = "공인중개사 "
    else if (sellerTypeFilter === "individual") prefix = "일반 "

    if (quickFilter === "nearby") {
      return userLocation ? `${prefix}${formatShortLocation(userLocation.sido, userLocation.sigungu, userLocation.dong)} 매물` : `${prefix}내 근처 매물`
    }
    if (quickFilter === "popular") return `${prefix}핫한 매물`
    if (quickFilter === "new") return `${prefix}따끈따끈 신규`
    return `${prefix}우리동네 매물`
  }, [sellerTypeFilter, quickFilter, userLocation])

  return (
    <PullToRefreshWrapper>
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header
        user={user}
        location={userLocation}
        onLocationChange={handleLocationChange}
        userRole={userRole}
        userAccountType={userAccountType}
      />
      
      {/* Hero Banner Carousel — 배너와 미니네비가 같은 이미지 배경을 공유 */}
      <HeroBannerClient
        banners={banners}
        currentIndex={bannerIndex}
        onIndexChange={setBannerIndex}
      />

      {/* 카테고리 미니네비 — 한 줄 가로 스크롤 (모바일) / 가운데 정렬 (PC, overflow 없을 때) */}
      <CategoryMiniNav
        backgroundImageUrl={banners[bannerIndex]?.image_url || null}
        items={[
          { href: "/board",        icon: MessageSquare, iconKey: "home.minimav.board.icon",        label: lblMiniBoard },
          { href: "/secondhand",   icon: ShoppingCart,  iconKey: "home.minimav.secondhand.icon",   label: lblMiniSecondhand },
          { href: "/local-food",   icon: Leaf,          iconKey: "home.minimav.local_food.icon",   label: lblMiniLocalFood },
          { href: "/group-buying", icon: Users,         iconKey: "home.minimav.group_buying.icon", label: lblMiniGroupBuying },
          { href: "/jobs",         icon: Briefcase,     iconKey: "home.minimav.jobs.icon",         label: lblMiniJobs },
          { href: "/new-store",    icon: Store,         iconKey: "home.minimav.new_store.icon",    label: lblMiniNewStore },
          { href: "/sharing",      icon: HandHeart,     iconKey: "home.minimav.sharing.icon",      label: lblMiniSharing },
          { href: "/clubs",        icon: UserCircle2,   iconKey: "home.minimav.clubs.icon",        label: lblMiniClubs },
        ]}
      />

      {/* Seller Type Tabs */}
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex gap-2 border-b border-border py-1 overflow-x-auto scrollbar-hide flex-nowrap">
          <button
            onClick={() => setSellerTypeFilter("all")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0",
              sellerTypeFilter === "all"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            전체 매물
          </button>
          <button
            onClick={() => setSellerTypeFilter("agent")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0",
              sellerTypeFilter === "agent"
                ? "border-blue-500 text-blue-500"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Building2 className="w-4 h-4" />
            공인중개사
          </button>
          <button
            onClick={() => setSellerTypeFilter("individual")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0",
              sellerTypeFilter === "individual"
                ? "border-green-500 text-green-500"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Users className="w-4 h-4" />
            일반
          </button>
          <button
            onClick={() =>
              setSellerTypeFilter(sellerTypeFilter === "map" ? "all" : "map")
            }
            aria-pressed={sellerTypeFilter === "map"}
            className={cn(
              "ml-auto self-center flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-all whitespace-nowrap shadow-sm border",
              sellerTypeFilter === "map"
                ? "bg-amber-500 text-white border-amber-500 shadow-md hover:bg-amber-600"
                : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900",
            )}
          >
            <Map className="w-4 h-4" />
            {sellerTypeFilter === "map" ? "리스트로 보기" : "지도로 보기"}
          </button>
        </div>
      </div>

      {/* Property List */}
      <main className="max-w-7xl mx-auto px-4 pt-[9px] pb-5">
        {/* Results Header */}
        <div className="flex items-center justify-between mb-[4px] gap-2">
          <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
            <EditableIcon
              iconKey="home.section.realestate.icon"
              fallback={Building2}
              tileClassName="w-8 sm:w-10 h-8 sm:h-10 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 shadow-sm flex-shrink-0"
              iconClassName="w-4 sm:w-5 h-4 sm:h-5 text-white"
              imageClassName="w-12 sm:w-14 h-12 sm:h-14 flex-shrink-0"
            />
            <div className="min-w-0">
              <h2 className="text-sm sm:text-lg font-bold text-foreground whitespace-nowrap">
                {resultTitle}
              </h2>
              <p className="text-xs text-muted-foreground whitespace-nowrap">
                총 <span className="text-primary font-semibold">{filteredProperties.length}</span>개의 매물
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
            <Link href="/properties" prefetch={false} className="text-xs sm:text-sm text-primary hover:underline flex items-center gap-0.5 whitespace-nowrap">
              전체보기 <ChevronRight className="w-3 sm:w-4 h-3 sm:h-4" />
            </Link>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="text-xs sm:text-sm text-muted-foreground bg-card border border-border rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
            >
              <option value="latest">최신순</option>
              <option value="priceAsc">가격낮은순</option>
              <option value="priceDesc">가격높은순</option>
              <option value="areaDesc">면적넓은순</option>
            </select>
          </div>
        </div>

        {/* Filter Bar — 매물 리스트 컨트롤 (지도 모드에서도 유지) */}
        <div className="-mx-4 mb-3">
          <FilterBar
            onFilterChange={setFilters}
            quickFilter={quickFilter}
            onQuickFilterChange={handleQuickFilter}
            userLocation={userLocation}
          />
        </div>

        {/* Map View */}
        {sellerTypeFilter === "map" ? (
          <PropertyMapView
            properties={filteredProperties}
            plazaId={getCurrentPlazaClient()}
            height={620}
          />
        ) : filteredProperties.length > 0 ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {displayedProperties.map((property, index) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  currentUserId={user?.id}
                  isAdmin={isAdmin}
                  isHighlighted={index === 0 && property.is_featured}
                  highlightLabel="오늘의 매물!"
                  // 위 4개만 priority (LCP 후보) — 모바일 grid-cols-2 기준 첫 2줄
                  // 나머지는 lazy load (스크롤 후 로드 → 초기 트래픽 80% 절감)
                  priority={index < 4}
                />
              ))}
            </div>
            
            {/* 더보기 버튼 */}
            {hasMoreProperties && !showAllProperties && (
              <div className="flex justify-center mt-8">
                <button
                  onClick={() => setShowAllProperties(true)}
                  className="px-8 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all shadow-sm hover:shadow-md"
                >
                  매물 더보기 ({filteredProperties.length - maxDisplayCount}개)
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-950/30 dark:to-gray-950/30 rounded-2xl border border-slate-100 dark:border-slate-800">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {properties.length === 0 ? "아직 등록된 매물이 없어요" : 
               quickFilter === "nearby" && !userLocation ? "위치를 설정해주세요" :
               "조건에 맞는 매물이 없어요"}
            </h3>
            <p className="text-muted-foreground text-sm">
              {properties.length === 0 ? "첫 번째 매물을 등록해보세요!" : 
               quickFilter === "nearby" && !userLocation ? "상단에서 위치를 설정하면 내 주변 매물을 볼 수 있어요" :
               "필터를 변경하거나 다른 지역을 검색해보세요"}
            </p>
          </div>
        )}
      </main>

      {/* 매물 허브 (접이식) Section */}
      <section className="py-3">
        <div className="max-w-7xl mx-auto px-4">
          <button
            type="button"
            onClick={() => setPropertyHubOpen((v) => !v)}
            aria-expanded={propertyHubOpen}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 dark:from-emerald-950/30 dark:via-teal-950/30 dark:to-sky-950/30 border border-emerald-100 dark:border-emerald-900/40 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center gap-2 min-w-0">
              <EditableIcon
                iconKey="home.hub.property.icon"
                fallback={Building2}
                tileClassName="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-sm flex-shrink-0"
                iconClassName="w-4 h-4 text-white"
                imageClassName="w-10 h-10 flex-shrink-0"
              />
              <div className="text-left min-w-0">
                <p className="text-sm font-bold text-foreground whitespace-nowrap">{lblPropertyHubTitle}</p>
                <p className="text-[11px] text-muted-foreground whitespace-nowrap">{lblPropertyHubSubtitle}</p>
              </div>
            </div>
            <ChevronDown
              className={cn(
                "w-5 h-5 text-muted-foreground transition-transform duration-300 flex-shrink-0",
                propertyHubOpen && "rotate-180"
              )}
            />
          </button>

          <div
            className={cn(
              "grid transition-all duration-300 ease-in-out overflow-hidden",
              propertyHubOpen ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0 mt-0"
            )}
          >
            <div className="min-h-0">
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <Link
                  href="/properties?seller=agent"
                  prefetch={false}
                  className="group relative overflow-hidden rounded-2xl border border-blue-100 dark:border-blue-900/40 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-3 sm:p-4 hover:shadow-md transition-all hover:-translate-y-0.5"
                >
                  <EditableIcon
                    iconKey="home.hub.property.agent.icon"
                    fallback={Briefcase}
                    tileClassName="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 shadow-sm mb-2"
                    iconClassName="w-4 sm:w-5 h-4 sm:h-5 text-white"
                  />
                  <p className="text-xs sm:text-sm font-bold text-foreground leading-tight">{lblAgentTitle}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 hidden sm:block">{lblAgentSubtitle}</p>
                  <KeyRound className="absolute right-2 bottom-2 w-8 h-8 text-blue-200 dark:text-blue-900/40 -rotate-12" />
                </Link>

                <Link
                  href="/properties?seller=individual"
                  prefetch={false}
                  className="group relative overflow-hidden rounded-2xl border border-amber-100 dark:border-amber-900/40 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 p-3 sm:p-4 hover:shadow-md transition-all hover:-translate-y-0.5"
                >
                  <EditableIcon
                    iconKey="home.hub.property.individual.icon"
                    fallback={UserCircle2}
                    tileClassName="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-sm mb-2"
                    iconClassName="w-4 sm:w-5 h-4 sm:h-5 text-white"
                  />
                  <p className="text-xs sm:text-sm font-bold text-foreground leading-tight">{lblIndividualTitle}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 hidden sm:block">{lblIndividualSubtitle}</p>
                  <Home className="absolute right-2 bottom-2 w-8 h-8 text-amber-200 dark:text-amber-900/40 -rotate-12" />
                </Link>

                <Link
                  href="/requests"
                  prefetch={false}
                  className="group relative overflow-hidden rounded-2xl border border-rose-100 dark:border-rose-900/40 bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-950/30 dark:to-pink-950/30 p-3 sm:p-4 hover:shadow-md transition-all hover:-translate-y-0.5"
                >
                  <EditableIcon
                    iconKey="home.hub.property.request.icon"
                    fallback={HandHeart}
                    tileClassName="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-rose-500 to-pink-500 shadow-sm mb-2"
                    iconClassName="w-4 sm:w-5 h-4 sm:h-5 text-white"
                  />
                  <p className="text-xs sm:text-sm font-bold text-foreground leading-tight">{lblRequestTitle}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 hidden sm:block">{lblRequestSubtitle}</p>
                  <Search className="absolute right-2 bottom-2 w-8 h-8 text-rose-200 dark:text-rose-900/40 -rotate-12" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 우리동네 홈즈 Section */}
      <section className="bg-gradient-to-b from-background to-secondary/30 py-6">
        <div className="max-w-7xl mx-auto px-4">
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-1 sm:gap-1.5">
              <EditableIcon
                iconKey="home.section.holmes.icon"
                fallback={Home}
                tileClassName="w-8 sm:w-10 h-8 sm:h-10 rounded-xl bg-gradient-to-br from-primary to-emerald-600 shadow-sm flex-shrink-0"
                iconClassName="w-4 sm:w-5 h-4 sm:h-5 text-white"
                imageClassName="w-12 sm:w-14 h-12 sm:h-14 flex-shrink-0"
              />
              <div className="min-w-0">
                <h2 className="text-sm sm:text-lg font-bold text-foreground whitespace-nowrap">우리동네 홈즈</h2>
                <p className="text-xs text-muted-foreground whitespace-nowrap">집 꾸미기부터 이사까지</p>
              </div>
            </div>
            <Link
              href="/service-requests"
              prefetch={false}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 text-xs font-medium hover:bg-emerald-500/20 transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              도와주세요
            </Link>
          </div>

          {/* 콘텐츠 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* 인테리어 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Paintbrush className="w-4 h-4 text-purple-500 flex-shrink-0" />
                    <h3 className="text-xs sm:text-sm font-medium text-foreground whitespace-nowrap">인테리어</h3>
                  </div>
                  <Link
                    href="/interior"
                    prefetch={false}
                    className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors whitespace-nowrap flex-shrink-0"
                  >
                    전체보기
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
                {serviceLoading ? (
                  <div className="py-8 bg-card rounded-xl border border-border animate-pulse">
                    <div className="h-4 w-24 mx-auto bg-muted rounded" />
                  </div>
                ) : interiorPosts.length > 0 ? (
                  interiorPosts.slice(0, 1).map((post) => (
                    <ServiceCard key={post.id} post={post} serviceType="interior" currentUserId={user?.id} isAdmin={isAdmin} />
                  ))
                ) : (
                  <div className="flex items-center justify-center py-8 text-center bg-card rounded-xl border border-border">
                    <p className="text-xs text-muted-foreground">등록된 업체가 없어요</p>
                  </div>
                )}
              </div>

              {/* 이사 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Truck className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                    <h3 className="text-xs sm:text-sm font-medium text-foreground whitespace-nowrap">이사</h3>
                  </div>
                  <Link
                    href="/moving"
                    prefetch={false}
                    className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors whitespace-nowrap flex-shrink-0"
                  >
                    전체보기
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
                {serviceLoading ? (
                  <div className="py-8 bg-card rounded-xl border border-border animate-pulse">
                    <div className="h-4 w-24 mx-auto bg-muted rounded" />
                  </div>
                ) : movingPosts.length > 0 ? (
                  movingPosts.slice(0, 1).map((post) => (
                    <ServiceCard key={post.id} post={post} serviceType="moving" currentUserId={user?.id} isAdmin={isAdmin} />
                  ))
                ) : (
                  <div className="flex items-center justify-center py-8 text-center bg-card rounded-xl border border-border">
                    <p className="text-xs text-muted-foreground">등록된 업체가 없어요</p>
                  </div>
                )}
              </div>

              {/* 청소 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <SprayCan className="w-4 h-4 text-pink-500 flex-shrink-0" />
                    <h3 className="text-xs sm:text-sm font-medium text-foreground whitespace-nowrap">청소</h3>
                  </div>
                  <Link
                    href="/cleaning"
                    prefetch={false}
                    className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors whitespace-nowrap flex-shrink-0"
                  >
                    전체보기
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
                {serviceLoading ? (
                  <div className="py-8 bg-card rounded-xl border border-border animate-pulse">
                    <div className="h-4 w-24 mx-auto bg-muted rounded" />
                  </div>
                ) : cleaningPosts.length > 0 ? (
                  cleaningPosts.slice(0, 1).map((post) => (
                    <ServiceCard key={post.id} post={post} serviceType="cleaning" currentUserId={user?.id} isAdmin={isAdmin} />
                  ))
                ) : (
                  <div className="flex items-center justify-center py-8 text-center bg-card rounded-xl border border-border">
                    <p className="text-xs text-muted-foreground">등록된 업체가 없어요</p>
                  </div>
                )}
              </div>

              {/* 수리 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Wrench className="w-4 h-4 text-orange-500 flex-shrink-0" />
                    <h3 className="text-xs sm:text-sm font-medium text-foreground whitespace-nowrap">수리</h3>
                  </div>
                  <Link
                    href="/repair"
                    prefetch={false}
                    className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors whitespace-nowrap flex-shrink-0"
                  >
                    전체보기
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
                {serviceLoading ? (
                  <div className="py-8 bg-card rounded-xl border border-border animate-pulse">
                    <div className="h-4 w-24 mx-auto bg-muted rounded" />
                  </div>
                ) : repairPosts.length > 0 ? (
                  repairPosts.slice(0, 1).map((post) => (
                    <ServiceCard key={post.id} post={post} serviceType="repair" currentUserId={user?.id} isAdmin={isAdmin} />
                  ))
                ) : (
                  <div className="flex items-center justify-center py-8 text-center bg-card rounded-xl border border-border">
                    <p className="text-xs text-muted-foreground">등록된 업체가 없어요</p>
                  </div>
                )}
              </div>
            </div>
        </div>
      </section>

      {/* 중고거래 · 나눔 Section (동네장터 혼합 2+2) */}
      <section className="py-6">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
              <EditableIcon
                iconKey="home.section.market.icon"
                fallback={Heart}
                tileClassName="w-8 sm:w-10 h-8 sm:h-10 rounded-xl bg-gradient-to-br from-amber-500 to-rose-500 shadow-sm flex-shrink-0"
                iconClassName="w-4 sm:w-5 h-4 sm:h-5 text-white"
                imageClassName="w-12 sm:w-14 h-12 sm:h-14 flex-shrink-0"
              />
              <div className="min-w-0">
                <h2 className="text-sm sm:text-lg font-bold text-foreground whitespace-nowrap">중고거래 · 나눔</h2>
                <p className="text-xs text-muted-foreground whitespace-nowrap">동네 이웃과 거래하고 나눠요</p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <Link
                href="/secondhand"
                prefetch={false}
                className="flex items-center gap-0.5 text-xs sm:text-sm font-medium text-amber-600 hover:text-amber-500 transition-colors whitespace-nowrap"
              >
                중고거래
                <ChevronRight className="w-3 sm:w-4 h-3 sm:h-4" />
              </Link>
              <Link
                href="/sharing"
                prefetch={false}
                className="flex items-center gap-0.5 text-xs sm:text-sm font-medium text-rose-600 hover:text-rose-500 transition-colors whitespace-nowrap"
              >
                나눔
                <ChevronRight className="w-3 sm:w-4 h-3 sm:h-4" />
              </Link>
            </div>
          </div>

          {communityLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1,2,3,4].map((i) => (
                <div key={i} className="bg-card rounded-xl border border-border p-3 animate-pulse">
                  <div className="w-full aspect-square bg-muted rounded-lg mb-2" />
                  <div className="h-3 w-3/4 bg-muted rounded mb-1" />
                  <div className="h-3 w-1/2 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : (sharingPosts.length > 0 || secondhandPosts.length > 0) ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {secondhandPosts.slice(0, 2).map((post) => (
                <SecondhandCard
                  key={`secondhand-${post.id}`}
                  post={post}
                  currentUserId={user?.id}
                  isAdmin={isAdmin}
                />
              ))}
              {sharingPosts.slice(0, 2).map((post, index) => (
                <SharingCard
                  key={`sharing-${post.id}`}
                  post={post}
                  currentUserId={user?.id}
                  isAdmin={isAdmin}
                  isHighlighted={index === 0}
                  highlightLabel="우리동네 나눔왕!"
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center bg-gradient-to-br from-rose-50 to-amber-50 dark:from-rose-950/20 dark:to-amber-950/20 rounded-2xl border border-rose-100 dark:border-rose-900/30">
              <Heart className="w-12 h-12 text-rose-300 dark:text-rose-700 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">아직 등록된 나눔이 없어요</p>
              <p className="text-xs text-muted-foreground/70 mt-1">첫 번째 나눔을 시작해보세요</p>
            </div>
          )}
        </div>
      </section>

      {/* 공동구매 · 로컬푸드 Section */}
      <section className="bg-gradient-to-b from-secondary/50 to-background py-6">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
              <EditableIcon
                iconKey="home.section.fresh.icon"
                fallback={ShoppingCart}
                tileClassName="w-8 sm:w-10 h-8 sm:h-10 rounded-xl bg-gradient-to-br from-blue-500 to-green-500 shadow-sm flex-shrink-0"
                iconClassName="w-4 sm:w-5 h-4 sm:h-5 text-white"
                imageClassName="w-12 sm:w-14 h-12 sm:h-14 flex-shrink-0"
              />
              <div className="min-w-0">
                <h2 className="text-sm sm:text-lg font-bold text-foreground whitespace-nowrap">같이 사고, 신선하게 먹고</h2>
                <p className="text-xs text-muted-foreground whitespace-nowrap">공동구매 · 로컬푸드로 알뜰하게</p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <Link
                href="/group-buying"
                prefetch={false}
                className="flex items-center gap-0.5 text-xs sm:text-sm font-medium text-blue-600 hover:text-blue-500 transition-colors whitespace-nowrap"
              >
                공동구매
                <ChevronRight className="w-3 sm:w-4 h-3 sm:h-4" />
              </Link>
              <Link
                href="/local-food"
                prefetch={false}
                className="flex items-center gap-0.5 text-xs sm:text-sm font-medium text-green-600 hover:text-green-500 transition-colors whitespace-nowrap"
              >
                로컬푸드
                <ChevronRight className="w-3 sm:w-4 h-3 sm:h-4" />
              </Link>
            </div>
          </div>

          {communityLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1,2,3,4].map((i) => (
                <div key={i} className="bg-card rounded-xl border border-border p-3 animate-pulse">
                  <div className="w-full aspect-square bg-muted rounded-lg mb-2" />
                  <div className="h-3 w-3/4 bg-muted rounded mb-1" />
                  <div className="h-3 w-1/2 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : (groupBuyingPosts.length > 0 || localFoodPosts.length > 0) ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {groupBuyingPosts.slice(0, 2).map((post, index) => (
                <GroupBuyingCard
                  key={`gb-${post.id}`}
                  post={post}
                  currentUserId={user?.id}
                  isAdmin={isAdmin}
                  isHighlighted={index === 0}
                  highlightLabel="대박 할인율!"
                />
              ))}
              {localFoodPosts.slice(0, 2).map((post, index) => (
                <LocalFoodCard
                  key={`lf-${post.id}`}
                  post={post}
                  currentUserId={user?.id}
                  isAdmin={isAdmin}
                  isHighlighted={index === 0}
                  highlightLabel="신선함!"
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center bg-gradient-to-br from-blue-50 to-green-50 dark:from-blue-950/20 dark:to-green-950/20 rounded-2xl border border-blue-100 dark:border-blue-900/30">
              <ShoppingCart className="w-12 h-12 text-blue-300 dark:text-blue-700 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">아직 등록된 상품이 없어요</p>
              <p className="text-xs text-muted-foreground/70 mt-1">함께 구매하면 더 저렴해요</p>
            </div>
          )}
        </div>
      </section>

      {/* 구인구직 · 모임 Section */}
      <section className="py-6">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
              <EditableIcon
                iconKey="home.section.jobs_clubs.icon"
                fallback={Briefcase}
                tileClassName="w-8 sm:w-10 h-8 sm:h-10 rounded-xl bg-gradient-to-br from-teal-500 to-purple-500 shadow-sm flex-shrink-0"
                iconClassName="w-4 sm:w-5 h-4 sm:h-5 text-white"
                imageClassName="w-12 sm:w-14 h-12 sm:h-14 flex-shrink-0"
              />
              <div className="min-w-0">
                <h2 className="text-sm sm:text-lg font-bold text-foreground whitespace-nowrap">동네 일자리 · 동네 모임</h2>
                <p className="text-xs text-muted-foreground whitespace-nowrap">일도 취미도 가까이서</p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <Link
                href="/jobs"
                prefetch={false}
                className="flex items-center gap-0.5 text-xs sm:text-sm font-medium text-teal-600 hover:text-teal-500 transition-colors whitespace-nowrap"
              >
                구인구직
                <ChevronRight className="w-3 sm:w-4 h-3 sm:h-4" />
              </Link>
              <Link
                href="/clubs"
                prefetch={false}
                className="flex items-center gap-0.5 text-xs sm:text-sm font-medium text-purple-600 hover:text-purple-500 transition-colors whitespace-nowrap"
              >
                모임
                <ChevronRight className="w-3 sm:w-4 h-3 sm:h-4" />
              </Link>
            </div>
          </div>

          {communityLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1,2,3,4].map((i) => (
                <div key={i} className="bg-card rounded-xl border border-border p-3 animate-pulse">
                  <div className="w-full aspect-square bg-muted rounded-lg mb-2" />
                  <div className="h-3 w-3/4 bg-muted rounded mb-1" />
                  <div className="h-3 w-1/2 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : (jobsPosts.length > 0 || clubPosts.length > 0) ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {jobsPosts.slice(0, 2).map((post) => (
                <JobsCard
                  key={`job-${post.id}`}
                  post={post}
                  currentUserId={user?.id}
                  isAdmin={isAdmin}
                />
              ))}
              {clubPosts.slice(0, 2).map((post) => (
                <ClubCard
                  key={`club-${post.id}`}
                  post={post}
                  currentUserId={user?.id}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center bg-gradient-to-br from-teal-50 to-purple-50 dark:from-teal-950/20 dark:to-purple-950/20 rounded-2xl border border-teal-100 dark:border-teal-900/30">
              <Briefcase className="w-12 h-12 text-teal-300 dark:text-teal-700 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">아직 등록된 공고·모임이 없어요</p>
              <p className="text-xs text-muted-foreground/70 mt-1">동네에서 일도, 사람도 찾아봐요</p>
            </div>
          )}
        </div>
      </section>

      {/* 춘천 소식 섹션 */}
      <section id="chuncheon-news" className="py-6 border-t border-border">
        <ChuncheonNews preview />
      </section>

      {/* 지금 광장에선 — 실시간 이야기 위젯 */}
      <PlazaLiveWidget
        clubPosts={clubPosts}
        sharingPosts={sharingPosts}
        groupBuyingPosts={groupBuyingPosts}
        localFoodPosts={localFoodPosts}
        secondhandPosts={secondhandPosts}
        jobsPosts={jobsPosts}
      />

      {/* 내 주변 화장실은 /toilets 전용 페이지로 분리됨 (햄버거 메뉴에서만 진입) */}

      <BottomNav />
    </div>
    </PullToRefreshWrapper>
  )
}
