/**
 * 검색 탭 — 광장 web /search 1:1 미러.
 *
 * 정독 매핑:
 *   - 헤더: 검색 input + 필터 토글 (부동산 탭만)
 *   - 빈 상태: 최근 검색어 + 인기 검색어
 *   - 10 탭 (전체 + 9 카테고리)
 *   - 정렬: 최신순 / 인기순
 *   - 결과: 카테고리별 그룹 (전체) / 단일 리스트 (특정 탭)
 *   - 부동산 탭 추가 필터: property_type / transaction_type
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Image } from "expo-image"
import { useRouter, useLocalSearchParams } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { useThemedStyles } from "@/components/useColorScheme"
import type { SearchCategory, SearchHit, SearchSort } from "@gwangjang/types/search"
import { searchDirect, listTrendingTermsDirect, suggestSearchTermsDirect } from "@/lib/search-direct"
import { useCurrentPlaza } from "@/lib/plaza"

// 🅲 광장 격리 — 광장별 검색 최근 키
const RECENT_KEY_PREFIX = "search:recent:v2:"
const MAX_RECENT = 10
function recentKey(plaza: string | null | undefined): string {
  return `${RECENT_KEY_PREFIX}${plaza || "default"}`
}

const PROPERTY_TYPES = ["전체", "아파트", "빌라", "오피스텔", "원룸", "투룸", "주택", "펜션", "상가", "사무실", "토지"]
const TRANSACTION_TYPES = ["전체", "매매", "전세", "월세"]

type TabKey = "all" | SearchCategory

interface TabMeta {
  key: TabKey
  label: string
  icon: any
  color: string
}

const TABS: TabMeta[] = [
  { key: "all",          label: "전체",     icon: "sparkles",          color: lightColors.primary },
  { key: "properties",   label: "부동산",   icon: "home",               color: "#2563eb" },
  { key: "board",        label: "게시판",   icon: "chatbox-outline",    color: "#3b82f6" },
  { key: "sharing",      label: "나눔",     icon: "gift",               color: "#ef4444" },
  { key: "clubs",        label: "모임",     icon: "people",             color: "#6366f1" },
  { key: "group_buying", label: "공동구매", icon: "cart",               color: "#8b5cf6" },
  { key: "local_food",   label: "로컬푸드", icon: "leaf",               color: "#22c55e" },
  { key: "services",     label: "서비스",   icon: "construct",          color: "#ea580c" },
  { key: "new_store",    label: "신장개업", icon: "storefront",         color: "#f97316" },
  { key: "profiles",     label: "사람",     icon: "person",             color: "#ec4899" },
]

const CATEGORY_META: Record<SearchCategory, { label: string; color: string; bg: string; icon: string }> = {
  properties:   { label: "부동산",   color: "#2563eb", bg: "rgba(59,130,246,0.1)", icon: "home-outline" },
  board:        { label: "게시판",   color: "#3b82f6", bg: "rgba(59,130,246,0.1)", icon: "document-text-outline" },
  sharing:      { label: "나눔",     color: "#ef4444", bg: "rgba(239,68,68,0.1)", icon: "heart-outline" },
  clubs:        { label: "모임",     color: "#6366f1", bg: "rgba(99,102,241,0.1)", icon: "people-outline" },
  group_buying: { label: "공동구매", color: "#8b5cf6", bg: "rgba(139,92,246,0.1)", icon: "cart-outline" },
  local_food:   { label: "로컬푸드", color: "#22c55e", bg: "rgba(34,197,94,0.1)", icon: "leaf-outline" },
  services:     { label: "서비스",   color: "#ea580c", bg: "rgba(234,88,12,0.1)", icon: "construct-outline" },
  new_store:    { label: "신장개업", color: "#f97316", bg: "rgba(249,115,22,0.1)", icon: "storefront-outline" },
  profiles:     { label: "사람",     color: "#ec4899", bg: "rgba(236,72,153,0.1)", icon: "person-outline" },
}

function formatPrice(meta: Record<string, any>): string | null {
  const { transaction_type, price, monthly_rent } = meta
  if (!transaction_type) return null
  if (transaction_type === "매매" && price) return `${Number(price).toLocaleString()}만원`
  if (transaction_type === "전세" && price) return `${Number(price).toLocaleString()}만원`
  if (transaction_type === "월세" && (price || monthly_rent)) {
    return `${Number(price || 0).toLocaleString()}/${Number(monthly_rent || 0).toLocaleString()}만원`
  }
  return null
}

import { relativeDate } from "@/lib/relative-date"

export default function SearchTab() {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const params = useLocalSearchParams<{ q?: string; _t?: string }>()
  const [input, setInput] = useState(params.q ?? "")
  const [q, setQ] = useState(params.q ?? "")
  const [tab, setTab] = useState<TabKey>("all")
  const [sort, setSort] = useState<SearchSort>("latest")
  const [results, setResults] = useState<Record<SearchCategory, SearchHit[]>>({
    properties: [], board: [], sharing: [], clubs: [], group_buying: [],
    local_food: [], services: [], new_store: [], profiles: [],
  })
  const [counts, setCounts] = useState<Record<SearchCategory, number>>({
    properties: 0, board: 0, sharing: 0, clubs: 0, group_buying: 0,
    local_food: 0, services: 0, new_store: 0, profiles: 0,
  })
  const [loading, setLoading] = useState(false)
  const [recent, setRecent] = useState<string[]>([])
  const [trending, setTrending] = useState<string[]>([])
  // 결과 없을 때 자동완성 제안 (pg_trgm similarity)
  const [suggestions, setSuggestions] = useState<string[]>([])

  const [refreshing, setRefreshing] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [propertyType, setPropertyType] = useState("전체")
  const [transactionType, setTransactionType] = useState("전체")

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const plaza = useCurrentPlaza()
  // 최근/인기 로드 — 광장별 격리
  useEffect(() => {
    AsyncStorage.getItem(recentKey(plaza)).then((raw) => {
      try {
        const arr = raw ? JSON.parse(raw) : []
        setRecent(Array.isArray(arr) ? arr.slice(0, MAX_RECENT) : [])
      } catch {}
    })
    listTrendingTermsDirect().then(setTrending)
  }, [plaza])

  async function saveRecent(term: string) {
    if (!term.trim()) return
    try {
      const k = recentKey(plaza)
      const raw = await AsyncStorage.getItem(k)
      const prev: string[] = raw ? JSON.parse(raw) : []
      const next = [term, ...prev.filter((v) => v !== term)].slice(0, MAX_RECENT)
      await AsyncStorage.setItem(k, JSON.stringify(next))
      setRecent(next)
    } catch {}
  }

  async function doClearRecent() {
    try {
      await AsyncStorage.removeItem(recentKey(plaza))
    } catch {}
    setRecent([])
  }

  function clearRecent() {
    Alert.alert("최근 검색어 삭제", "최근 검색 기록을 모두 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "전체 삭제", style: "destructive", onPress: () => { void doClearRecent() } },
    ])
  }

  const runSearch = useCallback(async (query: string, targetTab: TabKey, targetSort: SearchSort) => {
    if (!query) {
      setResults({
        properties: [], board: [], sharing: [], clubs: [], group_buying: [],
        local_food: [], services: [], new_store: [], profiles: [],
      })
      setCounts({
        properties: 0, board: 0, sharing: 0, clubs: 0, group_buying: 0,
        local_food: 0, services: 0, new_store: 0, profiles: 0,
      })
      return
    }
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setSearchError(false)
    try {
      const data = await searchDirect({
        q: query,
        scope: targetTab === "all" ? "all" : targetTab,
        sort: targetSort,
        signal: ctrl.signal,
      })
      if (!ctrl.signal.aborted) {
        setResults(data.results)
        setCounts(data.counts)
        // 결과 0건이면 자동완성 제안 조회 (오타 교정)
        const total = Object.values(data.counts).reduce((s, n) => s + n, 0)
        if (total === 0) {
          suggestSearchTermsDirect(query, 3)
            .then((s) => {
              if (!ctrl.signal.aborted) setSuggestions(s.map((x) => x.term))
            })
            .catch(() => {})
        } else {
          setSuggestions([])
        }
      }
    } catch (e: any) {
      if (!ctrl.signal.aborted) {
        console.warn("[search] error", e)
        setSearchError(true)
        setResults({
          properties: [], board: [], sharing: [], clubs: [], group_buying: [],
          local_food: [], services: [], new_store: [], profiles: [],
        })
      }
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [])

  const onRefresh = useCallback(async () => {
    if (!q.trim()) return
    setRefreshing(true)
    try { await runSearch(q, tab, sort) } finally { setRefreshing(false) }
  }, [q, tab, sort, runSearch])

  useEffect(() => {
    const incoming = params.q ?? ""
    setInput(incoming)
    setQ(incoming)
    if (incoming.trim()) saveRecent(incoming.trim())
  }, [params.q, params._t]) // eslint-disable-line react-hooks/exhaustive-deps

  // debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(q, tab, sort), 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [q, tab, sort, runSearch])

  const isEmpty = !q
  const totalCount =
    counts.properties + counts.board + counts.sharing + counts.clubs + counts.group_buying +
    counts.local_food + counts.services + counts.new_store + counts.profiles

  const filteredProperties = useMemo(() => {
    let hits = results.properties
    if (propertyType !== "전체") hits = hits.filter((h) => h.meta?.property_type === propertyType)
    if (transactionType !== "전체") hits = hits.filter((h) => h.meta?.transaction_type === transactionType)
    return hits
  }, [results.properties, propertyType, transactionType])

  const handleHitPress = useCallback((hit: SearchHit) => {
    // 모든 도메인이 RN 라우트로 마이그레이션 완료.
    router.push(hit.href as any)
  }, [router])

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* 검색 헤더 — web 의 ← + input 미러 */}
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (router.canGoBack()) router.back()
            else router.replace("/(tabs)")
          }}
          hitSlop={8}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search" size={16} color={lightColors.ink500} />
          <TextInput
            style={styles.searchInput}
            value={input}
            onChangeText={(v) => {
              setInput(v)
              setQ(v)
            }}
            onSubmitEditing={() => {
              if (input.trim()) saveRecent(input.trim())
            }}
            placeholder="매물·게시판·나눔·모임·공동구매 검색"
            placeholderTextColor={lightColors.ink500}
            returnKeyType="search"
            accessibilityLabel="통합 검색"
          />
          {input.length > 0 && (
            <Pressable
              accessibilityLabel="검색어 지우기"
              accessibilityRole="button"
              onPress={() => {
                setInput("")
                setQ("")
              }}
              hitSlop={6}
            >
              <Ionicons name="close-circle" size={18} color={lightColors.ink500} />
            </Pressable>
          )}
        </View>
        {tab === "properties" && q && (
          <Pressable onPress={() => setShowFilters((v) => !v)} hitSlop={6} style={styles.filterBtn}>
            <Ionicons name="options-outline" size={18} color={lightColors.ink900} />
          </Pressable>
        )}
      </View>

      {/* 부동산 필터 */}
      {tab === "properties" && q && showFilters && (
        <View style={styles.filtersWrap}>
          <Text style={styles.filterLabel}>유형</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {PROPERTY_TYPES.map((t) => (
              <Pressable
                key={t}
                onPress={() => setPropertyType(t)}
                style={[styles.filterChip, propertyType === t && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, propertyType === t && { color: "#ffffff" }]}>{t}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={[styles.filterLabel, { marginTop: 8 }]}>거래</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {TRANSACTION_TYPES.map((t) => (
              <Pressable
                key={t}
                onPress={() => setTransactionType(t)}
                style={[styles.filterChip, transactionType === t && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, transactionType === t && { color: "#ffffff" }]}>{t}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 탭 — web 은 빈 상태에서도 노출 (검색어 입력 후 카운트 표시) */}
      <View style={styles.tabWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
            {TABS.map((t) => {
              const isActive = tab === t.key
              const cnt = t.key === "all" ? totalCount : counts[t.key]
              return (
                <Pressable
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  style={[styles.tab, isActive && styles.tabActive]}
                >
                  <Ionicons
                    name={t.icon}
                    size={14}
                    color={isActive ? "#ffffff" : t.color}
                  />
                  <Text style={[styles.tabLabel, isActive && { color: "#ffffff", fontWeight: "700" }]}>
                    {t.label}
                  </Text>
                  {cnt > 0 && (
                    <View style={[styles.tabCount, isActive && styles.tabCountActive]}>
                      <Text style={[styles.tabCountText, isActive && { color: "#ffffff" }]}>
                        {cnt > 99 ? "99+" : cnt}
                      </Text>
                    </View>
                  )}
                </Pressable>
              )
            })}
          </ScrollView>
        </View>

      {/* 본문 */}
      {isEmpty ? (
        <ScrollView contentContainerStyle={{ padding: spacing[4] }}>
          {recent.length > 0 && (
            <View style={{ marginBottom: spacing[5] }}>
              <View style={styles.sectionHead}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="time-outline" size={14} color={lightColors.ink500} />
                  <Text style={styles.sectionTitle}>최근 검색어</Text>
                </View>
                <Pressable onPress={clearRecent} hitSlop={6}>
                  <Text style={styles.clearLink}>전체 삭제</Text>
                </Pressable>
              </View>
              <View style={styles.chipWrap}>
                {recent.map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => {
                      setInput(r)
                      setQ(r)
                    }}
                    style={styles.recentChip}
                  >
                    <Text style={styles.recentChipText}>{r}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          {trending.length > 0 && (
            <View style={{ marginBottom: spacing[5] }}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="trending-up-outline" size={14} color={lightColors.primary} />
                <Text style={styles.sectionTitle}>인기 검색어</Text>
                <Text style={{ fontSize: 10, color: lightColors.ink500, marginLeft: 4 }}>
                  · 최근 7일
                </Text>
              </View>
              <View style={styles.trendingGrid}>
                {trending.slice(0, 10).map((t, i) => (
                  <Pressable
                    key={t}
                    onPress={() => {
                      setInput(t)
                      setQ(t)
                    }}
                    style={styles.trendingItem}
                  >
                    <Text
                      style={[
                        styles.trendingRank,
                        { color: i < 3 ? lightColors.primary : lightColors.ink500 },
                      ]}
                    >
                      {i + 1}
                    </Text>
                    <Text style={styles.trendingText} numberOfLines={1}>{t}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* 카테고리별 둘러보기 — web grid-cols-3 sm:grid-cols-5 */}
          <View style={{ marginBottom: spacing[5] }}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>카테고리별 둘러보기</Text>
            </View>
            <View style={styles.catGrid}>
              {(["properties", "board", "sharing", "clubs", "group_buying", "local_food", "services", "new_store", "profiles"] as SearchCategory[]).map((cat) => {
                const meta = CATEGORY_META[cat]
                const tabMeta = TABS.find((t) => t.key === cat)
                return (
                  <Pressable
                    key={cat}
                    onPress={() => setTab(cat)}
                    style={styles.catShortcut}
                  >
                    <View style={[styles.catShortcutIcon, { backgroundColor: meta.bg }]}>
                      <Ionicons
                        name={(tabMeta?.icon ?? "folder-outline") as any}
                        size={20}
                        color={meta.color}
                      />
                    </View>
                    <Text style={styles.catShortcutLabel}>{meta.label}</Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          {/* 안내 텍스트 */}
          <View style={{ alignItems: "center", marginTop: spacing[3] }}>
            <Text style={styles.helperText}>
              궁금한 키워드를 입력해 보세요 — 매물·게시판·나눔·{"\n"}모임·공동구매 등 한 번에 찾아드립니다.
            </Text>
          </View>
        </ScrollView>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      ) : searchError ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={lightColors.ink300} />
          <Text style={styles.noResultTitle}>검색 중 오류가 발생했습니다</Text>
          <Text style={styles.noResultHint}>네트워크 상태를 확인하고 다시 시도해주세요</Text>
          <Pressable
            onPress={() => runSearch(q, tab, sort)}
            style={{ marginTop: spacing[3], paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, backgroundColor: lightColors.primary }}
          >
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>다시 시도</Text>
          </Pressable>
        </View>
      ) : totalCount === 0 ? (
        <View style={styles.center}>
          <Ionicons name="search-outline" size={48} color={lightColors.ink300} />
          <Text style={styles.noResultTitle}>"{q}" 에 대한 결과가 없습니다</Text>
          <Text style={styles.noResultHint}>다른 검색어로 시도해보세요</Text>
          {suggestions.length > 0 && (
            <View style={{ marginTop: spacing[3], alignItems: "center" }}>
              <Text style={[styles.noResultHint, { marginBottom: spacing[2] }]}>
                혹시 이런 검색어인가요?
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
                {suggestions.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => { setInput(s); setQ(s) }}
                    style={{
                      paddingHorizontal: spacing[3],
                      paddingVertical: spacing[2],
                      borderRadius: radius.full,
                      backgroundColor: lightColors.primary + "1a",
                      borderWidth: 1,
                      borderColor: lightColors.primary + "33",
                    }}
                  >
                    <Text style={{ color: lightColors.primary, fontSize: fontSize.sm, fontWeight: "600" }}>
                      {s}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>
      ) : (
        <SearchResultsList
          tab={tab}
          results={results}
          counts={counts}
          filteredProperties={filteredProperties}
          totalCount={totalCount}
          sort={sort}
          setSort={setSort}
          setTab={setTab}
          handleHitPress={handleHitPress}
          refreshing={refreshing}
          onRefresh={onRefresh}
          hasQuery={!!q.trim()}
        />
      )}
    </SafeAreaView>
  )
}

// ── Virtualized search results list ──────────────────────────────────────────

type ResultListItem =
  | { type: "catHeader"; cat: SearchCategory; count: number; shownCount: number }
  | { type: "hit"; hit: SearchHit }

function SearchResultsList({
  tab,
  results,
  counts,
  filteredProperties,
  totalCount,
  sort,
  setSort,
  setTab,
  handleHitPress,
  refreshing,
  onRefresh,
  hasQuery,
}: {
  tab: TabKey
  results: Record<SearchCategory, SearchHit[]>
  counts: Record<SearchCategory, number>
  filteredProperties: SearchHit[]
  totalCount: number
  sort: SearchSort
  setSort: (s: SearchSort) => void
  setTab: (t: TabKey) => void
  handleHitPress: (hit: SearchHit) => void
  refreshing?: boolean
  onRefresh?: () => void
  hasQuery?: boolean
}) {
  const flatData = useMemo<ResultListItem[]>(() => {
    if (tab === "all") {
      const items: ResultListItem[] = []
      for (const cat of Object.keys(CATEGORY_META) as SearchCategory[]) {
        const hits = results[cat].slice(0, 30)
        if (hits.length === 0) continue
        items.push({ type: "catHeader", cat, count: counts[cat], shownCount: hits.length })
        for (const h of hits) {
          items.push({ type: "hit", hit: h })
        }
      }
      return items
    }
    const hits = (tab === "properties" ? filteredProperties : results[tab as SearchCategory]).slice(0, 30)
    return hits.map((h) => ({ type: "hit" as const, hit: h }))
  }, [tab, results, counts, filteredProperties])

  const keyExtractor = useCallback(
    (item: ResultListItem, index: number) =>
      item.type === "catHeader" ? `cat-${item.cat}` : `hit-${item.hit.id}`,
    [],
  )

  const renderItem = useCallback(
    ({ item }: { item: ResultListItem }) => {
      if (item.type === "catHeader") {
        const meta = CATEGORY_META[item.cat]
        return (
          <View style={{ marginBottom: spacing[2], marginTop: spacing[4] }}>
            <View style={styles.catHead}>
              <View style={[styles.catIcon, { backgroundColor: meta.bg }]}>
                <Ionicons name="folder-outline" size={12} color={meta.color} />
              </View>
              <Text style={[styles.catLabel, { color: meta.color }]}>{meta.label}</Text>
              <Text style={styles.catCount}>{item.count}</Text>
              {item.count > item.shownCount && (
                <Pressable
                  onPress={() => setTab(item.cat)}
                  hitSlop={6}
                  style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center" }}
                >
                  <Text style={styles.moreLink}>전체</Text>
                  <Ionicons name="chevron-forward" size={12} color={lightColors.primary} />
                </Pressable>
              )}
            </View>
          </View>
        )
      }
      return (
        <View style={{ marginBottom: 6 }}>
          <HitCard hit={item.hit} onPress={handleHitPress} />
        </View>
      )
    },
    [setTab, handleHitPress],
  )

  const listHeader = useMemo(
    () => (
      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>총 {totalCount.toLocaleString()}건</Text>
        <Pressable
          onPress={() => setSort(sort === "latest" ? "popular" : "latest")}
          style={styles.sortBtn}
          hitSlop={6}
        >
          <Ionicons name="swap-vertical-outline" size={14} color={lightColors.ink500} />
          <Text style={styles.sortText}>{sort === "latest" ? "최신순" : "인기순"}</Text>
        </Pressable>
      </View>
    ),
    [totalCount, sort, setSort],
  )

  return (
    <FlatList
      data={flatData}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListHeaderComponent={listHeader}
      contentContainerStyle={{ padding: spacing[3] }}
      initialNumToRender={15}
      maxToRenderPerBatch={10}
      windowSize={5}
      removeClippedSubviews
      refreshControl={hasQuery ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
    />
  )
}

const HitCard = memo(function HitCard({ hit, onPress }: { hit: SearchHit; onPress: (hit: SearchHit) => void }) {
  const meta = CATEGORY_META[hit.category]
  const price = hit.category === "properties" ? formatPrice(hit.meta) : null
  const isProfile = hit.category === "profiles"
  return (
    <Pressable
      onPress={() => onPress(hit)}
      style={({ pressed }) => [styles.hitCard, pressed && { backgroundColor: lightColors.muted }]}
    >
      {/* 썸네일 */}
      <View style={[styles.hitThumb, isProfile && styles.hitThumbRound]}>
        {hit.thumbnail ? (
          <Image
            source={{ uri: hit.thumbnail }}
            style={[styles.hitThumbImg, isProfile && styles.hitThumbRound]}
            cachePolicy="memory-disk"
            contentFit="cover"
            transition={100}
          />
        ) : (
          <View style={[styles.hitThumbPlaceholder, { backgroundColor: meta.bg + "18" }]}>
            <Ionicons name={meta.icon as any} size={20} color={meta.color} />
          </View>
        )}
      </View>
      <View style={styles.hitContent}>
        <View style={styles.hitTitleRow}>
          <View style={[styles.hitCatBadge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.hitCatBadgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <Text style={styles.hitTitle} numberOfLines={1}>{hit.title}</Text>
        </View>
        {hit.summary && (
          <Text style={styles.hitSummary} numberOfLines={2}>{hit.summary}</Text>
        )}
        <View style={styles.hitMeta}>
          {hit.location && (
            <Text style={styles.hitMetaText} numberOfLines={1}>📍 {hit.location}</Text>
          )}
          {price && <Text style={styles.hitPrice}>{price}</Text>}
          {hit.createdAt && <Text style={styles.hitMetaText}>· {relativeDate(hit.createdAt)}</Text>}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={lightColors.ink500} />
    </Pressable>
  )
})

function makeStyles(colors: any) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 999,
    backgroundColor: colors.muted,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.ink900,
    padding: 0,
  },
  filterBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },

  filtersWrap: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    backgroundColor: "rgba(241,245,249,0.4)",
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.ink500,
    marginBottom: 6,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    color: colors.ink900,
  },

  tabWrap: {
    backgroundColor: colors.background,
  },
  tabRow: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    gap: 6,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  tabActive: {
    backgroundColor: "#1f2937",
    borderColor: "#1f2937",
  },
  tabLabel: {
    fontSize: 12.5,
    fontWeight: "500",
    color: colors.ink900,
  },
  tabCount: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  tabCountActive: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  tabCountText: { fontSize: 10, fontWeight: "700", color: colors.ink500 },

  // Empty state
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing[2],
  },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.ink900,
  },
  clearLink: {
    fontSize: 11,
    color: colors.ink500,
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  recentChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  recentChipText: { fontSize: 12, color: colors.ink700 },
  trendingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(241,245,249,0.6)",
  },
  trendingRank: {
    fontSize: 12,
    fontWeight: "700",
    width: 20,
    textAlign: "center",
  },
  trendingText: { fontSize: 13, color: colors.ink900, flex: 1 },

  // web grid-cols-2 gap-x-4 gap-y-1.5
  trendingGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: spacing[2],
  },
  trendingItem: {
    width: "50%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },

  // web grid-cols-3 sm:grid-cols-5 gap-2
  catGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: spacing[2],
    gap: 8,
  },
  catShortcut: {
    width: "31%",
    paddingVertical: 14,
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
  },
  catShortcutIcon: {
    width: 40, height: 40, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  catShortcutLabel: {
    fontSize: 12, fontWeight: "500", color: colors.ink900,
  },

  helperText: {
    fontSize: 12,
    color: colors.ink500,
    textAlign: "center",
    lineHeight: 18,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[6],
  },
  noResultTitle: {
    fontSize: fontSize.md,
    color: colors.ink900,
    marginTop: spacing[3],
  },
  noResultHint: {
    fontSize: 12,
    color: colors.ink500,
    marginTop: 4,
  },

  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingVertical: spacing[2],
  },
  sortLabel: { fontSize: 12, color: colors.ink500 },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.muted,
  },
  sortText: { fontSize: 11, color: colors.ink900 },

  catHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: spacing[2],
  },
  catIcon: {
    width: 22,
    height: 22,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  catLabel: { fontSize: fontSize.sm, fontWeight: "600" },
  catCount: { fontSize: 11, color: colors.ink500 },
  moreLink: { fontSize: 11, color: colors.primary, fontWeight: "500" },

  // Hit card
  hitCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  hitThumb: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.muted,
    flexShrink: 0,
  },
  hitThumbRound: {
    borderRadius: 32,
  },
  hitThumbImg: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
  },
  hitThumbPlaceholder: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  hitContent: { flex: 1, minWidth: 0 },
  hitTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  hitCatBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  hitCatBadgeText: { fontSize: 10, fontWeight: "700" },
  hitTitle: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: colors.ink900,
  },
  hitSummary: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.ink500,
    marginBottom: 4,
  },
  hitMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  hitMetaText: { fontSize: 11, color: colors.ink500 },
  hitPrice: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
  },
})
}

// module-level fallback — light 색상 (외부 함수에서 styles 참조용)
const styles = makeStyles(lightColors)
