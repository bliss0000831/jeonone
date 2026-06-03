/**
 * 공용 도메인 리스트 화면 — 광장 web /<domain> 페이지 1:1 RN 미러.
 *
 * 13개 도메인이 거의 동일한 패턴 (헤더 + 검색 + 정렬 + 카드 그리드/리스트) 이라
 * 단일 컴포넌트에 config 만 넘겨 양산.
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
import { Image, ImageBackground } from "expo-image"
import { SafeImage } from "@/components/SafeImage"
import { isVideoUrl } from "@/components/MediaItem"

// 썸네일용 이미지 우선 선택 (raw Image/SafeImage 는 video 렌더 불가)
function pickThumb(images?: string[] | null): string | null {
  if (!images || images.length === 0) return null
  return images.find((u) => !isVideoUrl(u)) ?? images[0]
}
import { SafeAreaView } from "react-native-safe-area-context"
import { useFocusEffect, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { useThemedStyles } from "@/components/useColorScheme"
import { Alert } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { getSupabase, gwangjangFetch } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"
import { ListCardMenu, type ListCardKind } from "@/components/ListCardMenu"
import { RegionPicker } from "@/components/RegionPicker"
import {
  listPlazaRegions,
  loadRegionSelection,
  resolveUserDefaultRegion,
  saveRegionSelection,
  type Region,
  type RegionSelection,
} from "@/lib/region-utils"
import { useHiddenPosts } from "@/lib/hidden-posts"
import { useAuth } from "@/lib/auth-context"
import { canRegisterDomain } from "@/lib/permissions"
import { PlatformDisclaimerBand } from "@/components/legal/PlatformDisclaimerBand"
import { usePlazaBusinessInfo } from "@/lib/plaza-business-info"
import { pickClubTheme } from "@/components/home/formatters"
import { HeaderActions } from "@/components/HeaderActions"
import { DomainTabBar } from "@/components/DomainTabBar"


export type SortKey =
  | "latest"
  | "popular"
  | "price_asc"
  | "price_desc"
  | "views"
  | "likes"

export interface DomainListConfig {
  /** 화면 제목 */
  title: string
  /** Hero 아이콘 */
  heroIcon: any
  /** Hero 메인 색상 */
  heroColor: string
  /** Hero 부제 */
  heroSub: string
  /** Hero 배경 사진 (require) — 있으면 사진 히어로 표시 */
  heroImage?: any
  /** Supabase 테이블 */
  table: string
  /** 상태 필터 (status 컬럼 + 값) */
  statusFilter?: { col: string; val: string }
  /** 카드 라우트 base path (e.g. "/sharing") */
  basePath: string
  /** 카드 그리드 (true=2col grid, false=세로 list) */
  grid?: boolean
  /** 가격 표시 여부 */
  showPrice?: boolean
  /** 가격 컬럼명 (기본 price) */
  priceCol?: string
  /** 카테고리 표시 여부 (배지) */
  showCategory?: boolean
  /** 제목 컬럼 (기본 title — new_store 는 store_name 일 수 있음) */
  titleCol?: string
  /** 빠른 필터 활성화 */
  quickFilters?: boolean
  /** 정렬 옵션 */
  sortOptions?: { value: SortKey; label: string }[]
  /** 검색 placeholder */
  searchPlaceholder?: string
  /** 등록 버튼 라우트 (옵션) */
  registerPath?: string
  /** 카테고리 칩 옵션 (전체 외 추가). 예: ["의류", "생활", "가전"] */
  categories?: string[]
  /** 지역 분리 비활성 (공구/로컬푸드 등 광장 전체 통합 도메인) — true 면 region picker 미표시, region 필터 적용 X */
  disableRegionFilter?: boolean
  /** 광장 간 visibility 적용 — true 면 plaza_id=현재광장 OR visibility=national 둘 다 표시 (공구/로컬푸드) */
  crossPlazaVisibility?: boolean
  /** 도메인 종류 — 카드 뷰에 도메인별 추가 메타 표시용 (장소/날짜/모집/시급/오픈이벤트/서비스가격) */
  domainKind?:
    | "sharing"
    | "clubs"
    | "jobs"
    | "new-store"
    | "secondhand"
    | "group-buying"
    | "local-food"
    | "service"
    | "interior"
    | "moving"
    | "cleaning"
    | "repair"
}

const DEFAULT_SORT: { value: SortKey; label: string }[] = [
  { value: "latest", label: "최신순" },
  { value: "popular", label: "인기순" },
]

// basePath ("/property", "/sharing" 등) → ListCardKind 매핑
const BASEPATH_TO_KIND: Record<string, ListCardKind> = {
  "/property": "properties",
  "/secondhand": "secondhand",
  "/interior": "interior",
  "/moving": "moving",
  "/cleaning": "cleaning",
  "/repair": "repair",
  "/group-buying": "group-buying",
  "/local-food": "local-food",
  "/jobs": "jobs",
  "/new-store": "new-store",
  "/sharing": "sharing",
  "/clubs": "clubs",
}

export function DomainListScreen({ config }: { config: DomainListConfig }) {
  const styles = useThemedStyles(makeStyles)
  const DEFAULT_PLAZA = useCurrentPlaza()
  const router = useRouter()
  const { user } = useAuth()
  // 등록 권한 — 계정 유형/admin 여부에 따라 + 버튼 노출 제어
  const [accountType, setAccountType] = useState<string>("user")
  const [isAdmin, setIsAdmin] = useState(false)
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState(false)
  // ───────────── pagination ─────────────
  // 페이지당 20개 — 초기 화면 빠르게, 스크롤 시 추가 fetch.
  // 검색/정렬/카테고리/지역 등 client-side 필터는 로드된 페이지 내에서만 적용 (기존 .limit(100) 과 동일 트레이드오프).
  const PAGE_SIZE = 20
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  // 마지막 load 호출 토큰 — race 방지 (필터 변경 후 이전 응답이 늦게 와도 무시)
  const loadTokenRef = useRef(0)
  // 동시 loadMore 트리거 방지 (onScroll 빈번 호출)
  const loadingMoreRef = useRef(false)
  const [inputValue, setInputValue] = useState("")
  const [search, setSearch] = useState("")
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [sort, setSort] = useState<SortKey>("latest")
  const [sortOpen, setSortOpen] = useState(false)
  const [category, setCategory] = useState<string>("all")
  // 보기 모드 — 기본 리스트, 토글로 2열 그리드
  const [viewMode, setViewMode] = useState<"list" | "grid">("list")
  const { width: winWidth } = useWindowDimensions()
  const gridCardWidth = Math.floor((winWidth - 12 * 2 - 12) / 2)

  const sortOpts = config.sortOptions ?? DEFAULT_SORT
  const titleCol = config.titleCol ?? "title"
  const priceCol = config.priceCol ?? "price"
  // 리스트 카드 ⋮ 메뉴용 kind (basePath 에서 유도)
  const cardKind: ListCardKind | undefined = BASEPATH_TO_KIND[config.basePath]
  // 숨김 게시글 — 모든 hook 은 unconditional
  const { isHidden } = useHiddenPosts(cardKind ?? "_none")

  // 지역 필터 — 시/군 단위, 다중 선택 가능, 가입 지역 디폴트
  const [regionSelection, setRegionSelection] = useState<RegionSelection>({ kind: "all" })
  const [regionList, setRegionList] = useState<Region[]>([])
  const [regionInitialized, setRegionInitialized] = useState(false)

  // 광장 전환 시 region 선택 즉시 리셋 (async 재조회 전에 stale 필터 방지)
  useEffect(() => {
    setRegionSelection({ kind: "all" })
    setRegionList([])
    setRegionInitialized(false)
  }, [DEFAULT_PLAZA])

  // 마운트 시 default 결정: 가입 region > 전체
  // (사용자 변경 사항은 세션 내에서만 유지 — 나갔다 들어오면 가입지역으로 리셋)
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
      if (userRegion) {
        setRegionSelection({ kind: "ids", ids: [userRegion] })
      } else {
        setRegionSelection({ kind: "all" })
      }
      setRegionInitialized(true)
    })()
    return () => {
      alive = false
    }
  }, [DEFAULT_PLAZA, user?.id])

  function changeRegionSelection(sel: RegionSelection) {
    setRegionSelection(sel)
    // 영속 저장 안 함 — 나갔다 들어오면 가입지역 디폴트로 리셋되도록
  }

  // 선택된 region 표시명 — chip 에 노출
  const regionSummary = useMemo(() => {
    if (regionSelection.kind === "all") return "전체 지역"
    const ids = regionSelection.ids
    if (ids.length === 0) return "전체 지역"
    const first = regionList.find((r) => r.id === ids[0])
    if (!first) return "지역 선택"
    if (ids.length === 1) return first.name
    return `${first.name} 외 ${ids.length - 1}`
  }, [regionSelection, regionList])

  // 페이지 단위 fetch — append=false 면 첫 페이지(0~PAGE_SIZE-1), append=true 면 다음 페이지.
  // 마지막 load 토큰을 검사해서 필터 변경 후 늦게 도착한 응답은 무시 (race 방지).
  const fetchPage = useCallback(
    async (append: boolean, currentLen: number, token: number) => {
      // 지역 분리 비활성 도메인(공구/로컬푸드) — region 필터 건너뜀
      if (
        !config.disableRegionFilter &&
        regionSelection.kind === "ids" &&
        regionSelection.ids.length === 0
      ) {
        // 0개 선택 ("전체" 해제 + 개별도 0) → 빈 결과
        if (loadTokenRef.current === token) {
          if (!append) setItems([])
          setHasMore(false)
        }
        return
      }
      const supabase = getSupabase()
      const useRegionFilter =
        !config.disableRegionFilter &&
        regionSelection.kind === "ids" &&
        regionSelection.ids.length > 0
      // 특정 지역 선택 시 region_id NULL 글은 제외 (전체 지역 선택일 때만 표시)
      const regionOrClause = useRegionFilter
        ? `region_id.in.(${regionSelection.ids.map((id) => `"${id}"`).join(",")})`
        : null

      const from = append ? currentLen : 0
      const to = from + PAGE_SIZE - 1

      // 서버 사이드 검색어 — ilike 으로 title/content 동시 검색
      const serverSearch = search.trim()

      async function attempt(opts: { withRegion: boolean; withEffectiveAt: boolean; withVisibility: boolean }) {
        let q: any = supabase
          .from(config.table)
          .select("*")
        if (opts.withVisibility && config.crossPlazaVisibility) {
          // 현재 광장 글 OR 전체 광장(national) 글
          q = q.or(`plaza_id.eq.${DEFAULT_PLAZA},visibility.eq.national`)
        } else {
          q = q.eq("plaza_id", DEFAULT_PLAZA)
        }
        if (config.statusFilter) {
          q = q.eq(config.statusFilter.col, config.statusFilter.val)
        }
        if (opts.withRegion && regionOrClause) {
          q = q.or(regionOrClause)
        }
        // 서버 사이드 텍스트 검색 — title OR content ilike
        if (serverSearch) {
          const escaped = serverSearch.replace(/%/g, "\\%").replace(/_/g, "\\_")
          q = q.or(`${titleCol}.ilike.%${escaped}%,content.ilike.%${escaped}%`)
        }
        q = q
          .order(opts.withEffectiveAt ? "effective_at" : "created_at", {
            ascending: false,
          })
          .range(from, to)
        return await q
      }

      // 1차: 모든 필터 적용
      let res = await attempt({ withRegion: true, withEffectiveAt: true, withVisibility: true })
      // 2차: effective_at 컬럼 없는 테이블 대비
      if (res.error) res = await attempt({ withRegion: true, withEffectiveAt: false, withVisibility: true })
      // 3차: visibility 컬럼 없는 환경 대비 (로컬푸드 마이그 전)
      if (res.error) res = await attempt({ withRegion: true, withEffectiveAt: false, withVisibility: false })
      // 4차: region_id 컬럼 없는 환경 (마이그레이션 전) 대비
      if (res.error) res = await attempt({ withRegion: false, withEffectiveAt: false, withVisibility: false })

      // 응답 도착 시점에 필터가 바뀌었으면 무시
      if (loadTokenRef.current !== token) return

      if (res.error) {
        console.warn("[DomainListScreen] load failed:", res.error.message)
        if (!append) { setItems([]); setLoadError(true) }
        setHasMore(false)
      } else {
        setLoadError(false)
        const rows = (res.data as any[]) ?? []
        if (append) {
          setItems((prev) => [...prev, ...rows])
        } else {
          setItems(rows)
        }
        // 받아온 개수가 PAGE_SIZE 미만이면 더 없음
        setHasMore(rows.length === PAGE_SIZE)
      }
    },
    [config.table, config.statusFilter, config.disableRegionFilter, config.crossPlazaVisibility, DEFAULT_PLAZA, regionSelection, search, titleCol],
  )

  // 초기 로드 / 필터 변경 시 첫 페이지부터 다시 로드
  const load = useCallback(async () => {
    const token = ++loadTokenRef.current
    setLoading(true)
    setHasMore(true)
    try {
      await fetchPage(false, 0, token)
    } finally {
      // 늦게 도착한 응답이 spinner 끄지 않도록 토큰 검사
      if (loadTokenRef.current === token) setLoading(false)
    }
  }, [fetchPage])

  // 다음 페이지 append
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return
    if (!hasMore) return
    if (loading) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    const token = loadTokenRef.current
    try {
      // items.length 는 closure 로 capture 되면 stale — setItems 콜백 안에서 length 확인 못함.
      // 호출 시점의 items.length 를 사용 (load 가 진행중이면 loadingMoreRef 로 차단)
      await fetchPage(true, items.length, token)
    } finally {
      loadingMoreRef.current = false
      if (loadTokenRef.current === token) setLoadingMore(false)
    }
  }, [fetchPage, hasMore, loading, items.length])

  useEffect(() => {
    load()
  }, [load])

  // 화면 포커스 시 재조회 — 수정/등록 후 돌아오면 최신 반영
  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  // 사용자 권한 — account_type + admin 여부 로드
  useEffect(() => {
    if (!user) {
      setAccountType("user")
      setIsAdmin(false)
      return
    }
    let cancelled = false
    ;(async () => {
      // 🅲 광장 격리 — account_type 은 plaza_profiles 우선 (role 은 글로벌)
      const supabase = getSupabase()
      const [profRes, ppRes] = await Promise.all([
        supabase.from("profiles").select("account_type, role")
          .eq("id", user.id).maybeSingle(),
        DEFAULT_PLAZA
          ? supabase.from("plaza_profiles").select("account_type")
              .eq("user_id", user.id).eq("plaza_id", DEFAULT_PLAZA).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ])
      if (cancelled) return
      const data: any = profRes.data || {}
      const pp: any = ppRes?.data || {}
      const t = (pp.account_type ?? data.account_type) as string | undefined
      const r = data.role as string | undefined
      setAccountType(t || "user")
      setIsAdmin(r === "admin" || r === "superadmin")
    })()
    return () => {
      cancelled = true
    }
  }, [user, DEFAULT_PLAZA])

  const canRegister = canRegisterDomain(config.basePath, accountType, { isAdmin })

  async function onRefresh() {
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  const renderItem = useCallback(({ item: it }: { item: any }) => {
    if (config.domainKind === "clubs" && viewMode === "grid") {
      return (
        <View style={{ width: gridCardWidth }}>
          <ClubThinRow
            item={it}
            heroColor={config.heroColor}
            onPress={() => router.push(`${config.basePath}/${it.id}` as any)}
          />
        </View>
      )
    }
    if (config.domainKind === "clubs") {
      return (
        <ClubListRow
          item={it}
          heroColor={config.heroColor}
          onPress={() => router.push(`${config.basePath}/${it.id}` as any)}
        />
      )
    }
    if (viewMode === "grid") {
      return (
        <GridTwoColCard
          item={it}
          titleCol={titleCol}
          priceCol={priceCol}
          showPrice={config.showPrice}
          showCategory={config.showCategory}
          heroColor={config.heroColor}
          domainKind={config.domainKind}
          width={gridCardWidth}
          cardKind={cardKind}
          onChanged={load}
          onPress={() => router.push(`${config.basePath}/${it.id}` as any)}
        />
      )
    }
    return (
      <GridCard
        item={it}
        titleCol={titleCol}
        priceCol={priceCol}
        showPrice={config.showPrice}
        showCategory={config.showCategory}
        heroColor={config.heroColor}
        cardKind={cardKind}
        onChanged={load}
        onPress={() => router.push(`${config.basePath}/${it.id}` as any)}
      />
    )
  }, [config, viewMode, gridCardWidth, titleCol, priceCol, cardKind, load, router])

  const filtered = useMemo(() => {
    let list = [...items]
    // 숨김 게시글 제외
    if (cardKind) {
      list = list.filter((p) => !isHidden(String(p.id)))
    }
    if (category !== "all") {
      list = list.filter((p) => (p.category ?? "") === category)
    }
    // 검색은 서버 사이드 — fetchPage 에서 ilike 으로 처리
    // Skip sort for "latest" — server already returns in descending date order
    if (sort !== "latest") {
      list.sort((a, b) => {
        switch (sort) {
          case "popular":
            return ((b.likes ?? 0) + (b.views ?? 0)) - ((a.likes ?? 0) + (a.views ?? 0))
          case "price_asc":
            return (a[priceCol] ?? 0) - (b[priceCol] ?? 0)
          case "price_desc":
            return (b[priceCol] ?? 0) - (a[priceCol] ?? 0)
          case "views":
            return (b.views ?? 0) - (a.views ?? 0)
          case "likes":
            return (b.likes ?? 0) - (a.likes ?? 0)
          default: {
            const aT = new Date((a as any).effective_at ?? a.created_at ?? 0).getTime()
            const bT = new Date((b as any).effective_at ?? b.created_at ?? 0).getTime()
            return bT - aT
          }
        }
      })
    }
    return list
  }, [items, sort, titleCol, priceCol, category, cardKind, isHidden])

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로가기" onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.headerTitle}>{config.title}</Text>
        <HeaderActions />
      </View>

      {/* 도메인 탭 바 */}
      <DomainTabBar current={config.domainKind} />

      {/* 사진 히어로 (heroImage 있을 때) */}
      {config.heroImage ? (
        <ImageBackground source={config.heroImage} style={{ width: "100%", height: 130 }} contentFit="cover">
          <LinearGradient colors={["rgba(0,0,0,0.45)", "rgba(0,0,0,0.6)"]} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name={config.heroIcon} size={34} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 20, fontWeight: "900", marginTop: 6 }}>{config.title}</Text>
            <Text style={{ color: "#fff", fontSize: 13, marginTop: 2 }}>{config.heroSub}</Text>
          </LinearGradient>
        </ImageBackground>
      ) : null}

      {/* 검색 바 + 지역 칩 (인라인) */}
      {config.domainKind === "jobs" && <JobsInfoNotice />}
      <View style={styles.heroSearchRow}>
        {DEFAULT_PLAZA && !config.disableRegionFilter ? (
          <RegionPicker
            plazaId={DEFAULT_PLAZA}
            mode="filter"
            selection={regionSelection}
            onChange={changeRegionSelection}
            trigger={(open) => (
              <Pressable onPress={open} style={styles.heroRegionChip}>
                <Ionicons name="location" size={16} color="#71717a" />
                <Text style={styles.heroRegionChipText}>
                  {regionSummary}
                </Text>
                <Ionicons name="chevron-down" size={12} color="#71717a" />
              </Pressable>
            )}
          />
        ) : null}
        <View style={styles.heroSearch}>
          <Ionicons name="search" size={16} color={lightColors.ink500} />
          <TextInput
            value={inputValue}
            onChangeText={(v) => {
              setInputValue(v)
              if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
              searchDebounceRef.current = setTimeout(() => setSearch(v), 300)
            }}
            placeholder={config.searchPlaceholder ?? "검색"}
            placeholderTextColor={lightColors.ink500}
            style={styles.heroSearchInput}
          />
        </View>
        {config.registerPath && canRegister ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="등록하기"
            onPress={() => router.push(config.registerPath as any)}
            hitSlop={6}
            style={styles.heroAddBtn}
          >
            <Ionicons name="add-circle" size={32} color={config.heroColor} />
          </Pressable>
        ) : null}
      </View>

      {/* Category chips — web ListingMobileTabs 1:1 미러 (당근 스타일)
          - bg-background (sticky top-14 z-30)
          - flex items-center gap-2 px-3 py-2.5
          - chip: px-3.5 py-2 rounded-full text-[13px] font-medium min-h-[36px]
          - active: bg-foreground text-background (검정 + 흰)
          - inactive: bg-secondary text-foreground (밝은 회색 + 검정) */}
      {config.categories && config.categories.length > 0 && (
        <View style={styles.catRowWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catRow}
          style={styles.catRowOuter}
        >
          <Pressable
            onPress={() => setCategory("all")}
            style={[
              styles.catChip,
              category === "all" ? styles.catChipActive : styles.catChipInactive,
            ]}
          >
            <Text
              style={[
                styles.catChipText,
                category === "all" ? styles.catChipTextActive : styles.catChipTextInactive,
              ]}
            >
              전체
            </Text>
          </Pressable>
          {config.categories.map((c) => (
            <Pressable
              key={c}
              onPress={() => setCategory(c)}
              style={[
                styles.catChip,
                category === c ? styles.catChipActive : styles.catChipInactive,
              ]}
            >
              <Text
                style={[
                  styles.catChipText,
                  category === c ? styles.catChipTextActive : styles.catChipTextInactive,
                ]}
              >
                {c}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        </View>
      )}

      {/* Toolbar — 정렬 드롭다운은 absolute 로 띄워서 아래 컨텐츠 안 밀리게 */}
      <View style={styles.toolbar}>
        <Text style={styles.count}>{config.title} {filtered.length}개</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {/* 보기 모드 세그먼트 pill — 리스트 / 카드 */}
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
        <View style={styles.sortAnchor}>
          <Pressable accessibilityRole="button" accessibilityLabel="정렬 변경" style={styles.toolBtn} onPress={() => setSortOpen((v) => !v)}>
            <Ionicons name="swap-vertical-outline" size={14} color={lightColors.ink900} />
            <Text style={styles.toolBtnText}>
              {sortOpts.find((s) => s.value === sort)?.label ?? "최신순"}
            </Text>
            <Ionicons
              name={sortOpen ? "chevron-up" : "chevron-down"}
              size={12}
              color={lightColors.ink500}
            />
          </Pressable>
          {sortOpen && (
            <View style={styles.sortMenu}>
              {sortOpts.map((o) => (
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

      {/* List — web ListingListItem (모바일) 1:1 */}
      <FlatList
        key={`${config.domainKind ?? "default"}-${viewMode}`}
        data={loading ? [] : filtered}
        keyExtractor={(it) => String(it.id)}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        removeClippedSubviews={true}
        windowSize={11}
        numColumns={
          (config.domainKind === "clubs" && viewMode === "grid") || viewMode === "grid" ? 2 : 1
        }
        contentContainerStyle={{ paddingBottom: spacing[6], paddingTop: viewMode === "grid" ? 12 : 0 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        // 무한스크롤 — 하단 600px 이내로 들어오면 다음 페이지 fetch
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
              <ActivityIndicator color={config.heroColor} />
            </View>
          ) : loadError ? (
            <View style={styles.empty}>
              <Ionicons name="cloud-offline-outline" size={32} color={lightColors.ink500} />
              <Text style={styles.emptyText}>데이터를 불러오지 못했습니다</Text>
              <Pressable onPress={() => { setLoadError(false); load() }} style={{ marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: config.heroColor, borderRadius: 8 }}>
                <Text style={{ color: "#fff", fontSize: 14 }}>다시 시도</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name={config.heroIcon} size={32} color={lightColors.ink500} />
              <Text style={styles.emptyText}>등록된 게시물이 없습니다</Text>
            </View>
          )
        }
        ListFooterComponent={
          <>
            {/* 하단 spinner — loadMore 중일 때만 표시 */}
            {!loading && loadingMore && (
              <View style={styles.loadMoreSpinner}>
                <ActivityIndicator color={config.heroColor} />
              </View>
            )}
            {/* 통신판매중개자 면책 띠 — 리스트 끝, 푸터로 노출 (전상법 제20조의2) */}
            {!loading && !loadingMore && <PlatformDisclaimerBand />}
          </>
        }
        columnWrapperStyle={
          viewMode === "grid"
            ? { gap: 12, paddingHorizontal: 12 }
            : undefined
        }
        renderItem={renderItem}
      />
    </SafeAreaView>
  )
}

/**
 * 구인구직 메인 — 직업안정법 제23조에 따른 직업정보제공사업 신고번호 의무 표시.
 * 광장 사업자 정보에 `job_info_number` 가 입력된 경우에만 표시. 미입력 시 표시 안 함.
 */
function JobsInfoNotice() {
  const business = usePlazaBusinessInfo()
  const num = business.job_info_number?.trim()
  if (!num) return null
  return (
    <View style={jobsInfoStyles.box}>
      <Ionicons name="information-circle-outline" size={12} color={lightColors.ink500} />
      <Text style={jobsInfoStyles.text} numberOfLines={2}>
        본 서비스는「직업안정법」제23조에 따른 직업정보제공사업으로 신고되었습니다 (신고번호: {num})
      </Text>
    </View>
  )
}

const jobsInfoStyles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    marginTop: spacing[2],
    backgroundColor: lightColors.muted,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: lightColors.border,
  },
  text: {
    flex: 1,
    fontSize: 10,
    color: lightColors.ink500,
    lineHeight: 14,
  },
})

/**
 * 모바일 list item — web ListingListItem 1:1 미러
 *
 * 웹 정독 (apps/web/components/listing/listing-list-item.tsx):
 * - 130x130 썸네일 (좌측, rounded-lg)
 * - 카테고리 칩: top-1.5 left-1.5, white/95 backdrop, text-[10px]
 * - 상태 배지: bottom-1.5 left-1.5, color-toned, text-[10px]
 * - 우측 텍스트:
 *   · 제목 text-[17px] line-clamp-2 leading-snug font-medium (pr-7 if menu)
 *   · 메타 text-[13px] muted line-clamp-1
 *   · 가격 text-[19px] font-bold
 *   · stats mt-auto pt-1 justify-end
 */
// 서비스(인테리어/이사/청소/수리) 도메인 3줄 메타 — 순서: 가격(강조) → 경력 → 지역
// 경력/지역은 회색 통일, 가격만 도메인 컬러 + 큰 글자.
function buildServiceExtras(
  item: any,
  heroColor: string,
): Array<{ icon: any; text: string; color?: string; emphasis?: boolean }> {
  const out: Array<{ icon: any; text: string; color?: string; emphasis?: boolean }> = []
  // 1) 가격 범위 — 큰 글씨 + 도메인 컬러 강조 (아이콘 없음)
  const min = item.min_price
  const max = item.max_price
  const unit = item.price_unit ?? "만원"
  if (typeof min === "number" && typeof max === "number" && (min > 0 || max > 0)) {
    out.push({
      icon: null,
      text: min === max
        ? `${Number(min).toLocaleString()}${unit}`
        : `${Number(min).toLocaleString()}~${Number(max).toLocaleString()}${unit}`,
      color: heroColor,
      emphasis: true,
    })
  } else if (typeof min === "number" && min > 0) {
    out.push({
      icon: null,
      text: `${Number(min).toLocaleString()}${unit}~`,
      color: heroColor,
      emphasis: true,
    })
  } else {
    out.push({
      icon: null,
      text: "가격 협의",
      color: heroColor,
      emphasis: true,
    })
  }
  // 2) 경력 — career_years 또는 시공 횟수 (회색)
  if (typeof item.career_years === "number" && item.career_years > 0) {
    out.push({
      icon: "ribbon-outline",
      text: `경력 ${item.career_years}년`,
    })
  } else {
    const completed = item.completed_count ?? item.portfolio_count
    if (typeof completed === "number" && completed > 0) {
      out.push({
        icon: "ribbon-outline",
        text: `시공 ${completed}건`,
      })
    }
  }
  // 3) 서비스 지역 (회색)
  const region = [item.service_region, item.service_district].filter(Boolean).join(" ")
  if (region) {
    out.push({ icon: "location-outline", text: stripRegionPrefix(region) })
  } else if (item.location) {
    out.push({ icon: "location-outline", text: stripRegionPrefix(item.location) })
  } else {
    out.push({ icon: "location-outline", text: "지역 미입력" })
  }
  return out
}

// 서비스 도메인 cardKind 식별
const SERVICE_KINDS = new Set<string>(["interior", "moving", "cleaning", "repair"])

function GridCard({
  item,
  titleCol,
  priceCol,
  showPrice,
  showCategory,
  heroColor,
  onPress,
  cardKind,
  onChanged,
}: {
  item: any
  titleCol: string
  priceCol: string
  showPrice?: boolean
  showCategory?: boolean
  heroColor: string
  onPress: () => void
  cardKind?: ListCardKind
  onChanged?: () => void
}) {
  const styles = useThemedStyles(makeStyles)
  const thumb = pickThumb(item.images) ?? item.thumbnail ?? null
  const title = item[titleCol] ?? item.title ?? ""
  const price = item[priceCol] ?? item.group_price ?? null
  const status = item.status ?? "active"
  const statusInfo = STATUS_LABELS[status] ?? null
  const meta = item.location ? stripRegionPrefix(item.location) : null
  // 올리기 반영 — effective_at(= COALESCE(bumped_at, created_at)) 우선
  const agoSrc = (item as any).effective_at ?? (item as any).bumped_at ?? item.created_at
  const ago = agoSrc ? timeAgoKo(agoSrc) : null
  // 서비스 도메인이면 4줄 메타 추가 표시
  const serviceExtras =
    cardKind && SERVICE_KINDS.has(cardKind)
      ? buildServiceExtras(item, heroColor)
      : null

  return (
    <Pressable onPress={onPress} style={styles.listItem}>
      {/* 좌측 130x130 썸네일 */}
      <View style={styles.listThumbWrap}>
        {thumb ? (
          <SafeImage source={{ uri: thumb }} style={styles.listThumb} cachePolicy="memory-disk" transition={0} contentFit="cover" />
        ) : (
          <View style={[styles.listThumb, styles.listThumbEmpty]}>
            {showCategory && item.category ? (
              <View style={styles.listThumbCatPill}>
                <Text style={styles.listThumbCatPillText}>{item.category}</Text>
              </View>
            ) : (
              <Ionicons name="image-outline" size={28} color="rgba(100,116,139,0.4)" />
            )}
          </View>
        )}
        {/* 카테고리 칩 — top-1.5 left-1.5 (image 있을 때만) */}
        {thumb && showCategory && !!item.category && (
          <View style={styles.listCatBadge}>
            <Text style={styles.listCatBadgeText}>{item.category}</Text>
          </View>
        )}
        {/* 상태 배지 — bottom-1.5 left-1.5 */}
        {statusInfo && status !== "active" && status !== "available" && status !== "recruiting" && (
          <View style={[styles.listStatusBadge, { backgroundColor: statusInfo.color + "E6" }]}>
            <Text style={styles.listStatusBadgeText}>{statusInfo.label}</Text>
          </View>
        )}
      </View>

      {/* 우측 본문 */}
      <View style={styles.listBody}>
        <Text style={styles.listTitle} numberOfLines={2}>{title}</Text>
        {(meta || ago) && !serviceExtras && (
          <Text style={styles.listMeta} numberOfLines={1}>
            {[meta, ago].filter(Boolean).join(" · ")}
          </Text>
        )}
        {/* 신장개업 — 오픈 이벤트 내용 (content-width 핑크 칩 + 길면 2줄 wrap) */}
        {/* 단일 <Text> 로 처리 — RN Text 는 자체적으로 content-width + 자동 wrap.
            View+Text 구조는 flexbox 상 wrap 신뢰성이 떨어져 잘림 발생함. */}
        {cardKind === "new-store" && !!item.opening_event && (
          <Text style={styles.openingEventText} numberOfLines={2}>
            <Ionicons name="gift-outline" size={13} color="#ec4899" />
            {`  ${String(item.opening_event)}`}
          </Text>
        )}
        {/* 서비스 도메인 3줄 메타 (경력 → 가격 → 지역) — 가격만 큰 글씨 */}
        {serviceExtras && (
          <View style={{ marginTop: 4, gap: 2 }}>
            {serviceExtras.map((ex, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                {ex.icon ? (
                  <Ionicons
                    name={ex.icon}
                    size={ex.emphasis ? 13 : 11}
                    color={ex.color ?? lightColors.ink500}
                  />
                ) : null}
                <Text
                  style={{
                    fontSize: ex.emphasis ? 18 : 11,
                    color: ex.color ?? lightColors.ink500,
                    fontWeight: ex.emphasis ? "700" : "400",
                    flexShrink: 1,
                  }}
                  numberOfLines={1}
                >
                  {ex.text}
                </Text>
              </View>
            ))}
          </View>
        )}
        {showPrice && price != null && (
          <View style={{ marginTop: 6 }}>
            {/* 할인율 (group-buying) */}
            {item.original_price && item.original_price > 0 && item.group_price && item.original_price > item.group_price && (
              <View style={styles.discountRow}>
                <Text style={styles.discountPct}>
                  {Math.round(((item.original_price - item.group_price) / item.original_price) * 100)}%
                </Text>
                <Text style={styles.originalPrice}>
                  {Number(item.original_price).toLocaleString()}원
                </Text>
              </View>
            )}
            <Text style={styles.listPrice}>
              {Number(price).toLocaleString()}원
            </Text>
          </View>
        )}
        <View style={styles.listStats}>
          {(item.likes ?? 0) > 0 && (
            <View style={styles.listStat}>
              <Ionicons name="heart" size={13} color={lightColors.ink500} />
              <Text style={styles.listStatText}>{item.likes}</Text>
            </View>
          )}
          {(item.views ?? 0) > 0 && (
            <View style={styles.listStat}>
              <Ionicons name="eye-outline" size={13} color={lightColors.ink500} />
              <Text style={styles.listStatText}>{item.views}</Text>
            </View>
          )}
          {/* 리스트 카드 ⋮ 메뉴 — 행 우측 끝 */}
          {cardKind && (
            <View style={{ marginLeft: "auto" }}>
              <ListCardMenu
                kind={cardKind}
                postId={String(item.id)}
                authorId={item.user_id ?? null}
                title={title}
                placement="row"
                onChanged={onChanged}
              />
            </View>
          )}
        </View>
      </View>
    </Pressable>
  )
}

// 상태 라벨 — web statusLabels 통합 매핑
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "진행중", color: "#22c55e" },
  available: { label: "판매중", color: "#22c55e" },
  recruiting: { label: "모집중", color: "#22c55e" },
  reserved: { label: "예약중", color: "#eab308" },
  completed: { label: "완료", color: "#94a3b8" },
  closed: { label: "마감", color: "#94a3b8" },
  cancelled: { label: "취소", color: "#94a3b8" },
}

function timeAgoKo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "방금"
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}일 전`
  if (day < 30) return `${Math.floor(day / 7)}주 전`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}개월 전`
  return `${Math.floor(mo / 12)}년 전`
}

function stripRegionPrefix(addr: string): string {
  return addr.replace(
    /^(강원특별자치도|강원도|서울특별시|경기도|충청남도|충청북도|전라남도|전라북도|경상남도|경상북도|제주특별자치도|인천광역시|부산광역시|대구광역시|대전광역시|광주광역시|울산광역시|세종특별자치시)\s*/,
    "",
  )
}

/**
 * 2-col 그리드 카드 — 상단 정사각 썸네일 + 하단 제목/가격
 *
 * viewMode === "grid" 일 때 사용. width 48.5% (gap 으로 자연 정렬).
 */
function GridTwoColCard({
  item,
  titleCol,
  priceCol,
  showPrice,
  showCategory,
  heroColor,
  domainKind,
  width,
  cardKind,
  onChanged,
  onPress,
}: {
  item: any
  titleCol: string
  priceCol: string
  showPrice?: boolean
  showCategory?: boolean
  heroColor: string
  domainKind?: string
  width?: number
  cardKind?: ListCardKind
  onChanged?: () => void
  onPress: () => void
}) {
  const styles = useThemedStyles(makeStyles)
  const thumb = pickThumb(item.images) ?? item.thumbnail ?? null
  const title = item[titleCol] ?? item.title ?? ""
  const price = item[priceCol] ?? item.group_price ?? null
  const status = item.status ?? "active"
  const statusInfo = STATUS_LABELS[status] ?? null

  // 도메인별 카드 추가 정보 — { icon, text, color? } 배열
  const extras: Array<{ icon: any; text: string; color?: string }> = []
  switch (domainKind) {
    case "sharing":
      if (item.location) {
        extras.push({
          icon: "location-outline",
          text: stripRegionPrefix(item.location),
        })
      }
      break
    case "clubs": {
      const rawDate = item.meeting_date ?? null
      let date: string | null = null
      if (typeof rawDate === "string") {
        const m = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
        date = m ? `${m[2]}/${m[3]}` : rawDate
      } else if (rawDate) {
        date = String(rawDate)
      }
      if (date) {
        extras.push({ icon: "calendar-outline", text: date })
      }
      if (typeof item.current_members === "number" && typeof item.max_members === "number") {
        const isFull = item.current_members >= item.max_members
        extras.push({
          icon: "people-outline",
          text: `${item.current_members}/${item.max_members}명${isFull ? " · 마감" : ""}`,
          color: isFull ? "#94a3b8" : "#0284c7",
        })
      }
      break
    }
    case "jobs": {
      const wage = item.hourly_wage ?? item.hourlyWage
      if (typeof wage === "number" && wage > 0) {
        extras.push({
          icon: "cash-outline",
          text: `시급 ${wage.toLocaleString()}원`,
          color: "#8b5cf6",
        })
      }
      const sched = item.work_days || item.work_hours
      if (sched) {
        extras.push({ icon: "calendar-outline", text: String(sched) })
      }
      break
    }
    case "new-store": {
      if (item.opening_event) {
        extras.push({
          icon: "gift-outline",
          text: String(item.opening_event),
          color: "#ec4899",
        })
      } else if (item.opening_date) {
        extras.push({ icon: "calendar-outline", text: String(item.opening_date) })
      }
      break
    }
    case "service":
    case "interior":
    case "moving":
    case "cleaning":
    case "repair": {
      // 인테리어/이사/청소/수리 — 4가지 고정 (헬퍼 사용)
      extras.push(...buildServiceExtras(item, heroColor))
      break
    }
    case "secondhand":
    case "group-buying":
      // 가격만 사용 (아래 showPrice 블록에서 처리)
      break
    default:
      // 기본 — location 한 줄
      if (item.location) {
        extras.push({
          icon: "location-outline",
          text: stripRegionPrefix(item.location),
        })
      }
  }

  return (
    <Pressable onPress={onPress} style={[styles.gridItem, width ? { width } : null]}>
      <View style={styles.gridThumbWrap}>
        {thumb ? (
          <SafeImage source={{ uri: thumb }} style={styles.gridThumb} cachePolicy="memory-disk" transition={0} contentFit="cover" />
        ) : (
          <View style={[styles.gridThumb, styles.listThumbEmpty]}>
            <Ionicons name="image-outline" size={32} color="rgba(100,116,139,0.4)" />
          </View>
        )}
        {showCategory && !!item.category && (
          <View style={styles.listCatBadge}>
            <Text style={styles.listCatBadgeText}>{item.category}</Text>
          </View>
        )}
        {statusInfo && status !== "active" && status !== "available" && status !== "recruiting" && (
          <View style={[styles.listStatusBadge, { backgroundColor: statusInfo.color + "E6" }]}>
            <Text style={styles.listStatusBadgeText}>{statusInfo.label}</Text>
          </View>
        )}
        {/* 카드 ⋮ 메뉴 — 썸네일 우상단 absolute */}
        {cardKind && (
          <ListCardMenu
            kind={cardKind}
            postId={String(item.id)}
            authorId={item.user_id ?? null}
            title={title}
            placement="thumb-overlay"
            onChanged={onChanged}
          />
        )}
      </View>
      <View style={styles.gridBody}>
        <Text style={styles.gridTitle} numberOfLines={2}>{title}</Text>
        {extras.map((ex, i) => (
          <View key={i} style={styles.gridExtraRow}>
            {ex.icon ? (
              <Ionicons
                name={ex.icon}
                size={(ex as any).emphasis ? 13 : 11}
                color={ex.color ?? lightColors.ink500}
              />
            ) : null}
            <Text
              style={[
                styles.gridMeta,
                ex.color ? { color: ex.color, fontWeight: "600" } : null,
                (ex as any).emphasis && { fontSize: 17, fontWeight: "700" },
              ]}
              numberOfLines={1}
            >
              {ex.text}
            </Text>
          </View>
        ))}
        {showPrice && price != null && (
          <View style={{ marginTop: 2 }}>
            {item.original_price && item.original_price > 0 && item.group_price && item.original_price > item.group_price ? (
              <View style={styles.discountRow}>
                <Text style={styles.discountPct}>
                  {Math.round(((item.original_price - item.group_price) / item.original_price) * 100)}%
                </Text>
                <Text style={styles.originalPrice}>
                  {Number(item.original_price).toLocaleString()}원
                </Text>
                <Text style={styles.gridPrice} numberOfLines={1}>
                  {Number(price).toLocaleString()}원
                </Text>
              </View>
            ) : (
              <Text style={styles.gridPrice} numberOfLines={1}>
                {Number(price).toLocaleString()}원
              </Text>
            )}
          </View>
        )}
      </View>
    </Pressable>
  )
}

// Note: RowCard 는 GridCard 통합 후 deprecated

function makeStyles(colors: any) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { padding: spacing[8], alignItems: "center" },
  empty: { paddingVertical: 40, paddingHorizontal: spacing[6], alignItems: "center", gap: 8 },
  emptyText: { color: colors.ink500, fontSize: fontSize.sm },
  loadMoreSpinner: { paddingVertical: spacing[4], alignItems: "center" },

  header: {
    flexDirection: "row", alignItems: "center",
    height: 52, paddingHorizontal: spacing[3],
  },
  headerTitle: { fontSize: fontSize.md, fontWeight: "700", color: colors.ink900, flex: 1, lineHeight: 24, marginLeft: 4 },

  heroSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: spacing[3],
    marginTop: spacing[3],
    marginBottom: 8,
  },
  heroSearch: {
    flex: 1, height: 40,
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.muted, borderRadius: 999,
    paddingHorizontal: 12,
  },
  heroSearchInput: { flex: 1, fontSize: fontSize.sm, color: colors.ink900, padding: 0 },
  heroRegionChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    height: 40, paddingHorizontal: 12,
    borderRadius: 999, borderWidth: 1,
    backgroundColor: "#f4f4f5", borderColor: "#e4e4e7",
  },
  heroRegionChipText: { fontSize: 12, fontWeight: "700", color: "#3f3f46", lineHeight: 16, includeFontPadding: false },
  heroAddBtn: { justifyContent: "center", alignItems: "center", height: 40 },

  // Category chips — web ListingMobileTabs 정확 매핑
  // (bg-background sticky / px-3 py-2.5 / chip px-3.5 py-2 rounded-full text-[13px] / min-h-[36px])
  // 외곽 wrap — 고정 height 으로 ScrollView 의 세로 흔들림 완전 차단
  catRowWrap: {
    height: 52,
    backgroundColor: colors.background,
  },
  catRowOuter: {
    flexGrow: 0,
    flexShrink: 0,
  },
  catRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    alignItems: "center",
  },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 0,
    height: 36,              // 고정 height
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,          // 보더 항상 — active/inactive 둘 다 동일 두께
    borderColor: "transparent",
  },
  catChipActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  catChipInactive: {
    backgroundColor: "#f1f5f9",
    borderColor: "#f1f5f9",
  },
  catChipText: {
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 16,          // lineHeight 명시 — active/inactive 폰트 메트릭 차이 제거
    includeFontPadding: false, // Android 폰트 패딩 제거
    textAlignVertical: "center",
  } as any,
  catChipTextActive: {
    color: "#ffffff",        // text-background
  },
  catChipTextInactive: {
    color: "#0f172a",        // text-foreground
  },

  toolbar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing[4], paddingVertical: spacing[2],
    zIndex: 50, // sortMenu 가 아래 List 위에 떠야 함
  },
  sortAnchor: {
    position: "relative",
  },
  count: { fontSize: fontSize.sm, color: colors.ink500 },
  toolBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    backgroundColor: colors.muted,
  },
  toolBtnText: { fontSize: 12, color: colors.ink900 },

  sortMenu: {
    position: "absolute",
    top: 38,                     // toolBtn 바로 아래
    right: 0,
    minWidth: 120,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
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
    // width 는 inline 으로 픽셀 단위 지정 (% 는 초기 layout 시 0 되는 이슈 회피)
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
  gridMeta: { fontSize: 11, color: colors.ink500, flex: 1 },
  gridExtraRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  gridPrice: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.ink900,
    marginTop: 2,
  },

  // List item — web ListingListItem 1:1 미러 (당근마켓 모바일 스타일)
  // flex gap-3 p-3 active:bg-secondary/50 border-b
  grid: { gap: 0 },
  listItem: {
    flexDirection: "row",
    gap: 12,                 // gap-3
    paddingHorizontal: 12,   // p-3 horizontal
    paddingVertical: 12,     // p-3 vertical
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  // 130x130 썸네일 (rounded-lg = 8px, gradient bg)
  listThumbWrap: {
    width: 130, height: 130,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#f1f5f9", // slate-100
    position: "relative",
  },
  listThumb: { width: "100%", height: "100%" },
  listThumbEmpty: {
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },
  listThumbCatPill: {
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  listThumbCatPillText: { fontSize: 12, fontWeight: "600", color: "#64748b" },
  // 카테고리 칩 — top-1.5 left-1.5 (web)
  listCatBadge: {
    position: "absolute", top: 6, left: 6,
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.95)",
    shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  listCatBadgeText: {
    fontSize: 10, fontWeight: "500", color: colors.ink900,
  },
  // 상태 배지 — bottom-1.5 left-1.5
  listStatusBadge: {
    position: "absolute", bottom: 6, left: 6,
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 4,
  },
  listStatusBadgeText: { fontSize: 10, fontWeight: "600", color: "#ffffff" },

  // 우측 본문
  listBody: { flex: 1, minWidth: 0 },
  listTitle: {
    fontSize: 17,           // text-[17px]
    color: colors.ink900,
    fontWeight: "500",      // font-medium
    lineHeight: 22,         // leading-snug
  },
  listMeta: {
    fontSize: 13,           // text-[13px]
    color: colors.ink500,
    marginTop: 4,
  },
  // 신장개업 — 오픈 이벤트 (단일 Text 로 처리).
  // <Text> 자체가 content-width + 자동 wrap 지원. alignSelf:flex-start 로
  // 짧을 땐 텍스트 너비만큼 핑크 칩, 길어지면 listBody 너비까지 wrap.
  openingEventText: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: "rgba(236,72,153,0.08)",
    fontSize: 12,
    fontWeight: "600",
    color: "#be185d",
    lineHeight: 18,
  },
  listPrice: {
    fontSize: 19,           // text-[19px]
    color: colors.ink900,
    fontWeight: "700",      // font-bold
    marginTop: 6,           // mt-1.5
  },
  // discount row (group-buying)
  discountRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  discountPct: {
    fontSize: 14, fontWeight: "800",
    color: "#e11d48",  // rose-600 (할인 강조)
  },
  originalPrice: {
    fontSize: 12, color: colors.ink500,
    textDecorationLine: "line-through",
  },
  listStats: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,                // gap-2.5
    marginTop: "auto",
    paddingTop: 4,
  },
  listStat: { flexDirection: "row", alignItems: "center", gap: 2 },
  listStatText: { fontSize: 12, color: colors.ink500 },

})
}
const styles = makeStyles(lightColors)

// ── 모임 전용 컴팩트 행 (가로 레이아웃, 세로 얇음) ────────────────────
const CLUB_SPORT_EMOJI: Record<string, string> = {
  러닝: "🏃", 마라톤: "🏃", 조깅: "🏃",
  축구: "⚽", 풋살: "⚽",
  배드민턴: "🏸",
  농구: "🏀",
  테니스: "🎾",
  탁구: "🏓",
  배구: "🏐",
  골프: "⛳",
  볼링: "🎳",
  수영: "🏊", 다이빙: "🏊",
  등산: "⛰️", 하이킹: "⛰️", 트레킹: "⛰️",
  자전거: "🚴", 사이클: "🚴",
  요가: "🧘", 필라테스: "🧘",
  헬스: "💪",
  복싱: "🥊",
  야구: "⚾",
}
function pickClubEmoji(...probe: (string | null | undefined)[]): string {
  for (const text of probe) {
    if (!text) continue
    for (const key of Object.keys(CLUB_SPORT_EMOJI)) {
      if (text.includes(key)) return CLUB_SPORT_EMOJI[key]
    }
  }
  return "🎯"
}

// ── 모임 CTA 헬퍼: 참여하기 → 자동 join + 그룹 채팅 진입 ────────────
// 한 명이라도 참여하면 채팅방이 살아있는 구조 (정원 마감 기다리지 않음).
// 이미 멤버면 그냥 채팅방 진입.
async function joinClubAndOpenChat(item: any, router: ReturnType<typeof useRouter>) {
  const clubId = String(item.id)
  try {
    const res = await gwangjangFetch(`/api/clubs/${clubId}/join`, {
      method: "POST",
    })
    if (res.ok) {
      // 참여 성공 → 그룹 채팅 진입
      router.push(`/chat/club/${clubId}` as any)
      return
    }
    const j = await res.json().catch(() => ({}))
    // 이미 멤버면 그냥 채팅방으로 이동
    if (j?.alreadyMember) {
      router.push(`/chat/club/${clubId}` as any)
      return
    }
    // 본인 모임 → 그냥 채팅방으로 (호스트도 자기 모임 채팅 사용 가능)
    if (typeof j?.error === "string" && j.error.includes("본인")) {
      router.push(`/chat/club/${clubId}` as any)
      return
    }
    Alert.alert("참여 실패", j?.error || "참여하지 못했습니다")
  } catch {
    Alert.alert("오류", "참여 중 오류가 발생했습니다")
  }
}

// 채팅 버튼 — 주최자와 1:1 DM (모임 문의용)
async function openClubInquiryDM(item: any, router: ReturnType<typeof useRouter>) {
  const clubId = String(item.id)
  const ownerId = item.user_id
  if (!ownerId) {
    Alert.alert("알림", "주최자 정보가 없습니다")
    return
  }
  try {
    // 본인이 주최자면 자기랑 DM 못 함 → 그냥 그룹 채팅으로 fallback
    const res = await gwangjangFetch("/api/chat/rooms", {
      method: "POST",
      body: JSON.stringify({
        postId: clubId,
        sellerId: ownerId,
        postType: "clubs",
      }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      if (typeof j?.error === "string" && j.error.includes("본인")) {
        // 호스트 본인이 채팅 누름 → 그룹 채팅으로
        router.push(`/chat/club/${clubId}` as any)
        return
      }
      throw new Error(j?.error || "채팅방 생성 실패")
    }
    const j = await res.json().catch(() => ({}))
    const roomId = j?.roomId ?? j?.room?.id ?? j?.id
    if (!roomId) throw new Error("채팅방 정보 없음")
    router.push(`/chat/${roomId}` as any)
  } catch (e: any) {
    Alert.alert("실패", e?.message || "1:1 채팅 시작 실패")
  }
}

// 종목별 그라데이션 — 웹 club-card 의 indigo→violet 톤 + 종목별 변형
const SPORT_GRADIENT: Record<string, [string, string]> = {
  러닝: ["#f97316", "#dc2626"],
  마라톤: ["#f97316", "#dc2626"],
  조깅: ["#f97316", "#dc2626"],
  축구: ["#10b981", "#047857"],
  풋살: ["#10b981", "#047857"],
  배드민턴: ["#facc15", "#ca8a04"],
  농구: ["#fb923c", "#c2410c"],
  테니스: ["#a3e635", "#65a30d"],
  탁구: ["#f87171", "#b91c1c"],
  배구: ["#fbbf24", "#d97706"],
  골프: ["#22c55e", "#15803d"],
  볼링: ["#06b6d4", "#0e7490"],
  수영: ["#38bdf8", "#0369a1"],
  등산: ["#16a34a", "#14532d"],
  자전거: ["#14b8a6", "#0e7490"],
  요가: ["#84cc16", "#4d7c0f"],
  헬스: ["#64748b", "#1e293b"],
  복싱: ["#ef4444", "#7f1d1d"],
  야구: ["#0ea5e9", "#1e40af"],
}
function pickSportGradient(sport?: string | null, category?: string | null, title?: string | null): [string, string] {
  const probe = [sport, category, title].filter(Boolean) as string[]
  for (const text of probe) {
    for (const key of Object.keys(SPORT_GRADIENT)) {
      if (text.includes(key)) return SPORT_GRADIENT[key]
    }
  }
  return ["#6366f1", "#a855f7"] // default indigo→violet (웹과 동일)
}

const SKILL_COLOR: Record<string, { bg: string; fg: string }> = {
  누구나: { bg: "rgba(255,255,255,0.9)", fg: "#374151" },
  초급: { bg: "#22c55e", fg: "#ffffff" },
  중급: { bg: "#eab308", fg: "#ffffff" },
  고급: { bg: "#ef4444", fg: "#ffffff" },
}

function ClubThinRow({
  item,
  heroColor,
  onPress,
}: {
  item: any
  heroColor: string
  onPress: () => void
}) {
  const clubThinStyles = useThemedStyles(makeClubThinStyles)
  const router = useRouter()
  const title = item.title ?? ""
  const sport = item.sport_type ?? item.category ?? null
  const emoji = pickClubEmoji(sport, item.category, title)
  // 하늘색 통일 — 연한 sky tint (#e0f2fe)
  const gradient: [string, string] = ["#e0f2fe", "#e0f2fe"]
  const thumb = pickThumb(item.images) || pickClubTheme(sport ?? title).thumb
  const cur = typeof item.current_members === "number" ? item.current_members : null
  const max = typeof item.max_members === "number" ? item.max_members : null
  const isFull = cur != null && max != null && cur >= max
  const ratio = cur != null && max != null && max > 0 ? Math.min(1, cur / max) : 0
  const fillPct = Math.round(ratio * 100)
  const skillLevel: string | null = item.skill_level ?? null
  const skillColor = skillLevel
    ? SKILL_COLOR[skillLevel] ?? SKILL_COLOR["누구나"]
    : null

  let dateStr: string | null = null
  const rawDate = item.meeting_date
  if (typeof rawDate === "string") {
    const m = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) {
      const month = parseInt(m[2], 10)
      const day = parseInt(m[3], 10)
      const dt = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`)
      const wd = isNaN(dt.getTime())
        ? ""
        : ` (${["일", "월", "화", "수", "목", "금", "토"][dt.getDay()]})`
      dateStr = `${month}/${day}${wd}`
    }
  }

  const place = item.location
    ? stripRegionPrefix(item.location)
    : item.meeting_place || null

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [clubThinStyles.card, pressed && { opacity: 0.97 }]}
    >
      {/* 상단 그라데이션 헤더 (4:3) */}
      <View style={clubThinStyles.heroWrap}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject as any}
        />
        {thumb ? (
          <Image source={{ uri: thumb }} style={StyleSheet.absoluteFillObject as any} cachePolicy="memory-disk" transition={0} contentFit="cover" />
        ) : (
          <Text style={clubThinStyles.heroEmoji}>{emoji}</Text>
        )}
        {/* 좌상단 상태 pill */}
        <View
          style={[
            clubThinStyles.heroTopLeft,
            { backgroundColor: isFull ? "#ef4444" : "#3b82f6" },
          ]}
        >
          <Text style={clubThinStyles.heroTopLeftText}>
            {isFull ? "마감" : "모집중"}
          </Text>
        </View>
        {/* 좌하단 스킬 pill */}
        {skillColor && (
          <View
            style={[
              clubThinStyles.heroBottomLeft,
              { backgroundColor: skillColor.bg },
            ]}
          >
            <Text
              style={[
                clubThinStyles.heroBottomLeftText,
                { color: skillColor.fg },
              ]}
            >
              {skillLevel}
            </Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={clubThinStyles.info}>
        <Text style={clubThinStyles.title} numberOfLines={2}>
          {title}
        </Text>
        {item.description && (
          <Text style={clubThinStyles.desc} numberOfLines={1}>
            {item.description}
          </Text>
        )}

        {/* Meta 줄들 */}
        <View style={{ gap: 4, marginTop: 6 }}>
          {place && (
            <View style={clubThinStyles.metaLine}>
              <Ionicons name="location-outline" size={12} color={lightColors.ink500} />
              <Text style={clubThinStyles.metaLineText} numberOfLines={1}>
                {place}
              </Text>
            </View>
          )}
          {(dateStr || item.meeting_time) && (
            <View style={clubThinStyles.metaLine}>
              <Ionicons name="calendar-outline" size={12} color={lightColors.ink500} />
              <Text style={clubThinStyles.metaLineText} numberOfLines={1}>
                {dateStr}
              </Text>
              {item.meeting_time && (
                <>
                  <Ionicons
                    name="time-outline"
                    size={12}
                    color={lightColors.ink500}
                    style={{ marginLeft: 4 }}
                  />
                  <Text style={clubThinStyles.metaLineText} numberOfLines={1}>
                    {item.meeting_time}
                  </Text>
                </>
              )}
            </View>
          )}
        </View>

        {/* 참여 현황 + 진행률 바 */}
        {cur != null && max != null && (
          <View style={{ marginTop: 10, gap: 4 }}>
            <View style={clubThinStyles.progressHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Ionicons name="people-outline" size={12} color={lightColors.ink500} />
                <Text style={clubThinStyles.metaLineText}>참여 현황</Text>
              </View>
              <Text
                style={[
                  clubThinStyles.progressCount,
                  { color: isFull ? "#ef4444" : heroColor },
                ]}
              >
                {cur}/{max}명
              </Text>
            </View>
            <View style={clubThinStyles.progressTrack}>
              <View
                style={[
                  clubThinStyles.progressFill,
                  {
                    width: `${fillPct}%`,
                    backgroundColor: isFull ? "#ef4444" : heroColor,
                  },
                ]}
              />
            </View>
          </View>
        )}

        {/* CTA */}
        <View style={clubThinStyles.ctaRow}>
          <Pressable
            onPress={(e) => {
              e.stopPropagation()
              joinClubAndOpenChat(item, router)
            }}
            disabled={isFull}
            style={({ pressed }) => [
              clubThinStyles.primaryCta,
              { backgroundColor: isFull ? lightColors.muted : heroColor },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text
              style={[
                clubThinStyles.primaryCtaText,
                { color: isFull ? lightColors.ink500 : "#ffffff" },
              ]}
            >
              {isFull ? "마감" : "참여하기 →"}
            </Text>
          </Pressable>
          <Pressable
            onPress={(e) => {
              e.stopPropagation()
              openClubInquiryDM(item, router)
            }}
            style={({ pressed }) => [
              clubThinStyles.iconCta,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={18}
              color={lightColors.ink700}
            />
          </Pressable>
        </View>
      </View>
    </Pressable>
  )
}

const clubsGridStyles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    gap: 12,
  },
})

// ── 모임 리스트 모드 — 컴팩트 가로 카드 ────────────────────────
function ClubListRow({
  item,
  heroColor,
  onPress,
}: {
  item: any
  heroColor: string
  onPress: () => void
}) {
  const clubListStyles = useThemedStyles(makeClubListStyles)
  const router = useRouter()
  const title = item.title ?? ""
  const sport = item.sport_type ?? item.category ?? null
  const emoji = pickClubEmoji(sport, item.category, title)
  // 하늘색 통일 — 연한 sky tint (#e0f2fe)
  const gradient: [string, string] = ["#e0f2fe", "#e0f2fe"]
  const thumb = pickThumb(item.images) || pickClubTheme(sport ?? title).thumb
  const cur = typeof item.current_members === "number" ? item.current_members : null
  const max = typeof item.max_members === "number" ? item.max_members : null
  const isFull = cur != null && max != null && cur >= max
  const ratio = cur != null && max != null && max > 0 ? Math.min(1, cur / max) : 0
  const fillPct = Math.round(ratio * 100)
  const skillLevel: string | null = item.skill_level ?? null
  const skillColor = skillLevel
    ? SKILL_COLOR[skillLevel] ?? SKILL_COLOR["누구나"]
    : null

  let dateStr: string | null = null
  const rawDate = item.meeting_date
  if (typeof rawDate === "string") {
    const m = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) {
      const month = parseInt(m[2], 10)
      const day = parseInt(m[3], 10)
      const dt = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`)
      const wd = isNaN(dt.getTime())
        ? ""
        : ` (${["일", "월", "화", "수", "목", "금", "토"][dt.getDay()]})`
      dateStr = `${month}/${day}${wd}`
    }
  }

  const place = item.location
    ? stripRegionPrefix(item.location)
    : item.meeting_place || null

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [clubListStyles.card, pressed && { opacity: 0.97 }]}
    >
      <View style={clubListStyles.row}>
        {/* 좌측 — 작은 그라데이션 썸네일 (88×88) + 상태/스킬 뱃지 */}
        <View style={clubListStyles.thumbWrap}>
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject as any}
          />
          {thumb ? (
            <Image source={{ uri: thumb }} style={StyleSheet.absoluteFillObject as any} cachePolicy="memory-disk" transition={0} contentFit="cover" />
          ) : (
            <Text style={clubListStyles.thumbEmoji}>{emoji}</Text>
          )}
          {/* 상태 — 좌상단 */}
          <View
            style={[
              clubListStyles.statusBadge,
              { backgroundColor: isFull ? "#ef4444" : "#3b82f6" },
            ]}
          >
            <Text style={clubListStyles.statusBadgeText}>
              {isFull ? "마감" : "모집중"}
            </Text>
          </View>
          {/* 스킬 — 좌하단 */}
          {skillColor && (
            <View
              style={[
                clubListStyles.skillBadge,
                { backgroundColor: skillColor.bg },
              ]}
            >
              <Text style={[clubListStyles.skillBadgeText, { color: skillColor.fg }]}>
                {skillLevel}
              </Text>
            </View>
          )}
        </View>

        {/* 우측 — 정보 + CTA */}
        <View style={{ flex: 1, minWidth: 0, justifyContent: "space-between" }}>
          <View>
            <Text style={clubListStyles.title} numberOfLines={2}>
              {title}
            </Text>
            {/* 메타: 날짜·시간 / 장소 */}
            {(dateStr || item.meeting_time) && (
              <View style={[clubListStyles.metaLine, { marginTop: 4 }]}>
                <Ionicons name="calendar-outline" size={11} color={lightColors.ink500} />
                <Text style={clubListStyles.metaText} numberOfLines={1}>
                  {[dateStr, item.meeting_time].filter(Boolean).join(" · ")}
                </Text>
              </View>
            )}
            {place && (
              <View style={[clubListStyles.metaLine, { marginTop: 2 }]}>
                <Ionicons name="location-outline" size={11} color={lightColors.ink500} />
                <Text style={clubListStyles.metaText} numberOfLines={1}>
                  {place}
                </Text>
              </View>
            )}
            {/* 진행률 바 */}
            {cur != null && max != null && (
              <View style={{ marginTop: 6, gap: 3 }}>
                <View style={clubListStyles.progressHeader}>
                  <Text style={clubListStyles.metaText}>참여</Text>
                  <Text
                    style={[
                      clubListStyles.progressCount,
                      { color: isFull ? "#ef4444" : heroColor },
                    ]}
                  >
                    {cur}/{max}명
                  </Text>
                </View>
                <View style={clubListStyles.progressTrack}>
                  <View
                    style={[
                      clubListStyles.progressFill,
                      {
                        width: `${fillPct}%`,
                        backgroundColor: isFull ? "#ef4444" : heroColor,
                      },
                    ]}
                  />
                </View>
              </View>
            )}
          </View>
          {/* CTA */}
          <View style={clubListStyles.ctaRow}>
            <Pressable
              onPress={(e) => {
                e.stopPropagation()
                joinClubAndOpenChat(item, router)
              }}
              disabled={isFull}
              style={({ pressed }) => [
                clubListStyles.primaryCta,
                { backgroundColor: isFull ? lightColors.muted : heroColor },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text
                style={[
                  clubListStyles.primaryCtaText,
                  { color: isFull ? lightColors.ink500 : "#ffffff" },
                ]}
              >
                {isFull ? "마감" : "참여하기 →"}
              </Text>
            </Pressable>
            <Pressable
              onPress={(e) => {
                e.stopPropagation()
                openClubInquiryDM(item, router)
              }}
              style={({ pressed }) => [
                clubListStyles.iconCta,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={16}
                color={lightColors.ink700}
              />
            </Pressable>
          </View>
        </View>
      </View>
    </Pressable>
  )
}

function makeClubListStyles(colors: any) {
  return StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 10,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "stretch",
  },
  thumbWrap: {
    width: 88,
    alignSelf: "stretch", // 행 전체 높이로 늘어남 (하단 흰 여백 제거)
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 88,
  },
  thumbEmoji: {
    fontSize: 36,
    textShadowColor: "rgba(0,0,0,0.2)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  statusBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  statusBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "800",
  },
  skillBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  skillBadgeText: {
    fontSize: 9,
    fontWeight: "600",
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink900,
    lineHeight: 17,
  },
  metaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  metaText: {
    fontSize: 11,
    color: colors.ink500,
    flexShrink: 1,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressCount: {
    fontSize: 11,
    fontWeight: "700",
  },
  progressTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.muted,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  ctaRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
  },
  primaryCta: {
    flex: 1,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryCtaText: {
    fontSize: 11,
    fontWeight: "700",
  },
  iconCta: {
    width: 34,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
})
}
const clubListStyles = makeClubListStyles(lightColors)

function makeClubThinStyles(colors: any) {
  return StyleSheet.create({
  card: {
    marginBottom: 0,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    overflow: "hidden",
  },
  // 상단 그라데이션 헤더 — 16:10 비율 (4:3 보다 세로 짧음)
  heroWrap: {
    width: "100%",
    aspectRatio: 16 / 10,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  heroEmoji: {
    fontSize: 44,
    textShadowColor: "rgba(0,0,0,0.2)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  heroTopLeft: {
    position: "absolute",
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  heroTopLeftText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
  },
  heroBottomLeft: {
    position: "absolute",
    bottom: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  heroBottomLeftText: {
    fontSize: 10,
    fontWeight: "600",
  },
  info: {
    padding: 10,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink900,
    lineHeight: 17,
  },
  desc: {
    marginTop: 3,
    fontSize: 11,
    color: colors.ink500,
  },
  metaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  metaLineText: {
    fontSize: 11,
    color: colors.ink500,
    flexShrink: 1,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressCount: {
    fontSize: 11,
    fontWeight: "700",
  },
  progressTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.muted,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  primaryCta: {
    flex: 1,
    height: 32,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryCtaText: {
    fontSize: 12,
    fontWeight: "700",
  },
  iconCta: {
    width: 36,
    height: 32,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
})
}
const clubThinStyles = makeClubThinStyles(lightColors)
