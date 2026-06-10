/**
 * 홈 탭 — 광장 web /chuncheon (춘천 메인) 1:1 RN 미러.
 *
 * 정독 매핑:
 *   - 헤더 ("{광장이름} 소식 — 뉴스 · 행사 · 날씨 한눈에")
 *   - 탭 (지역 뉴스 / 관광 달력 / 날씨)
 *   - 뉴스 탭: coverage 칩(전체+춘천/홍천/화천/양구/인제), 검색바+새로고침,
 *               NewsCard 리스트, 더보기 버튼, pull-to-refresh
 *   - 관광 달력 탭: chuncheon_events 리스트
 *   - 날씨 탭: 현재 온도 + 일별 forecast 가로 카드
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { Image } from "expo-image"
import { SafeAreaView } from "react-native-safe-area-context"
import { useLocalSearchParams, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import {
  EVENT_CATEGORY_LABELS,
  getPlazaCoverage,
  getWeather,
  listChuncheonEvents,
  listNews,
  type ChuncheonEvent,
  type NewsItem,
  type WeatherData,
} from "@gwangjang/features/home"
import { gwangjangFetch, getSupabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { useCurrentPlaza, useCurrentPlazaState, plazaCityName } from "@/lib/plaza"
import { EventsCalendar } from "@/components/city/EventsCalendar"
import { CityWeatherView } from "@/components/city/CityWeatherView"

type TabKey = "news" | "calendar" | "weather"

export default function NewsScreen() {
  const DEFAULT_PLAZA = useCurrentPlaza()
  const plazaState = useCurrentPlazaState()
  const cityName = plazaCityName(plazaState.name)
  const router = useRouter()
  const { user } = useAuth()
  const params = useLocalSearchParams<{ tab?: string }>()
  const [tab, setTab] = useState<TabKey>(
    params.tab === "weather" ? "weather" : params.tab === "events" ? "calendar" : "news",
  )
  const [coverage, setCoverage] = useState<string[]>([])
  const [selectedRegion, setSelectedRegion] = useState<string>("")

  // News
  const [news, setNews] = useState<NewsItem[]>([])
  const [newsLoading, setNewsLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")

  // Weather
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)

  // Events
  const [events, setEvents] = useState<ChuncheonEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)

  // ── 초기: 사용자 sub_region + plaza coverage ─────────
  useEffect(() => {
    const supabase = getSupabase()
    getPlazaCoverage(supabase, DEFAULT_PLAZA).then(setCoverage)
    if (user) {
      // 🅲 광장 격리 — sub_region 은 plaza_profiles 우선 → profiles fallback
      Promise.all([
        supabase.from("profiles").select("sub_region").eq("id", user.id).maybeSingle(),
        DEFAULT_PLAZA
          ? supabase.from("plaza_profiles").select("sub_region")
              .eq("user_id", user.id).eq("plaza_id", DEFAULT_PLAZA).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]).then(([profRes, ppRes]) => {
        const pp: any = ppRes?.data
        const r = (pp?.sub_region ?? (profRes.data as any)?.sub_region) as string | undefined
        if (r && typeof r === "string") setSelectedRegion(r)
      })
    }
  }, [user, DEFAULT_PLAZA])

  // ── 뉴스 로드 ────────────────────────────────────────
  // 레이스 컨디션 방지 — 가장 최근 요청만 결과 반영
  const latestReqRef = useRef(0)

  const loadNews = useCallback(
    async (q: string, region: string, key: number) => {
      const reqId = ++latestReqRef.current
      // 이전 지역 뉴스 즉시 제거 — stale 데이터 잔존 방지
      setNews([])
      setHasMore(true)
      setNewsLoading(true)
      setPage(1)
      try {
        const r = await listNews(
          (u, init) => gwangjangFetch(u, init as any),
          { q, region, page: 1, refreshKey: key },
        )
        // 더 새로운 요청이 들어왔으면 이 응답은 무시 (지역 빠르게 두 번 누른 케이스)
        if (reqId !== latestReqRef.current) return
        setNews(r.news)
        setHasMore(r.hasMore)
      } finally {
        if (reqId === latestReqRef.current) setNewsLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    loadNews(searchQuery, selectedRegion, refreshKey)
  }, [searchQuery, selectedRegion, refreshKey, loadNews])

  async function handleLoadMore() {
    if (loadingMore || !hasMore) return
    const next = page + 1
    setLoadingMore(true)
    setPage(next)
    try {
      const r = await listNews(
        (u, init) => gwangjangFetch(u, init as any),
        { q: searchQuery, region: selectedRegion, page: next },
      )
      setNews((prev) => [...prev, ...r.news])
      setHasMore(r.hasMore)
    } finally {
      setLoadingMore(false)
    }
  }

  // ── 날씨 로드 ────────────────────────────────────────
  useEffect(() => {
    setWeatherLoading(true)
    getWeather((u, init) => gwangjangFetch(u, init as any), {
      region: selectedRegion,
      refreshKey,
    })
      .then(setWeather)
      .finally(() => setWeatherLoading(false))
  }, [selectedRegion, refreshKey])

  // ── 이벤트 로드 ──────────────────────────────────────
  useEffect(() => {
    setEventsLoading(true)
    listChuncheonEvents(getSupabase(), DEFAULT_PLAZA)
      .then(setEvents)
      .finally(() => setEventsLoading(false))
  }, [])

  function handleSearchSubmit() {
    setSearchQuery(searchInput.trim())
  }

  function handleRefresh() {
    setRefreshKey((k) => k + 1)
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <View style={styles.headerIcon}>
          <Ionicons name="newspaper" size={20} color="#ffffff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{cityName} 소식</Text>
          <Text style={styles.headerSub}>뉴스 · 행사 · 날씨 한눈에</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsWrap}>
        <View style={styles.tabsBg}>
          {(["news", "weather", "calendar"] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            >
              <Ionicons
                name={
                  t === "news"
                    ? "newspaper-outline"
                    : t === "calendar"
                    ? "calendar-outline"
                    : "partly-sunny-outline"
                }
                size={14}
                color={tab === t ? lightColors.ink900 : lightColors.ink500}
              />
              <Text
                style={[
                  styles.tabText,
                  { color: tab === t ? lightColors.ink900 : lightColors.ink500 },
                ]}
              >
                {t === "news" ? "지역 뉴스" : t === "calendar" ? "관광 달력" : "날씨"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {tab === "news" && (
        <NewsTab
          coverage={coverage}
          selectedRegion={selectedRegion}
          onSelectRegion={setSelectedRegion}
          searchInput={searchInput}
          onSearchInput={setSearchInput}
          onSearchSubmit={handleSearchSubmit}
          onRefresh={handleRefresh}
          news={news}
          loading={newsLoading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadMore={handleLoadMore}
          searchQuery={searchQuery}
          cityName={cityName}
        />
      )}

      {tab === "calendar" && (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing[4],
            paddingTop: 8,
            paddingBottom: spacing[8],
          }}
        >
          {eventsLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={lightColors.primary} />
            </View>
          ) : (
            <EventsCalendar events={events} />
          )}
        </ScrollView>
      )}

      {tab === "weather" && (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing[4],
            paddingTop: 8,
            paddingBottom: spacing[8],
          }}
        >
          {weatherLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={lightColors.primary} />
            </View>
          ) : (
            <CityWeatherView weather={weather} coverage={coverage} />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

// ─── 뉴스 탭 ────────────────────────────────────────────
function NewsTab(props: {
  coverage: string[]
  selectedRegion: string
  onSelectRegion: (r: string) => void
  searchInput: string
  onSearchInput: (v: string) => void
  onSearchSubmit: () => void
  onRefresh: () => void
  news: NewsItem[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  onLoadMore: () => void
  searchQuery: string
  cityName: string
}) {
  const {
    coverage, selectedRegion, onSelectRegion,
    searchInput, onSearchInput, onSearchSubmit, onRefresh,
    news, loading, loadingMore, hasMore, onLoadMore, searchQuery, cityName,
  } = props
  // 썸네일 없는 기사는 숨김 — API 가 빈 문자열/공백/잘못된 URL 보낼 가능성 대비 strict check.
  // http(s) 로 시작하는 truthy URL 만 통과.
  // 프레시안(pressian) 기사는 사용자 요청에 따라 무조건 제외.
  const visibleNews = useMemo(
    () =>
      news.filter((n) => {
        const t = (n.thumbnail ?? "").trim()
        if (t.length === 0 || !/^https?:\/\//i.test(t)) return false
        const url = String(n.url ?? "")
        const press = String(n.press ?? "")
        if (/pressian/i.test(url) || /프레시안/.test(press)) return false
        return true
      }),
    [news],
  )

  return (
    <FlatList
      data={visibleNews}
      keyExtractor={(it) => it.id}
      contentContainerStyle={{
        paddingHorizontal: spacing[4],
        paddingTop: 8,
        paddingBottom: spacing[8],
      }}
      ListHeaderComponent={
        <View style={{ gap: spacing[3], marginBottom: spacing[3] }}>
          {coverage.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6 }}
            >
              <Pressable
                onPress={() => onSelectRegion("")}
                style={[
                  styles.regionChip,
                  selectedRegion === "" && styles.regionChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.regionChipText,
                    selectedRegion === "" && { color: "#ffffff" },
                  ]}
                >
                  전체
                </Text>
              </Pressable>
              {coverage.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => onSelectRegion(r)}
                  style={[
                    styles.regionChip,
                    selectedRegion === r && styles.regionChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.regionChipText,
                      selectedRegion === r && { color: "#ffffff" },
                    ]}
                  >
                    {r}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {/* Search bar */}
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={16} color={lightColors.ink500} />
              <TextInput
                value={searchInput}
                onChangeText={onSearchInput}
                onSubmitEditing={onSearchSubmit}
                placeholder="뉴스 검색 (예: 축제, 농사, 날씨)"
                placeholderTextColor={lightColors.ink500}
                returnKeyType="search"
                style={styles.searchInput}
              />
              {!!searchInput && (
                <Pressable
                  onPress={() => {
                    onSearchInput("")
                    onSearchSubmit()
                  }}
                  hitSlop={6}
                >
                  <Ionicons name="close" size={16} color={lightColors.ink500} />
                </Pressable>
              )}
            </View>
            <Pressable onPress={onSearchSubmit} style={styles.searchBtn}>
              <Text style={styles.searchBtnText}>검색</Text>
            </Pressable>
            <Pressable onPress={onRefresh} style={styles.iconBtn}>
              <Ionicons name="refresh" size={16} color={lightColors.ink500} />
            </Pressable>
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.statusText}>
              {searchQuery
                ? `"${searchQuery}" 검색 결과 ${visibleNews.length}건`
                : `${selectedRegion || cityName} 최신 뉴스`}
            </Text>
          </View>
        </View>
      }
      renderItem={({ item }) => <NewsCard item={item} />}
      ItemSeparatorComponent={() => <View style={{ height: spacing[2] }} />}
      ListEmptyComponent={() =>
        loading ? null : (
          <View style={styles.emptyBox}>
            <Ionicons name="newspaper-outline" size={32} color={lightColors.ink500} />
            <Text style={styles.emptyText}>아직 뉴스가 없어요</Text>
          </View>
        )
      }
      ListFooterComponent={() => {
        if (loading) {
          return (
            <View style={{ paddingVertical: 32, alignItems: "center" }}>
              <ActivityIndicator color={lightColors.primary} />
            </View>
          )
        }
        if (hasMore) {
          return (
            <Pressable
              onPress={onLoadMore}
              disabled={loadingMore}
              style={styles.moreBtn}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={lightColors.primary} />
              ) : (
                <Text style={styles.moreBtnText}>더 보기</Text>
              )}
            </Pressable>
          )
        }
        return null
      }}
      refreshControl={
        <RefreshControl
          refreshing={loading && news.length === 0}
          onRefresh={onRefresh}
          tintColor={lightColors.primary}
        />
      }
    
      removeClippedSubviews={true}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      windowSize={11}
    />
  )
}

function NewsCard({ item }: { item: NewsItem }) {
  function elapsed(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const h = Math.floor(diff / 3_600_000)
    const m = Math.floor(diff / 60_000)
    if (h > 23) return `${Math.floor(h / 24)}일 전`
    if (h > 0) return `${h}시간 전`
    return `${Math.max(1, m)}분 전`
  }
  // 방어선 — 상위 filter 가 통과시키더라도 thumbnail 없는 카드 / 프레시안 기사는 절대 렌더하지 않음.
  const thumb = (item.thumbnail ?? "").trim()
  if (!thumb || !/^https?:\/\//i.test(thumb)) return null
  const url = String(item.url ?? "")
  const press = String(item.press ?? "")
  if (/pressian/i.test(url) || /프레시안/.test(press)) return null
  return (
    <Pressable
      onPress={() => item.url && Linking.openURL(item.url).catch(() => {})}
      style={({ pressed }) => [styles.newsCard, pressed && { opacity: 0.7 }]}
    >
      {!!item.thumbnail && (
        <View style={styles.newsThumbWrap}>
          <Image
            source={{ uri: item.thumbnail }} cachePolicy="memory-disk"
            style={styles.newsThumb}
            contentFit="cover"
          />
        </View>
      )}
      <View style={styles.newsBody}>
        <View style={{ gap: 4 }}>
          <Text style={styles.newsTitle} numberOfLines={2}>
            {item.title}
          </Text>
          {!!item.description && (
            <Text style={styles.newsDesc} numberOfLines={3}>
              {item.description}
            </Text>
          )}
        </View>
        <View style={styles.newsMeta}>
          <Text style={styles.newsPress}>{item.press}</Text>
          <Text style={styles.newsDot}>·</Text>
          <Text style={styles.newsTime}>{elapsed(item.publishedAt)}</Text>
        </View>
      </View>
    </Pressable>
  )
}

// ─── 관광 달력 탭 ───────────────────────────────────────
function EventsTab({
  events,
  loading,
}: {
  events: ChuncheonEvent[]
  loading: boolean
}) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={lightColors.primary} />
      </View>
    )
  }
  if (events.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="calendar-outline" size={32} color={lightColors.ink500} />
        <Text style={styles.emptyText}>다가오는 행사가 없어요</Text>
      </View>
    )
  }
  return (
    <FlatList
      data={events}
      keyExtractor={(it) => it.id}
      contentContainerStyle={{
        padding: spacing[4],
        paddingBottom: spacing[8],
        gap: 8,
      }}
      renderItem={({ item }) => <EventCard event={item} />}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
    
      removeClippedSubviews={true}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      windowSize={11}
    />
  )
}

function EventCard({ event }: { event: ChuncheonEvent }) {
  const dateText = formatEventDate(event.event_date, event.end_date)
  const cat = EVENT_CATEGORY_LABELS[event.category] ?? event.category
  return (
    <Pressable
      onPress={() => event.link_url && Linking.openURL(event.link_url).catch(() => {})}
      style={({ pressed }) => [styles.eventCard, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.eventDot, { backgroundColor: event.color || "#10b981" }]} />
      <View style={{ flex: 1 }}>
        <View style={styles.eventHead}>
          <Text style={styles.eventCat}>{cat}</Text>
          <Text style={styles.eventDate}>{dateText}</Text>
        </View>
        <Text style={styles.eventTitle} numberOfLines={2}>
          {event.title}
        </Text>
        {!!event.description && (
          <Text style={styles.eventDesc} numberOfLines={2}>
            {event.description}
          </Text>
        )}
        {!!event.location && (
          <View style={styles.eventLoc}>
            <Ionicons name="location-outline" size={12} color={lightColors.ink500} />
            <Text style={styles.eventLocText}>{event.location}</Text>
          </View>
        )}
      </View>
      {!!event.link_url && (
        <Ionicons name="open-outline" size={16} color={lightColors.ink500} />
      )}
    </Pressable>
  )
}

function formatEventDate(start: string, end: string | null): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split("-")
    return `${Number(m)}/${Number(d)}`
  }
  if (end && end !== start) return `${fmt(start)} ~ ${fmt(end)}`
  return fmt(start)
}

// ─── 날씨 탭 ────────────────────────────────────────────
function WeatherTab({
  data,
  loading,
  onRefresh,
}: {
  data: WeatherData | null
  loading: boolean
  onRefresh: () => void
}) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={lightColors.primary} />
      </View>
    )
  }
  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={{ color: lightColors.ink500 }}>날씨 정보를 불러올 수 없습니다</Text>
        <Pressable onPress={onRefresh} style={{ marginTop: 12 }}>
          <Text style={{ color: lightColors.primary }}>다시 시도</Text>
        </Pressable>
      </View>
    )
  }
  const today = data.forecast?.[0]
  return (
    <ScrollView contentContainerStyle={{ padding: spacing[4], paddingBottom: spacing[8] }}>
      <View style={styles.weatherHead}>
        <Text style={styles.weatherLoc}>{data.location} 실시간 날씨</Text>
        <Pressable onPress={onRefresh} hitSlop={6}>
          <Ionicons name="refresh" size={16} color={lightColors.ink500} />
        </Pressable>
      </View>

      {/* 현재 */}
      <View style={styles.weatherNowCard}>
        <Text style={styles.weatherNowLabel}>지금</Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
          <Text style={styles.weatherNowTemp}>
            {data.current?.temp != null ? Math.round(data.current.temp) : "--"}
          </Text>
          <Text style={styles.weatherNowUnit}>°C</Text>
        </View>
        {!!today && (
          <Text style={styles.weatherTodayText}>
            {today.text} · 최고 {today.max ?? "--"}° / 최저 {today.min ?? "--"}°
          </Text>
        )}

        <View style={styles.weatherBadges}>
          {data.current?.humidity != null && (
            <View style={styles.weatherBadge}>
              <Ionicons name="water-outline" size={14} color="#0284c7" />
              <Text style={styles.weatherBadgeText}>
                습도 {data.current.humidity}%
              </Text>
            </View>
          )}
          {data.current?.windSpeed != null && (
            <View style={styles.weatherBadge}>
              <Ionicons name="cloudy-outline" size={14} color="#0284c7" />
              <Text style={styles.weatherBadgeText}>
                풍속 {data.current.windSpeed.toFixed(1)} m/s
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Forecast */}
      <Text style={styles.sectionTitle}>일별 예보</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {(data.forecast ?? []).map((f, idx) => {
          const dayLabels = ["일", "월", "화", "수", "목", "금", "토"]
          const day = new Date(f.date + "T00:00:00").getDay()
          const isToday = f.date === new Date().toISOString().slice(0, 10)
          return (
            <View
              key={f.date + idx}
              style={[
                styles.forecastCard,
                isToday && { borderColor: lightColors.primary },
              ]}
            >
              <Text style={styles.forecastDay}>
                {isToday ? "오늘" : dayLabels[day]}
              </Text>
              <Text style={styles.forecastDate}>{formatMonthDay(f.date)}</Text>
              <Text style={styles.forecastIcon}>{f.icon || "—"}</Text>
              <Text style={styles.forecastMaxMin}>
                {f.max != null ? Math.round(f.max) : "--"}°
                <Text style={{ color: lightColors.ink500 }}>
                  /{f.min != null ? Math.round(f.min) : "--"}°
                </Text>
              </Text>
              {f.rainProb != null && (
                <Text style={styles.forecastRain}>{f.rainProb}%</Text>
              )}
            </View>
          )
        })}
      </ScrollView>
    </ScrollView>
  )
}

function formatMonthDay(iso: string) {
  const [, m, d] = iso.split("-")
  return `${Number(m)}/${Number(d)}`
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing[4] },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: lightColors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: fontSize.lg, fontWeight: "700", color: lightColors.ink900 },
  headerSub: { fontSize: fontSize.xs, color: lightColors.ink500, marginTop: 2 },

  tabsWrap: { paddingHorizontal: spacing[4], paddingBottom: 4 },
  tabsBg: {
    flexDirection: "row",
    backgroundColor: lightColors.muted,
    padding: 4,
    borderRadius: radius.md,
    alignSelf: "flex-start",
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  tabBtnActive: {
    backgroundColor: lightColors.background,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOpacity: 0.05,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 1 },
        }
      : { elevation: 1 }),
  },
  tabText: { fontSize: fontSize.sm, fontWeight: "500" },

  // News
  regionChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
  },
  regionChipActive: {
    backgroundColor: lightColors.primary,
    borderColor: lightColors.primary,
  },
  regionChipText: { fontSize: fontSize.sm, fontWeight: "500", color: lightColors.ink900 },

  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing[3],
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: lightColors.ink900,
    paddingVertical: 0,
  },
  searchBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: lightColors.primary,
  },
  searchBtnText: { color: "#ffffff", fontWeight: "600", fontSize: fontSize.sm },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
    alignItems: "center",
    justifyContent: "center",
  },

  statusRow: { paddingTop: 4 },
  statusText: { fontSize: 11, color: lightColors.primary, fontWeight: "500" },

  newsCard: {
    flexDirection: "row",
    backgroundColor: lightColors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
    overflow: "hidden",
  },
  // 썸네일 wrap — 카드 높이만큼 stretch (alignSelf stretch + 고정 width)
  newsThumbWrap: {
    width: 110,
    alignSelf: "stretch",
    backgroundColor: lightColors.muted,
    minHeight: 110,
  },
  // Image — wrap 을 꽉 채움 (absolute 로 stretch)
  newsThumb: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  // 텍스트 영역 — 썸네일 높이만큼 stretch + 위/아래 정렬 (위에 제목·설명, 아래에 출처/시간)
  newsBody: {
    flex: 1,
    padding: spacing[3],
    justifyContent: "space-between",
  },
  newsTitle: { fontSize: fontSize.sm, fontWeight: "600", color: lightColors.ink900 },
  newsDesc: { fontSize: 12, color: lightColors.ink500, lineHeight: 16 },
  newsMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  newsPress: { fontSize: 11, color: lightColors.primary, fontWeight: "600" },
  newsDot: { fontSize: 11, color: lightColors.ink500 },
  newsTime: { fontSize: 11, color: lightColors.ink500 },

  emptyBox: { alignItems: "center", padding: spacing[6], gap: 8 },
  emptyText: { fontSize: fontSize.sm, color: lightColors.ink500 },

  moreBtn: {
    marginTop: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
    alignItems: "center",
  },
  moreBtnText: { fontSize: fontSize.sm, fontWeight: "500", color: lightColors.ink900 },

  // Events
  eventCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
  },
  eventDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  eventHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  eventCat: { fontSize: 11, fontWeight: "700", color: lightColors.primary },
  eventDate: { fontSize: 11, color: lightColors.ink500 },
  eventTitle: { fontSize: fontSize.sm, fontWeight: "600", color: lightColors.ink900 },
  eventDesc: {
    fontSize: 12,
    color: lightColors.ink500,
    marginTop: 4,
    lineHeight: 16,
  },
  eventLoc: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 4 },
  eventLocText: { fontSize: 11, color: lightColors.ink500 },

  // Weather
  weatherHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing[3],
  },
  weatherLoc: { fontSize: 12, fontWeight: "600", color: lightColors.primary },
  weatherNowCard: {
    padding: spacing[4],
    borderRadius: 16,
    backgroundColor: "rgba(2,132,199,0.08)",
    borderWidth: 1,
    borderColor: "rgba(2,132,199,0.2)",
    marginBottom: spacing[4],
  },
  weatherNowLabel: { fontSize: 11, color: lightColors.ink500, marginBottom: 4 },
  weatherNowTemp: { fontSize: 56, fontWeight: "700", color: lightColors.ink900 },
  weatherNowUnit: { fontSize: 24, color: lightColors.ink500 },
  weatherTodayText: { fontSize: 12, color: lightColors.ink500, marginTop: 4 },
  weatherBadges: {
    flexDirection: "row",
    gap: spacing[3],
    marginTop: spacing[3],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: "rgba(2,132,199,0.2)",
  },
  weatherBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  weatherBadgeText: { fontSize: 11, color: lightColors.ink900 },

  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: lightColors.ink900,
    marginBottom: spacing[2],
  },
  forecastCard: {
    minWidth: 80,
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
    alignItems: "center",
    gap: 4,
  },
  forecastDay: { fontSize: 12, fontWeight: "700", color: lightColors.ink900 },
  forecastDate: { fontSize: 11, color: lightColors.ink500 },
  forecastIcon: { fontSize: 22, marginVertical: 4 },
  forecastMaxMin: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: lightColors.ink900,
  },
  forecastRain: { fontSize: 11, color: "#0284c7" },
})
