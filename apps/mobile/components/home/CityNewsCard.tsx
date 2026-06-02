/**
 * CityNewsCard — 지역 뉴스 / 날씨 / 관광 달력 카드.
 * Extracted from apps/mobile/app/(tabs)/index.tsx.
 */
import { memo, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { Image } from "expo-image"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, spacing } from "@gwangjang/tokens"
import {
  getWeather,
  listNews,
  type ChuncheonEvent,
  type NewsItem,
  type WeatherData,
} from "@gwangjang/features/home"
import { gwangjangFetch } from "@/lib/supabase"
import {
  REGION_NEWS_CACHE,
  REGION_NEWS_INFLIGHT,
  REGION_WEATHER_CACHE,
  REGION_WEATHER_INFLIGHT,
} from "./constants"
import { timeAgo } from "./formatters"
import { EventsCalendar } from "./EventsCalendar"

const CityTab = memo(function CityTab({
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
      style={[cityNewsStyles.tab, active && cityNewsStyles.tabActive]}
    >
      <Ionicons
        name={icon}
        size={14}
        color={active ? "#ffffff" : lightColors.ink900}
      />
      <Text
        style={[
          cityNewsStyles.tabText,
          active && { color: "#ffffff", fontWeight: "700" },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
})

export const CityNewsCard = memo(function CityNewsCard({
  cityName,
  news,
  events,
  weather,
  coverage,
  onOpenNews,
  onRefresh,
}: {
  cityName: string
  news: NewsItem[]
  events: ChuncheonEvent[]
  weather: WeatherData | null
  coverage: string[]
  onOpenNews: () => void
  onRefresh: () => void
}) {
  const [tab, setTab] = useState<"news" | "weather" | "events">("news")
  const [region, setRegion] = useState<string>("전체")
  const [weatherRegion, setWeatherRegion] = useState<string>("전체")
  const [weatherOverride, setWeatherOverride] = useState<WeatherData | null>(null)
  const [newsOverride, setNewsOverride] = useState<NewsItem[] | null>(null)
  const [newsLoading, setNewsLoading] = useState(false)
  const [localRefreshKey, setLocalRefreshKey] = useState(0)

  const regions = ["전체", ...coverage]

  // 지역별 뉴스 캐시 — module-scope 라 탭 전환/언마운트 후에도 유지.
  const regionCacheRef = useRef<Record<string, NewsItem[]>>(REGION_NEWS_CACHE)

  // 뉴스 탭 — 지역 변경 OR 새로고침 시 서버 재조회 (web 1:1)
  useEffect(() => {
    if (region === "전체") {
      setNewsOverride(null)
      if (localRefreshKey > 0) onRefresh()
      return
    }
    const cached = regionCacheRef.current[region]
    if (cached) {
      setNewsOverride(cached)
      setNewsLoading(false)
    } else {
      setNewsLoading(true)
    }
    let cancelled = false
    ;(async () => {
      try {
        const inflight = REGION_NEWS_INFLIGHT[region]
        let items: NewsItem[]
        if (inflight) {
          items = await inflight
        } else {
          const r = await listNews(
            (u, init) => gwangjangFetch(u, init as any),
            { q: "", region, page: 1, refreshKey: localRefreshKey },
          )
          items = r.news.filter((it: any) => !!it.thumbnail && String(it.thumbnail).trim().length > 0 && !/pressian/i.test(String(it.url ?? "")) && !/프레시안/.test(String(it.press ?? ""))).slice(0, 5)
          regionCacheRef.current[region] = items
        }
        if (cancelled) return
        setNewsOverride(items)
      } catch {
        if (!cancelled && !cached) setNewsOverride([])
      } finally {
        if (!cancelled) setNewsLoading(false)
      }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, localRefreshKey])

  // 백그라운드 prefetch — 모든 coverage 지역을 병렬로 받아 캐시.
  useEffect(() => {
    if (coverage.length === 0) return
    coverage.forEach((r) => {
      if (regionCacheRef.current[r]) return
      if (REGION_NEWS_INFLIGHT[r]) return
      REGION_NEWS_INFLIGHT[r] = (async () => {
        try {
          const res = await listNews(
            (u, init) => gwangjangFetch(u, init as any),
            { q: "", region: r, page: 1 },
          )
          const items = res.news.filter((it: any) => !!it.thumbnail && String(it.thumbnail).trim().length > 0 && !/pressian/i.test(String(it.url ?? "")) && !/프레시안/.test(String(it.press ?? ""))).slice(0, 5)
          regionCacheRef.current[r] = items
          return items
        } catch {
          return []
        } finally {
          REGION_NEWS_INFLIGHT[r] = undefined
        }
      })()
    })
  }, [coverage])

  function handleRefresh() {
    setLocalRefreshKey((k) => k + 1)
  }

  const activeNews = newsOverride ?? news
  const filteredNews = activeNews.filter(
    (n) => !!(n as any).thumbnail && String((n as any).thumbnail).trim().length > 0,
  )

  // 날씨 탭 — 지역 변경 시 해당 지역 날씨 재조회
  useEffect(() => {
    if (weatherRegion === "전체") {
      setWeatherOverride(null)
      return
    }
    const cached = REGION_WEATHER_CACHE[weatherRegion]
    if (cached) setWeatherOverride(cached)
    let cancelled = false
    ;(async () => {
      try {
        const inflight = REGION_WEATHER_INFLIGHT[weatherRegion]
        let w: WeatherData | null
        if (inflight) {
          w = await inflight
        } else {
          w = await getWeather(
            (u, init) => gwangjangFetch(u, init as any),
            { region: weatherRegion },
          )
          if (w) REGION_WEATHER_CACHE[weatherRegion] = w
        }
        if (!cancelled && w) setWeatherOverride(w)
      } catch {}
    })()
    return () => { cancelled = true }
  }, [weatherRegion])

  // 백그라운드 prefetch — 모든 coverage 지역 날씨 미리 받기
  useEffect(() => {
    if (coverage.length === 0) return
    coverage.forEach((r) => {
      if (REGION_WEATHER_CACHE[r]) return
      if (REGION_WEATHER_INFLIGHT[r]) return
      REGION_WEATHER_INFLIGHT[r] = (async () => {
        try {
          const w = await getWeather(
            (u, init) => gwangjangFetch(u, init as any),
            { region: r },
          )
          if (w) REGION_WEATHER_CACHE[r] = w
          return w
        } catch {
          return null
        } finally {
          REGION_WEATHER_INFLIGHT[r] = undefined
        }
      })()
    })
  }, [coverage])

  const activeWeather = weatherOverride ?? weather

  return (
    <View style={cityNewsStyles.card}>
      {/* 탭 */}
      <View style={cityNewsStyles.tabRow}>
        <CityTab
          icon="newspaper-outline"
          label="지역 뉴스"
          active={tab === "news"}
          onPress={() => setTab("news")}
        />
        <CityTab
          icon="partly-sunny-outline"
          label="날씨"
          active={tab === "weather"}
          onPress={() => setTab("weather")}
        />
        <CityTab
          icon="calendar-outline"
          label="관광 달력"
          active={tab === "events"}
          onPress={() => setTab("events")}
        />
      </View>

      {/* 컨텐츠 */}
      {tab === "news" && (
        <View>
          {regions.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={cityNewsStyles.regionRow}
            >
              {regions.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setRegion(r)}
                  style={[
                    cityNewsStyles.regionChip,
                    region === r && cityNewsStyles.regionChipActive,
                  ]}
                >
                  <Text
                    style={[
                      cityNewsStyles.regionChipText,
                      region === r && { color: "#ffffff", fontWeight: "700" },
                    ]}
                  >
                    {r}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <View style={cityNewsStyles.subHead}>
            <View style={cityNewsStyles.subHeadLeft}>
              <View style={cityNewsStyles.bullet} />
              <Text style={cityNewsStyles.subHeadText}>
                {region === "전체" ? cityName : region} 지역 뉴스
              </Text>
            </View>
            <Pressable
              hitSlop={8}
              onPress={handleRefresh}
              style={cityNewsStyles.refreshBtn}
            >
              <Ionicons
                name="refresh"
                size={16}
                color={newsLoading ? lightColors.primary : lightColors.ink900}
              />
            </Pressable>
          </View>

          {newsLoading ? (
            <View style={{ paddingVertical: 24, alignItems: "center" }}>
              <ActivityIndicator size="small" color={lightColors.primary} />
            </View>
          ) : filteredNews.length === 0 ? (
            <Text style={cityNewsStyles.emptyText}>최신 뉴스가 없습니다</Text>
          ) : (
            <View style={{ gap: 12 }}>
              {filteredNews.slice(0, 5).map((n) => (
                <Pressable
                  key={n.id}
                  style={cityNewsStyles.newsCard}
                  onPress={() => {
                    if (n.url) Linking.openURL(n.url).catch(() => {})
                  }}
                >
                  {n.thumbnail ? (
                    <Image
                      source={{ uri: n.thumbnail }}
                      style={cityNewsStyles.newsImg}
                      cachePolicy="memory-disk"
                      transition={150}
                      contentFit="cover"
                    />
                  ) : null}
                  <View style={{ padding: 12 }}>
                    <Text style={cityNewsStyles.newsTitle} numberOfLines={2}>
                      {n.title}
                    </Text>
                    {!!n.description && (
                      <Text style={cityNewsStyles.newsSummary} numberOfLines={2}>
                        {n.description}
                      </Text>
                    )}
                    <View style={cityNewsStyles.newsMeta}>
                      <Text style={cityNewsStyles.newsSource}>{n.press ?? ""}</Text>
                      {n.publishedAt && (
                        <>
                          <Text style={cityNewsStyles.newsDot}>·</Text>
                          <Ionicons
                            name="time-outline"
                            size={11}
                            color={lightColors.ink500}
                          />
                          <Text style={cityNewsStyles.newsTime}>
                            {timeAgo(n.publishedAt)}
                          </Text>
                        </>
                      )}
                    </View>
                  </View>
                </Pressable>
              ))}
              <Pressable
                onPress={onOpenNews}
                style={cityNewsStyles.viewAllNewsBtn}
              >
                <Text style={cityNewsStyles.viewAllNewsText}>
                  전체 {region === "전체" ? cityName : region} 소식 보기
                </Text>
                <Ionicons name="chevron-forward" size={14} color={lightColors.ink900} />
              </Pressable>
            </View>
          )}
        </View>
      )}

      {tab === "weather" && (
        <View>
          {regions.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={cityNewsStyles.regionRow}
            >
              {regions.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setWeatherRegion(r)}
                  style={[
                    cityNewsStyles.regionChip,
                    weatherRegion === r && cityNewsStyles.regionChipActive,
                  ]}
                >
                  <Text
                    style={[
                      cityNewsStyles.regionChipText,
                      weatherRegion === r && { color: "#ffffff", fontWeight: "700" },
                    ]}
                  >
                    {r}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {!activeWeather ? (
            <Text style={cityNewsStyles.emptyText}>날씨 정보를 불러오는 중...</Text>
          ) : (
            <View style={{ gap: 14 }}>
              <View style={cityNewsStyles.weatherNowCard}>
                <View style={{ flex: 1 }}>
                  <Text style={cityNewsStyles.weatherNowLabel}>지금</Text>
                  <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                    <Text style={cityNewsStyles.weatherNowTemp} numberOfLines={1}>
                      {activeWeather.current?.temp != null ? `${Math.round(activeWeather.current.temp)}` : "-"}
                    </Text>
                    <Text style={cityNewsStyles.weatherNowDeg}>°C</Text>
                  </View>
                  <Text style={cityNewsStyles.weatherNowMeta}>
                    {activeWeather.forecast?.[0]?.text ?? "-"} · 최고 {activeWeather.forecast?.[0]?.max ?? "--"}° / 최저 {activeWeather.forecast?.[0]?.min ?? "--"}°
                  </Text>
                  <View style={cityNewsStyles.weatherNowBadgeRow}>
                    {activeWeather.current?.humidity != null && (
                      <Text style={cityNewsStyles.weatherNowBadge}>
                        💧 습도 {activeWeather.current.humidity}%
                      </Text>
                    )}
                    {activeWeather.current?.windSpeed != null && (
                      <Text style={cityNewsStyles.weatherNowBadge}>
                        🌬 풍속 {activeWeather.current.windSpeed}m/s
                      </Text>
                    )}
                  </View>
                </View>
                <Text style={{ fontSize: 56 }}>
                  {activeWeather.forecast?.[0]?.icon ?? "☀️"}
                </Text>
              </View>

              {!!activeWeather.hourly?.length && (
                <View>
                  <Text style={cityNewsStyles.weatherSectionTitle}>시간별 예보</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8 }}
                  >
                    {activeWeather.hourly!.slice(0, 12).map((h, i) => (
                      <View key={i} style={cityNewsStyles.hourlyItem}>
                        <Text style={cityNewsStyles.hourlyTime}>
                          {i === 0 ? "지금" : `${h.hour}시`}
                        </Text>
                        <Text style={{ fontSize: 22 }}>{h.icon}</Text>
                        <Text style={cityNewsStyles.hourlyTemp}>
                          {h.temp != null ? `${Math.round(h.temp)}°` : "-"}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}

              {!!activeWeather.forecast?.length && (
                <View>
                  <Text style={cityNewsStyles.weatherSectionTitle}>5일 예보</Text>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {activeWeather.forecast.slice(0, 5).map((d, i) => {
                      const dateObj = d.date ? new Date(d.date) : null
                      const dayLabel = i === 0
                        ? "오늘"
                        : ["일","월","화","수","목","금","토"][dateObj?.getDay() ?? 0]
                      return (
                        <View
                          key={i}
                          style={[
                            cityNewsStyles.dailyItem,
                            i === 0 && cityNewsStyles.dailyItemToday,
                          ]}
                        >
                          <Text style={cityNewsStyles.dailyDay}>{dayLabel}</Text>
                          <Text style={cityNewsStyles.dailyDate}>
                            {dateObj ? `${dateObj.getMonth() + 1}/${dateObj.getDate()}` : ""}
                          </Text>
                          <Text style={{ fontSize: 24 }}>{d.icon}</Text>
                          <Text style={cityNewsStyles.dailyText}>{d.text}</Text>
                          {d.rainProb != null && d.rainProb > 0 && (
                            <Text style={cityNewsStyles.dailyRain}>💧 {d.rainProb}%</Text>
                          )}
                          <Text style={cityNewsStyles.dailyMax}>
                            {d.max != null ? `${d.max}°` : "-"}
                          </Text>
                          <Text style={cityNewsStyles.dailyMin}>
                            {d.min != null ? `${d.min}°` : "-"}
                          </Text>
                        </View>
                      )
                    })}
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {tab === "events" && <EventsCalendar events={events} />}
    </View>
  )
})

export const cityNewsStyles = StyleSheet.create({
  card: {
    marginHorizontal: spacing[4],
    marginTop: spacing[5],
    marginBottom: spacing[3],
    paddingVertical: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  headerIcon: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: "rgba(59,130,246,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 16, fontWeight: "800", color: lightColors.ink900 },
  headerSub: { fontSize: 11, color: lightColors.ink500, marginTop: 1 },
  tabRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
  },
  tab: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: lightColors.border,
    backgroundColor: "#ffffff",
  },
  tabActive: {
    backgroundColor: "#1f2937",
    borderColor: "#1f2937",
  },
  tabText: { fontSize: 12, fontWeight: "500", color: lightColors.ink900 },
  regionRow: { gap: 6, marginBottom: 12 },
  regionChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    borderWidth: 1, borderColor: lightColors.border,
    backgroundColor: "#ffffff",
  },
  regionChipActive: {
    backgroundColor: lightColors.primary,
    borderColor: lightColors.primary,
  },
  regionChipText: { fontSize: 12, color: lightColors.ink900, fontWeight: "500" },
  subHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 10,
  },
  subHeadLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  bullet: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: lightColors.primary,
  },
  subHeadText: { fontSize: 13, fontWeight: "600", color: lightColors.ink900 },
  emptyText: {
    fontSize: 13, color: lightColors.ink500,
    textAlign: "center", paddingVertical: 24,
  },
  newsCard: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: "#ffffff",
  },
  newsImg: { width: "100%", height: 220 },
  newsTitle: {
    fontSize: 14, fontWeight: "700", color: lightColors.ink900,
    lineHeight: 19,
  },
  newsSummary: {
    fontSize: 12, color: lightColors.ink500,
    marginTop: 4, lineHeight: 17,
  },
  newsMeta: {
    flexDirection: "row", alignItems: "center", gap: 4,
    marginTop: 8,
  },
  newsSource: { fontSize: 11, color: lightColors.ink500 },
  newsDot: { fontSize: 11, color: lightColors.ink500 },
  newsTime: { fontSize: 11, color: lightColors.ink500 },
  refreshBtn: {
    width: 30, height: 30, borderRadius: 999,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: lightColors.border,
    backgroundColor: "#ffffff",
  },
  viewAllNewsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 12,
    marginTop: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: "#ffffff",
  },
  viewAllNewsText: {
    fontSize: 13,
    fontWeight: "600",
    color: lightColors.ink900,
  },
  weatherCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "rgba(245,158,11,0.06)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.2)",
  },
  weatherTemp: { fontSize: 36, fontWeight: "800", color: lightColors.ink900 },
  weatherLoc: { fontSize: 12, color: lightColors.ink500, marginTop: 2 },
  forecastItem: {
    paddingHorizontal: 10, paddingVertical: 8, alignItems: "center",
  },
  forecastDay: { fontSize: 11, color: lightColors.ink500 },
  forecastTemp: { fontSize: 11, fontWeight: "600", color: lightColors.ink900, marginTop: 2 },
  weatherNowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  weatherNowLabel: {
    fontSize: 12,
    color: lightColors.ink500,
    marginBottom: 2,
  },
  weatherNowTemp: {
    fontSize: 48,
    fontWeight: "800",
    color: lightColors.ink900,
    lineHeight: 52,
  },
  weatherNowDeg: {
    fontSize: 16,
    fontWeight: "700",
    color: lightColors.ink500,
    marginLeft: 2,
  },
  weatherNowMeta: {
    fontSize: 12,
    color: lightColors.ink500,
    marginTop: 4,
  },
  weatherNowBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  weatherNowBadge: {
    fontSize: 11,
    color: lightColors.ink700,
    backgroundColor: "rgba(255,255,255,0.7)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: "hidden",
  },
  weatherSectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: lightColors.ink900,
    marginBottom: 8,
  },
  hourlyItem: {
    width: 56,
    paddingVertical: 10,
    alignItems: "center",
    gap: 4,
    borderRadius: 10,
    backgroundColor: lightColors.muted,
  },
  hourlyTime: { fontSize: 11, color: lightColors.ink500 },
  hourlyTemp: { fontSize: 13, fontWeight: "700", color: lightColors.ink900 },
  dailyItem: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: "center",
    gap: 2,
    borderRadius: 10,
    backgroundColor: lightColors.muted,
  },
  dailyItemToday: {
    backgroundColor: "#dbeafe",
    borderWidth: 1,
    borderColor: "#93c5fd",
  },
  dailyDay: { fontSize: 11, fontWeight: "700", color: lightColors.ink900 },
  dailyDate: { fontSize: 10, color: lightColors.ink500 },
  dailyText: { fontSize: 10, color: lightColors.ink500 },
  dailyRain: { fontSize: 10, color: "#2563eb", fontWeight: "600" },
  dailyMax: { fontSize: 12, fontWeight: "700", color: "#dc2626" },
  dailyMin: { fontSize: 12, fontWeight: "700", color: "#2563eb" },
  eventItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 12, borderRadius: 12,
    borderWidth: 1, borderColor: lightColors.border,
    backgroundColor: "#ffffff",
  },
  eventDate: {
    width: 48, alignItems: "center",
    paddingVertical: 6, borderRadius: 8,
    backgroundColor: "rgba(168,85,247,0.1)",
  },
  eventDay: { fontSize: 18, fontWeight: "800", color: "#7e22ce" },
  eventMonth: { fontSize: 10, color: "#7e22ce" },
  eventTitle: { fontSize: 13, fontWeight: "600", color: lightColors.ink900 },
  eventLoc: { fontSize: 11, color: lightColors.ink500, marginTop: 2 },
})
