/**
 * 매물 리스트 — 광장 web /properties 1:1 RN 미러.
 *
 * 정독 매핑:
 *   - PageHero (검색)
 *   - 빠른 필터 (내 주변 / 인기매물 / 신규)
 *   - Card/Map 토글 (이번 RN 은 카드만 — 지도 다음 cycle)
 *   - "매물 N개" + 필터 모달 + 정렬
 *   - 카드 그리드 (2 col)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native"
import { Image } from "expo-image"
import { SafeAreaView } from "react-native-safe-area-context"
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { useThemedStyles } from "@/components/useColorScheme"
import { getSupabase } from "@/lib/supabase"
import { PropertyFilterModal, type PropertyFilterValue } from "@/components/PropertyFilterModal"
import { useCurrentPlaza } from "@/lib/plaza"
import { ListCardMenu } from "@/components/ListCardMenu"
import { PropertyMapView } from "@/components/PropertyMapView"
import { useHiddenPosts } from "@/lib/hidden-posts"
import { useAuth } from "@/lib/auth-context"
import { HeaderActions } from "@/components/HeaderActions"
import { DomainTabBar } from "@/components/DomainTabBar"
import { RegionPicker } from "@/components/RegionPicker"
import {
  listPlazaRegions,
  loadRegionSelection,
  resolveUserDefaultRegion,
  saveRegionSelection,
  type Region,
  type RegionSelection,
} from "@/lib/region-utils"

type SortKey =
  | "latest"
  | "price_asc"
  | "price_desc"
  | "area_desc"
  | "area_asc"
  | "price_per_area"
  | "views"
  | "likes"
type QuickFilter = "none" | "nearby" | "popular" | "new"

interface Property {
  id: string
  title: string
  price: number
  property_type: string
  transaction_type: string
  area_sqm: number | null
  address: string | null
  images: string[] | null
  views: number
  status: string
  user_id: string
  seller_type: string | null
  created_at: string
  effective_at: string | null
  is_featured: boolean | null
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "latest", label: "최신순" },
  { value: "price_asc", label: "가격 낮은순" },
  { value: "price_desc", label: "가격 높은순" },
  { value: "area_desc", label: "면적 넓은순" },
  { value: "area_asc", label: "면적 좁은순" },
  { value: "price_per_area", label: "평당가 낮은순" },
  { value: "views", label: "조회순" },
  { value: "likes", label: "찜많은순" },
]

export default function PropertyListScreen() {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const DEFAULT_PLAZA = useCurrentPlaza()
  const { user } = useAuth()
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  // pagination — 페이지당 20개, 스크롤 시 추가 fetch
  const PAGE_SIZE = 20
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const loadTokenRef = useRef(0)
  const loadingMoreRef = useRef(false)
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortKey>("latest")
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("none")
  const [sortOpen, setSortOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  // 지역 필터 — 시/군 단위, 다중 선택, 가입 지역 디폴트
  const [regionSelection, setRegionSelection] = useState<RegionSelection>({ kind: "all" })
  const [regionList, setRegionList] = useState<Region[]>([])
  // 보기 모드 — 리스트 / 카드 / 지도 (홈탭 map mode 와 동일)
  const [viewMode, setViewMode] = useState<"list" | "grid" | "map">("list")
  // 지도 모드에서 카드 탭 시 지도 위 InfoWindow 활성화 — 홈탭 1:1
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null)
  // 그리드 카드 폭 — 화면 폭 기반 픽셀 계산 (percentage 가 초기 layout 시 0 되는 이슈 회피)
  const { width: winWidth } = useWindowDimensions()
  const gridCardWidth = Math.floor((winWidth - 12 * 2 - 12) / 2) // gridWrap padding 12*2 + gap 12
  // 숨김 매물
  const { isHidden } = useHiddenPosts("properties")
  // 홈 화면에서 seller_type 쿼리 파라미터로 진입 시 필터 자동 적용
  const { seller_type } = useLocalSearchParams<{ seller_type?: string }>()
  const initialSellerType =
    seller_type === "agent" ? "agent" : seller_type === "individual" ? "individual" : "전체"

  const [filter, setFilter] = useState<PropertyFilterValue>({
    propertyType: "전체",
    transactionType: "전체",
    sellerType: initialSellerType,
    option: "전체",
    district: null,
    minPrice: null,
    maxPrice: null,
    minArea: null,
    maxArea: null,
  })

  // 지역 초기 로드 완료 여부 — 완료 전까지 fetch 지연 (이중 로드 방지)
  const [regionReady, setRegionReady] = useState(false)

  // 지역 default 로드 — 가입 region > 전체 (나갔다 들어오면 가입지역으로 리셋)
  useEffect(() => {
    if (!DEFAULT_PLAZA) return
    let alive = true
    ;(async () => {
      const [userRegion, allRegions] = await Promise.all([
        user?.id ? resolveUserDefaultRegion(user.id, DEFAULT_PLAZA) : Promise.resolve(null),
        listPlazaRegions(DEFAULT_PLAZA),
      ])
      if (!alive) return
      setRegionList(allRegions)
      if (userRegion) setRegionSelection({ kind: "ids", ids: [userRegion] })
      else setRegionSelection({ kind: "all" })
      setRegionReady(true)
    })()
    return () => {
      alive = false
    }
  }, [DEFAULT_PLAZA, user?.id])

  function changeRegionSelection(sel: RegionSelection) {
    setRegionSelection(sel)
    // 영속 저장 안 함 — 세션 내에서만 변경 유지
  }

  // 선택 region 표시명
  const regionSummary = useMemo(() => {
    if (regionSelection.kind === "all") return "전체 지역"
    const ids = regionSelection.ids
    if (ids.length === 0) return "전체 지역"
    const first = regionList.find((r) => r.id === ids[0])
    if (!first) return "지역 선택"
    if (ids.length === 1) return first.name
    return `${first.name} 외 ${ids.length - 1}`
  }, [regionSelection, regionList])

  // 페이지 단위 fetch — append=false 면 첫 페이지(0~PAGE_SIZE-1), append=true 면 이어붙임.
  const fetchPage = useCallback(
    async (append: boolean, currentLen: number, token: number) => {
      // 0개 선택 → 빈 결과
      if (regionSelection.kind === "ids" && regionSelection.ids.length === 0) {
        if (loadTokenRef.current === token) {
          if (!append) setProperties([])
          setHasMore(false)
        }
        return
      }
      const supabase = getSupabase()
      const useRegionFilter =
        regionSelection.kind === "ids" && regionSelection.ids.length > 0
      // 특정 지역 선택 시 region_id NULL 글은 제외 (전체 지역 선택일 때만 표시)
      const regionOrClause = useRegionFilter
        ? `region_id.in.(${regionSelection.ids.map((id) => `"${id}"`).join(",")})`
        : null

      const from = append ? currentLen : 0
      const to = from + PAGE_SIZE - 1

      // 필요 컬럼만 명시 — Property 타입 + 지도(lat/lng/monthly_rent) + 필터(parking/elevator/petAllowed)
      // + 최신순 정렬에 쓰이는 bumped_at + region_id (region 필터). 본문성 컬럼 제외 → 페이로드 축소.
      const PROP_COLS =
        "id, title, price, property_type, transaction_type, area_sqm, address, images, views, status, user_id, seller_type, created_at, effective_at, is_featured, lat, lng, monthly_rent, parking, elevator, pet_allowed, bumped_at, region_id"
      async function attempt(opts: { withRegion: boolean }) {
        let q: any = supabase
          .from("properties")
          .select(PROP_COLS)
          .eq("plaza_id", DEFAULT_PLAZA)
          .eq("status", "active")
        if (opts.withRegion && regionOrClause) q = q.or(regionOrClause)
        return await q.order("effective_at", { ascending: false }).range(from, to)
      }
      let res = await attempt({ withRegion: true })
      if (res.error) res = await attempt({ withRegion: false })

      // 응답 도착 시점에 필터가 바뀌었으면 무시
      if (loadTokenRef.current !== token) return

      if (res.error) {
        if (!append) setProperties([])
        setHasMore(false)
      } else {
        const rows = ((res.data as any[]) ?? []) as Property[]
        if (append) {
          setProperties((prev) => [...prev, ...rows])
        } else {
          setProperties(rows)
        }
        setHasMore(rows.length === PAGE_SIZE)
      }
    },
    [DEFAULT_PLAZA, regionSelection],
  )

  const load = useCallback(async () => {
    const token = ++loadTokenRef.current
    setLoading(true)
    setHasMore(true)
    try {
      await fetchPage(false, 0, token)
    } finally {
      if (loadTokenRef.current === token) setLoading(false)
    }
  }, [fetchPage])

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return
    if (!hasMore) return
    if (loading) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    const token = loadTokenRef.current
    try {
      await fetchPage(true, properties.length, token)
    } finally {
      loadingMoreRef.current = false
      if (loadTokenRef.current === token) setLoadingMore(false)
    }
  }, [fetchPage, hasMore, loading, properties.length])

  // 지역 로드 완료 후 첫 fetch — regionReady 전까지 지연하여 이중 로드 방지
  useEffect(() => {
    if (regionReady) load()
  }, [load, regionReady])

  // useFocusEffect 는 mount 시에도 fire — useEffect(load) 와 중복 호출 방지.
  const firstFocusRef = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false
        return
      }
      load()
    }, [load]),
  )

  async function onRefresh() {
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  const filtered = useMemo(() => {
    let list = [...properties]
    // 숨김 매물 제외
    list = list.filter((p) => !isHidden(String(p.id)))
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.address ?? "").toLowerCase().includes(q),
      )
    }
    // 필터 모달 적용
    list = list.filter((p) => {
      if (filter.propertyType !== "전체" && p.property_type !== filter.propertyType) return false
      if (filter.transactionType !== "전체" && p.transaction_type !== filter.transactionType) return false
      if (filter.sellerType !== "전체") {
        const st = p.seller_type ?? "individual"
        if (st !== filter.sellerType) return false
      }
      if (filter.minPrice != null && (p.price ?? 0) < filter.minPrice) return false
      if (filter.maxPrice != null && (p.price ?? 0) > filter.maxPrice) return false
      if (filter.minArea != null && (p.area_sqm ?? 0) < filter.minArea) return false
      if (filter.maxArea != null && (p.area_sqm ?? 0) > filter.maxArea) return false
      if (filter.district && filter.district !== "전체") {
        const addr = (p.address ?? "")
        if (!addr.includes(filter.district)) return false
      }
      // 옵션 필터 (주차/엘리베이터/반려동물)
      if (filter.option && filter.option !== "전체") {
        const col = filter.option === "pet" ? "pet_allowed" : filter.option
        if (!(p as any)[col]) return false
      }
      return true
    })
    if (quickFilter === "popular") {
      list = list
        .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
        .slice(0, 20)
    } else if (quickFilter === "new") {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      list = list.filter((p) => new Date(p.created_at).getTime() >= sevenDaysAgo)
    }
    list.sort((a, b) => {
      switch (sort) {
        case "price_asc":
          return (a.price ?? 0) - (b.price ?? 0)
        case "price_desc":
          return (b.price ?? 0) - (a.price ?? 0)
        case "area_desc":
          return (b.area_sqm ?? 0) - (a.area_sqm ?? 0)
        case "area_asc":
          return (a.area_sqm ?? 0) - (b.area_sqm ?? 0)
        case "price_per_area": {
          const aP = a.area_sqm && a.area_sqm > 0 ? (a.price ?? 0) / a.area_sqm : Number.POSITIVE_INFINITY
          const bP = b.area_sqm && b.area_sqm > 0 ? (b.price ?? 0) / b.area_sqm : Number.POSITIVE_INFINITY
          return aP - bP
        }
        case "views":
          return (b.views ?? 0) - (a.views ?? 0)
        case "likes":
          return (b.views ?? 0) - (a.views ?? 0)
        case "latest":
        default: {
          // 올리기 반영 — effective_at(= COALESCE(bumped_at, created_at)) 우선
          const aT = new Date((a as any).effective_at ?? (a as any).bumped_at ?? a.created_at).getTime()
          const bT = new Date((b as any).effective_at ?? (b as any).bumped_at ?? b.created_at).getTime()
          return bT - aT
        }
      }
    })
    return list
  }, [properties, search, sort, quickFilter, filter, isHidden])

  // 거래 유형별 dot 색상 (홈탭 1:1)
  function mapTxColor(t: string): string {
    if (t === "매매") return "#ef4444"
    if (t === "전세") return "#1d4ed8"
    if (t === "월세") return "#15803d"
    if (t === "단기") return "#6d28d9"
    if (t === "전월세") return "#0e7490"
    return lightColors.ink500
  }
  function formatPrice(p: Property): string {
    const any = p as any
    // 만원 단위 → "1억 5,000만원" / "5억" 같은 한글 변환
    const fmtMan = (man: number): string => {
      if (man >= 10000) {
        const eok = Math.floor(man / 10000)
        const rest = man % 10000
        return rest === 0 ? `${eok}억` : `${eok}억 ${rest.toLocaleString()}만원`
      }
      return `${man.toLocaleString()}만원`
    }
    if (p.transaction_type === "월세") {
      // price = 보증금 (만원), monthly_rent = 월세 (만원)
      const deposit = p.price ?? 0
      const monthly = any.monthly_rent ?? 0
      return `${fmtMan(deposit)} / 월 ${fmtMan(monthly)}`
    }
    return fmtMan(p.price)
  }

  const renderPropertyItem = useCallback(({ item: p }: { item: Property }) => {
    if (viewMode === "grid") {
      return (
        <Pressable
          style={[styles.gridItem, { width: gridCardWidth }]}
          onPress={() => router.push(`/property/${p.id}` as any)}
        >
          <View style={styles.gridThumbWrap}>
            {p.images?.[0] ? (
              <Image source={{ uri: p.images[0] }} style={styles.gridThumb} cachePolicy="memory-disk" transition={120} contentFit="cover" />
            ) : (
              <View style={[styles.gridThumb, { backgroundColor: "#f1f5f9" }]} />
            )}
            <View style={styles.listCatBadge}>
              <Text style={styles.listCatBadgeText}>{p.transaction_type}</Text>
            </View>
            <ListCardMenu
              kind="properties"
              postId={String(p.id)}
              authorId={p.user_id ?? null}
              title={p.title}
              placement="thumb-overlay"
              onChanged={load}
            />
          </View>
          <View style={styles.gridBody}>
            <Text style={styles.gridTitle} numberOfLines={2}>{p.title}</Text>
            <Text style={styles.gridMeta} numberOfLines={1}>
              {[p.area_sqm ? `${p.area_sqm}m²` : null, p.address ?? ""].filter(Boolean).join(" · ")}
            </Text>
            <Text style={styles.gridPrice} numberOfLines={1}>{formatPrice(p)}</Text>
          </View>
        </Pressable>
      )
    }
    return (
      <Pressable
        style={styles.listItem}
        onPress={() => router.push(`/property/${p.id}` as any)}
      >
        <View style={styles.listThumbWrap}>
          {p.images?.[0] ? (
            <Image source={{ uri: p.images[0] }} style={styles.listThumb} cachePolicy="memory-disk" transition={120} contentFit="cover" />
          ) : (
            <View style={[styles.listThumb, { backgroundColor: "#f1f5f9" }]} />
          )}
          <View style={styles.listCatBadge}>
            <Text style={styles.listCatBadgeText}>{p.transaction_type}</Text>
          </View>
        </View>
        <View style={styles.listBody}>
          <Text style={styles.listTitle} numberOfLines={2}>{p.title}</Text>
          <Text style={styles.listMeta} numberOfLines={1}>
            {[p.area_sqm ? `${p.area_sqm}m²` : null, p.address ?? ""].filter(Boolean).join(" · ")}
          </Text>
          <Text style={styles.listPrice}>{formatPrice(p)}</Text>
          <View style={styles.listStats}>
            {(p.views ?? 0) > 0 && (
              <View style={styles.listStat}>
                <Ionicons name="heart" size={13} color={lightColors.ink500} />
                <Text style={styles.listStatText}>{p.views}</Text>
              </View>
            )}
            {(p.views ?? 0) > 0 && (
              <View style={styles.listStat}>
                <Ionicons name="eye-outline" size={13} color={lightColors.ink500} />
                <Text style={styles.listStatText}>{p.views}</Text>
              </View>
            )}
            <View style={{ marginLeft: "auto" }}>
              <ListCardMenu
                kind="properties"
                postId={String(p.id)}
                authorId={p.user_id ?? null}
                title={p.title}
                placement="row"
                onChanged={load}
              />
            </View>
          </View>
        </View>
      </Pressable>
    )
  }, [viewMode, gridCardWidth, router, load, styles])

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.headerTitle}>매물</Text>
        <HeaderActions />
      </View>
      <DomainTabBar current="property" />

      {/* 검색 바 + 지역 칩 (인라인) */}
      <View style={styles.hero}>
        {DEFAULT_PLAZA ? (
          <RegionPicker
            plazaId={DEFAULT_PLAZA}
            mode="filter"
            selection={regionSelection}
            onChange={changeRegionSelection}
            trigger={(open) => (
              <Pressable onPress={open} style={styles.heroRegionChip}>
                <Ionicons name="location" size={16} color="#71717a" />
                <Text style={styles.heroRegionChipText}>{regionSummary}</Text>
                <Ionicons name="chevron-down" size={12} color="#71717a" />
              </Pressable>
            )}
          />
        ) : null}
        <View style={styles.heroSearch}>
          <Ionicons name="search" size={16} color={lightColors.ink500} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="제목, 주소, 동네 검색"
            placeholderTextColor={lightColors.ink500}
            style={styles.heroSearchInput}
          />
        </View>
      </View>

      {/* Quick filters — 고정 height wrap 으로 active 시 흔들림 방지 */}
      <View style={styles.quickRowWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickRow}
          style={{ flex: 1 }}
        >
          <QuickChip
            icon="location-outline"
            label="내 주변"
            active={quickFilter === "nearby"}
            onPress={() => setQuickFilter(quickFilter === "nearby" ? "none" : "nearby")}
          />
          <QuickChip
            icon="trending-up-outline"
            label="인기매물"
            active={quickFilter === "popular"}
            onPress={() => setQuickFilter(quickFilter === "popular" ? "none" : "popular")}
          />
          <QuickChip
            icon="sparkles-outline"
            label="신규"
            active={quickFilter === "new"}
            onPress={() => setQuickFilter(quickFilter === "new" ? "none" : "new")}
          />
        </ScrollView>
        {/* 지도 토글 — 우측 끝. 누르면 지도 모드, 다시 누르면 리스트 복귀. */}
        <Pressable
          style={[styles.mapToggleBtn, viewMode === "map" && styles.mapToggleBtnActive]}
          onPress={() => setViewMode(viewMode === "map" ? "list" : "map")}
          hitSlop={6}
        >
          <Ionicons
            name={viewMode === "map" ? "list-outline" : "map-outline"}
            size={14}
            color={viewMode === "map" ? "#ffffff" : lightColors.primary}
          />
          <Text style={[styles.mapToggleText, viewMode === "map" && { color: "#ffffff" }]}>
            {viewMode === "map" ? "리스트" : "지도"}
          </Text>
        </Pressable>
      </View>

      {/* Toolbar — 정렬 드롭다운 absolute 로 띄움 */}
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
        const anyActive = filterActive || quickFilter !== "none" || !!search.trim()
        return (
      <View style={styles.toolbar}>
        <Text style={styles.count}>매물 {filtered.length}개</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {/* 보기 모드 세그먼트 pill — 리스트 / 카드 둘 다 표시 */}
          <View style={styles.viewSeg}>
            <Pressable
              style={[styles.viewSegBtn, viewMode === "list" && styles.viewSegBtnActive]}
              onPress={() => setViewMode("list")}
            >
              <Ionicons
                name="list-outline"
                size={13}
                color={viewMode === "list" ? "#ffffff" : lightColors.ink700}
              />
              <Text style={[styles.viewSegText, viewMode === "list" && styles.viewSegTextActive]}>
                리스트
              </Text>
            </Pressable>
            <Pressable
              style={[styles.viewSegBtn, viewMode === "grid" && styles.viewSegBtnActive]}
              onPress={() => setViewMode("grid")}
            >
              <Ionicons
                name="grid-outline"
                size={13}
                color={viewMode === "grid" ? "#ffffff" : lightColors.ink700}
              />
              <Text style={[styles.viewSegText, viewMode === "grid" && styles.viewSegTextActive]}>
                카드
              </Text>
            </Pressable>
          </View>
          <Pressable
            style={[styles.toolBtn, filterActive && styles.toolBtnActive]}
            onPress={() => setFilterOpen(true)}
          >
            <Ionicons
              name="options-outline"
              size={14}
              color={filterActive ? lightColors.primary : lightColors.ink900}
            />
            <Text style={[styles.toolBtnText, filterActive && { color: lightColors.primary, fontWeight: "700" }]}>
              필터
            </Text>
          </Pressable>
          {anyActive && (
            <Pressable
              onPress={() => {
                setQuickFilter("none")
                setSearch("")
                setFilter({
                  propertyType: "전체",
                  transactionType: "전체",
                  sellerType: "전체",
                  option: "전체",
                  district: null,
                  minPrice: null,
                  maxPrice: null,
                  minArea: null,
                  maxArea: null,
                })
              }}
              hitSlop={8}
              style={styles.resetX}
            >
              <Ionicons name="close" size={18} color="#dc2626" />
            </Pressable>
          )}
          <View style={styles.sortAnchor}>
            <Pressable
              style={styles.toolBtn}
              onPress={() => setSortOpen((v) => !v)}
            >
              <Ionicons name="swap-vertical-outline" size={14} color={lightColors.ink900} />
              <Text style={styles.toolBtnText}>
                {SORT_OPTIONS.find((s) => s.value === sort)?.label ?? "최신순"}
              </Text>
              <Ionicons
                name={sortOpen ? "chevron-up" : "chevron-down"}
                size={12}
                color={lightColors.ink500}
              />
            </Pressable>
            {sortOpen && (
              <View style={styles.sortMenu}>
                {SORT_OPTIONS.map((o) => (
                  <Pressable
                    key={o.value}
                    onPress={() => {
                      setSort(o.value)
                      setSortOpen(false)
                    }}
                    style={[styles.sortItem, sort === o.value && styles.sortItemActive]}
                  >
                    <Text
                      style={[
                        styles.sortItemText,
                        sort === o.value && { color: lightColors.primary, fontWeight: "700" },
                      ]}
                    >
                      {o.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>
        )
      })()}

      {/* List — web ListingListItem 1:1 (130x130 좌측 + 우측 텍스트) */}
      {viewMode === "map" ? (
        // 지도 모드 — 단일 콘텐츠 블록이라 ScrollView 유지
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing[8] }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={lightColors.primary} />
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="home-outline" size={32} color={lightColors.ink500} />
              <Text style={styles.emptyText}>매물이 없습니다</Text>
            </View>
          ) : (
            <View>
              {/* 지도 */}
              <View style={{ paddingHorizontal: spacing[3] }}>
                <PropertyMapView
                  properties={filtered as any}
                  plazaId={DEFAULT_PLAZA}
                  height={420}
                  selectedId={selectedMapId}
                />
              </View>
              {/* 매물 리스트 (홈탭 map mode 1:1) */}
              <View style={{ paddingHorizontal: spacing[3], paddingTop: spacing[3], paddingBottom: spacing[6] }}>
                <Text style={styles.mapListTitle}>매물 {filtered.length}건</Text>
                <View style={{ gap: 8 }}>
                  {filtered.slice(0, 20).map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => {
                        // 카드 탭 → 지도 위 InfoWindow 열기 (홈탭 1:1)
                        setSelectedMapId(null)
                        setTimeout(() => setSelectedMapId(p.id), 0)
                      }}
                      style={({ pressed }) => [
                        styles.mapListRow,
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      {p.images?.[0] ? (
                        <Image
                          source={{ uri: p.images[0] }}
                          style={styles.mapListThumb}
                          cachePolicy="memory-disk"
                          transition={150}
                          contentFit="cover"
                        />
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
                              { backgroundColor: mapTxColor(p.transaction_type) },
                            ]}
                          />
                          <Text style={styles.mapListType}>{p.transaction_type}</Text>
                        </View>
                        <Text style={styles.mapListPrice}>{formatPrice(p)}</Text>
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
              </View>
            </View>
          )}
        </ScrollView>
      ) : (
        // 리스트 / 그리드 모드 — FlatList 로 가상화
        <FlatList
          key={viewMode}
          data={loading ? [] : filtered}
          keyExtractor={(p) => p.id}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          numColumns={viewMode === "grid" ? 2 : 1}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
            const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent
            const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height)
            if (distanceFromBottom < 600) {
              loadMore()
            }
          }}
          scrollEventThrottle={200}
          ListEmptyComponent={
            loading ? (
              <View style={styles.center}>
                <ActivityIndicator color={lightColors.primary} />
              </View>
            ) : (
              <View style={styles.empty}>
                <Ionicons name="home-outline" size={32} color={lightColors.ink500} />
                <Text style={styles.emptyText}>매물이 없습니다</Text>
              </View>
            )
          }
          ListFooterComponent={
            !loading && loadingMore ? (
              <View style={{ paddingVertical: spacing[4], alignItems: "center" }}>
                <ActivityIndicator color={lightColors.primary} />
              </View>
            ) : null
          }
          columnWrapperStyle={viewMode === "grid" ? { gap: 12, paddingHorizontal: 12 } : undefined}
          contentContainerStyle={{ paddingBottom: spacing[8], paddingTop: viewMode === "grid" ? 12 : 0 }}
          renderItem={renderPropertyItem}
        />
      )}
      {/* 매물 필터 모달 — web PropertyFilterModal 1:1 */}
      <PropertyFilterModal
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        value={filter}
        onChange={setFilter}
        showDistrict
        plazaId={DEFAULT_PLAZA}
      />
    </SafeAreaView>
  )
}

function QuickChip({
  icon,
  label,
  active,
  onPress,
}: {
  icon: any
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.quickChip, active && styles.quickChipActive]}
    >
      <Ionicons
        name={icon}
        size={14}
        color={active ? "#ffffff" : lightColors.ink500}
      />
      <Text
        style={[
          styles.quickChipText,
          active && { color: "#ffffff", fontWeight: "700" },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

function makeStyles(colors: any) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { padding: spacing[8], alignItems: "center" },
  empty: { padding: spacing[8], alignItems: "center", gap: 8 },
  emptyText: { color: colors.ink500, fontSize: fontSize.sm },

  header: {
    flexDirection: "row", alignItems: "center",
    height: 52, paddingHorizontal: spacing[3],
  },
  headerTitle: { fontSize: fontSize.md, fontWeight: "700", color: colors.ink900, flex: 1, lineHeight: 24, marginLeft: 4 },

  hero: {
    margin: spacing[3],
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: spacing[3], marginTop: spacing[3], marginBottom: 8,
  },
  heroRegionChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    height: 40, paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#f4f4f5",
    borderWidth: 1, borderColor: "#e4e4e7",
  },
  heroRegionChipText: { fontSize: 12, fontWeight: "700", color: "#3f3f46", lineHeight: 16, includeFontPadding: false },
  heroSearch: {
    flex: 1, height: 40,
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.muted, borderRadius: 999,
    paddingHorizontal: 12,
  },
  heroSearchInput: { flex: 1, fontSize: fontSize.sm, color: colors.ink900, padding: 0 },

  // 외곽 wrap — 고정 height (chip 36 + padding 0.5*2 = 37) — 다시 절반
  quickRowWrap: {
    height: 37,
    backgroundColor: colors.background,
    flexDirection: "row",
    alignItems: "center",
  },
  // 지도 토글 — 빨간 동그라미 위치 (quickRow 우측)
  mapToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: spacing[3],
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },
  mapToggleBtnActive: {
    backgroundColor: colors.primary,
  },
  mapToggleText: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: colors.primary,
  },
  quickRow: {
    paddingHorizontal: spacing[3],
    gap: 8,
    paddingVertical: 0.5,
    alignItems: "center",
  },
  // 빨간 배경 + 빨간 보더 pill — toolBtn/quickChip 과 height 동일
  resetX: {
    width: 36, height: 36, borderRadius: 999,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#fee2e2",
    borderWidth: 1, borderColor: "#fca5a5",
  },
  // 홈 탭 quickFilterChip 1:1 — 흰 배경 + 회색 보더 / active = 다크 slate
  quickChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 0,
    height: 36,                  // 고정 height — 흔들림 방지
    borderRadius: 999,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.background,
  },
  quickChipActive: {
    backgroundColor: "#1f2937",
    borderColor: "#1f2937",
  },
  quickChipText: {
    fontSize: 13, fontWeight: "600", color: colors.ink900,
    lineHeight: 16,
    includeFontPadding: false,
    textAlignVertical: "center",
  } as any,

  toolbar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing[4], paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    zIndex: 50,
  },
  sortAnchor: {
    position: "relative",
  },
  count: { fontSize: fontSize.sm, color: colors.ink500 },
  toolBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 0,
    height: 36,                  // quickChip 와 동일 height
    borderRadius: 999,
    backgroundColor: colors.muted,
    borderWidth: 1, borderColor: "transparent",
    justifyContent: "center",
  },
  toolBtnActive: {
    backgroundColor: colors.primary + "0F",
    borderColor: colors.primary,
  },
  toolBtnText: {
    fontSize: 12, color: colors.ink900,
    lineHeight: 14, includeFontPadding: false, textAlignVertical: "center",
  } as any,

  sortMenu: {
    position: "absolute",
    top: 40,                     // toolBtn(36) + 4 gap
    right: 0,
    minWidth: 130,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    zIndex: 100,
  },
  sortItem: { paddingVertical: 10, paddingHorizontal: spacing[4] },
  sortItemActive: { backgroundColor: colors.primary + "0F" },
  sortItemText: { fontSize: fontSize.sm, color: colors.ink900 },

  // 보기 모드 세그먼트 pill — 리스트 / 카드 둘 다 노출
  viewSeg: {
    flexDirection: "row",
    backgroundColor: colors.muted,
    borderRadius: 999,
    padding: 2,
    gap: 2,
  },
  viewSegBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  viewSegBtnActive: {
    backgroundColor: colors.ink900,
  },
  viewSegText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.ink700,
  },
  viewSegTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },

  // 2-col grid (카드 보기 모드)
  gridWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  gridItem: {
    // width 는 inline 으로 picel 단위 지정 (gridCardWidth)
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  gridThumbWrap: {
    width: "100%",
    aspectRatio: 1,
    position: "relative",
    backgroundColor: colors.muted,
  },
  gridThumb: { width: "100%", height: "100%" },
  gridBody: { padding: 10, gap: 3 },
  gridTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink900,
    lineHeight: 18,
  },
  gridMeta: { fontSize: 11, color: colors.ink500 },
  gridPrice: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.ink900,
    marginTop: 2,
  },

  // List item — web ListingListItem 1:1
  listItem: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  listThumbWrap: {
    width: 130, height: 130,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#f1f5f9",
    position: "relative",
  },
  listThumb: { width: "100%", height: "100%" },
  listCatBadge: {
    position: "absolute", top: 6, left: 6,
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.95)",
    shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  listCatBadgeText: { fontSize: 10, fontWeight: "500", color: colors.ink900 },
  listBody: { flex: 1, minWidth: 0 },
  listTitle: {
    fontSize: 17, color: colors.ink900,
    fontWeight: "500", lineHeight: 22,
  },
  listMeta: { fontSize: 13, color: colors.ink500, marginTop: 4 },
  listPrice: {
    fontSize: 19, color: colors.ink900,
    fontWeight: "700", marginTop: 6,
  },
  listStats: {
    flexDirection: "row", justifyContent: "flex-end", gap: 10,
    marginTop: "auto", paddingTop: 4,
  },
  listStat: { flexDirection: "row", alignItems: "center", gap: 2 },
  listStatText: { fontSize: 12, color: colors.ink500 },
  // 🅲 지도 모드 카드 리스트 (홈탭 map mode 1:1)
  mapListTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink900,
    marginBottom: 10,
  },
  mapListRow: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#ffffff",
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mapListThumb: {
    width: 64, height: 64,
    borderRadius: 8,
    backgroundColor: colors.muted,
  },
  mapListThumbFallback: {
    alignItems: "center",
    justifyContent: "center",
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
})
}

const styles = makeStyles(lightColors)
