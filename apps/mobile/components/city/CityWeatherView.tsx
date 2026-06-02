/**
 * CityWeatherView — 날씨 카드 (지금/시간별/5일 예보) — web city-news-card 1:1.
 * 홈 탭 / /news 페이지 공용.
 */

import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { lightColors } from "@gwangjang/tokens"
import {
  getWeather,
  type WeatherData,
} from "@gwangjang/features/home"
import { gwangjangFetch } from "@/lib/supabase"

interface Props {
  /** 기본 weather (전체 — 상위에서 fetch) */
  weather: WeatherData | null
  /** 광장 coverage (지역 chips) */
  coverage: string[]
  /** 도시 이름 (location label fallback) */
  cityName?: string
}

export function CityWeatherView({ weather, coverage, cityName }: Props) {
  const [region, setRegion] = useState<string>("전체")
  const [override, setOverride] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(false)

  const regions = ["전체", ...coverage]

  // 지역 변경 → 재조회
  useEffect(() => {
    if (region === "전체") {
      setOverride(null)
      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const w = await getWeather(
          (u, init) => gwangjangFetch(u, init as any),
          { region },
        )
        if (!cancelled) setOverride(w)
      } catch {}
      finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [region])

  const active = override ?? weather

  return (
    <View style={{ gap: 14 }}>
      {/* 지역 chips */}
      {regions.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.regionRow}
        >
          {regions.map((r) => (
            <Pressable
              key={r}
              onPress={() => setRegion(r)}
              style={[s.regionChip, region === r && s.regionChipActive]}
            >
              <Text
                style={[
                  s.regionChipText,
                  region === r && { color: "#ffffff", fontWeight: "700" },
                ]}
              >
                {r}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={lightColors.primary} />
        </View>
      ) : !active ? (
        <Text style={s.empty}>날씨 정보를 불러오는 중...</Text>
      ) : (
        <>
          {/* 현재 날씨 카드 */}
          <View style={s.nowCard}>
            <View style={{ flex: 1 }}>
              <Text style={s.nowLabel}>지금</Text>
              <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                <Text style={s.nowTemp} numberOfLines={1}>
                  {active.current?.temp != null ? `${Math.round(active.current.temp)}` : "-"}
                </Text>
                <Text style={s.nowDeg}>°C</Text>
              </View>
              <Text style={s.nowMeta}>
                {active.forecast?.[0]?.text ?? "-"} · 최고 {active.forecast?.[0]?.max ?? "--"}° / 최저 {active.forecast?.[0]?.min ?? "--"}°
              </Text>
              <View style={s.badgeRow}>
                {active.current?.humidity != null && (
                  <Text style={s.badge}>💧 습도 {active.current.humidity}%</Text>
                )}
                {active.current?.windSpeed != null && (
                  <Text style={s.badge}>🌬 풍속 {active.current.windSpeed}m/s</Text>
                )}
              </View>
            </View>
            <Text style={{ fontSize: 56 }}>
              {active.forecast?.[0]?.icon ?? "☀️"}
            </Text>
          </View>

          {/* 시간별 예보 */}
          {!!active.hourly?.length && (
            <View>
              <Text style={s.sectionTitle}>시간별 예보</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                {active.hourly.slice(0, 12).map((h, i) => (
                  <View key={i} style={s.hourlyItem}>
                    <Text style={s.hourlyTime}>{i === 0 ? "지금" : `${h.hour}시`}</Text>
                    <Text style={{ fontSize: 22 }}>{h.icon}</Text>
                    <Text style={s.hourlyTemp}>
                      {h.temp != null ? `${Math.round(h.temp)}°` : "-"}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* 5일 예보 */}
          {!!active.forecast?.length && (
            <View>
              <Text style={s.sectionTitle}>5일 예보</Text>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {active.forecast.slice(0, 5).map((d, i) => {
                  const dateObj = d.date ? new Date(d.date) : null
                  const dayLabel = i === 0
                    ? "오늘"
                    : ["일","월","화","수","목","금","토"][dateObj?.getDay() ?? 0]
                  return (
                    <View
                      key={i}
                      style={[s.dailyItem, i === 0 && s.dailyItemToday]}
                    >
                      <Text style={s.dailyDay}>{dayLabel}</Text>
                      <Text style={s.dailyDate}>
                        {dateObj ? `${dateObj.getMonth() + 1}/${dateObj.getDate()}` : ""}
                      </Text>
                      <Text style={{ fontSize: 24 }}>{d.icon}</Text>
                      <Text style={s.dailyText}>{d.text}</Text>
                      {d.rainProb != null && d.rainProb > 0 && (
                        <Text style={s.dailyRain}>💧 {d.rainProb}%</Text>
                      )}
                      <Text style={s.dailyMax}>{d.max != null ? `${d.max}°` : "-"}</Text>
                      <Text style={s.dailyMin}>{d.min != null ? `${d.min}°` : "-"}</Text>
                    </View>
                  )
                })}
              </View>
            </View>
          )}
        </>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  regionRow: { gap: 6 },
  regionChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    borderWidth: 1, borderColor: lightColors.border,
    backgroundColor: "#ffffff",
  },
  regionChipActive: {
    backgroundColor: lightColors.primary, borderColor: lightColors.primary,
  },
  regionChipText: { fontSize: 12, color: lightColors.ink900, fontWeight: "500" },

  center: { paddingVertical: 40, alignItems: "center" },
  empty: { textAlign: "center", color: lightColors.ink500, paddingVertical: 40, fontSize: 13 },

  nowCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 16, borderRadius: 14,
    backgroundColor: "#eff6ff",
    borderWidth: 1, borderColor: "#bfdbfe",
  },
  nowLabel: { fontSize: 12, color: lightColors.ink500, marginBottom: 2 },
  nowTemp: { fontSize: 48, fontWeight: "800", color: lightColors.ink900, lineHeight: 52 },
  nowDeg: { fontSize: 16, fontWeight: "700", color: lightColors.ink500, marginLeft: 2 },
  nowMeta: { fontSize: 12, color: lightColors.ink500, marginTop: 4 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  badge: {
    fontSize: 11, color: lightColors.ink700,
    backgroundColor: "rgba(255,255,255,0.7)",
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999, overflow: "hidden",
  },

  sectionTitle: {
    fontSize: 13, fontWeight: "700", color: lightColors.ink900, marginBottom: 8,
  },
  hourlyItem: {
    width: 56, paddingVertical: 10,
    alignItems: "center", gap: 4,
    borderRadius: 10, backgroundColor: lightColors.muted,
  },
  hourlyTime: { fontSize: 11, color: lightColors.ink500 },
  hourlyTemp: { fontSize: 13, fontWeight: "700", color: lightColors.ink900 },

  dailyItem: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 4,
    alignItems: "center", gap: 2,
    borderRadius: 10, backgroundColor: lightColors.muted,
  },
  dailyItemToday: {
    backgroundColor: "#dbeafe",
    borderWidth: 1, borderColor: "#93c5fd",
  },
  dailyDay: { fontSize: 11, fontWeight: "700", color: lightColors.ink900 },
  dailyDate: { fontSize: 10, color: lightColors.ink500 },
  dailyText: { fontSize: 10, color: lightColors.ink500 },
  dailyRain: { fontSize: 10, color: "#2563eb", fontWeight: "600" },
  dailyMax: { fontSize: 12, fontWeight: "700", color: "#dc2626" },
  dailyMin: { fontSize: 12, fontWeight: "700", color: "#2563eb" },
})
