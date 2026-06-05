/**
 * 전원일기 허브 — 앱 첫 화면 (지역 선택).
 * 웹 hub-landing.tsx '내 위치 우선' 디자인 1:1 미러.
 *
 *   - 큰 [내 위치로 찾기] 버튼 → expo-location 으로 가장 가까운 도 자동 선택
 *   - "우리 동네" 큰 카드 = 가장 최근 접속한 전원일기 (selected.plaza 영속)
 *   - 들어가기 → setSelectedPlaza + (tabs) 진입
 *   - 아래: 다른 열린 지역 그리드
 *
 * 어르신 사용성: 드롭다운 대신 큰 버튼/카드로 한 번에 입장.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { Image } from "expo-image"
import { SafeAreaView } from "react-native-safe-area-context"
import { LinearGradient } from "expo-linear-gradient"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import * as Location from "expo-location"
import { getSupabase } from "@/lib/supabase"
import { setSelectedPlaza, loadSelectedPlaza } from "@/lib/plaza"

const GREEN = "#225a39"
const GREEN_DARK = "#1b4a2f"
const CREAM = "#f7f6f0"

const LOGO = require("../assets/images/logo-farmer.jpg")
const SCENERY = require("../assets/images/gangwon-bg.jpg")

interface Plaza {
  id: string
  name: string
  parent_region: string | null
  center_lat: number | null
  center_lng: number | null
  is_active: boolean
  is_open_soon: boolean
  sort_order: number
  coverage?: string[] | null
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const lat1 = (aLat * Math.PI) / 180
  const lat2 = (bLat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export default function HubScreen() {
  const router = useRouter()
  const [plazas, setPlazas] = useState<Plaza[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [locating, setLocating] = useState(false)
  const [byLocation, setByLocation] = useState(false)
  const [featuredId, setFeaturedId] = useState<string | null>(null)
  const trimmed = query.trim()

  // 최근 접속한 전원일기 = 우리 동네 기본값
  useEffect(() => {
    loadSelectedPlaza().then((p) => setFeaturedId((cur) => cur ?? p.id))
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const supabase = getSupabase()
        const { data } = await supabase
          .from("plazas")
          .select("id, name, parent_region, center_lat, center_lng, is_active, is_open_soon, sort_order, coverage")
          .order("sort_order", { ascending: true })
        setPlazas((data ?? []) as Plaza[])
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const sorted = useMemo(
    () => [...plazas].sort((a, b) => a.sort_order - b.sort_order),
    [plazas],
  )
  const firstOpen = useMemo(() => sorted.find((p) => p.is_active) ?? sorted[0] ?? null, [sorted])

  const filtered = useMemo(() => {
    if (!trimmed) return sorted
    const q = trimmed.toLowerCase()
    return sorted.filter((p) => {
      if (p.name.toLowerCase().includes(q)) return true
      if ((p.parent_region ?? "").toLowerCase().includes(q)) return true
      if ((p.coverage ?? []).some((c) => c.toLowerCase().includes(q))) return true
      return false
    })
  }, [sorted, trimmed])

  const featured = useMemo(() => {
    if (trimmed) return filtered[0] ?? null
    return sorted.find((p) => p.id === featuredId) ?? firstOpen
  }, [trimmed, filtered, sorted, featuredId, firstOpen])

  const others = useMemo(
    () => filtered.filter((p) => p.id !== featured?.id),
    [filtered, featured],
  )
  const otherOpen = others.filter((p) => p.is_active)
  const comingSoon = others.filter((p) => !p.is_active)

  const stats = useMemo(() => {
    return { total: plazas.length, open: plazas.filter((p) => p.is_active).length }
  }, [plazas])

  const nearestPlaza = useCallback(
    (lat: number, lng: number): Plaza | null => {
      let best: Plaza | null = null
      let bestD = Infinity
      for (const p of sorted) {
        if (p.center_lat == null || p.center_lng == null) continue
        const d = distanceKm(lat, lng, p.center_lat, p.center_lng)
        if (d < bestD) { bestD = d; best = p }
      }
      return best
    },
    [sorted],
  )

  const enterPlaza = async (p: Plaza | null) => {
    if (!p || !p.is_active) return
    await setSelectedPlaza(p.id, p.name)
    router.replace("/(tabs)" as any)
  }

  const handleLocate = async () => {
    try {
      setLocating(true)
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== "granted") {
        setLocating(false)
        Alert.alert("위치 권한 필요", "위치 권한이 꺼져 있어요. 아래에서 지역을 직접 골라주세요.")
        return
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low })
      const n = nearestPlaza(pos.coords.latitude, pos.coords.longitude)
      if (n) {
        setQuery("")
        setFeaturedId(n.id)
        setByLocation(true)
      }
      setLocating(false)
    } catch {
      setLocating(false)
      Alert.alert("위치 확인 실패", "잠시 후 다시 시도하거나, 아래에서 지역을 직접 골라주세요.")
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* ─── Hero ───────────────────────────────────────────── */}
        <View style={styles.heroBgWrap} pointerEvents="none">
          <Image source={SCENERY} style={styles.heroBgImg} contentFit="cover" />
          <LinearGradient colors={["rgba(247,246,240,0.4)", CREAM]} style={StyleSheet.absoluteFill as any} />
        </View>

        <View style={styles.hero}>
          <View style={styles.brandRow}>
            <Image source={LOGO} style={styles.brandLogo} contentFit="cover" />
            <Text style={styles.brandText}>🌱 전원일기</Text>
          </View>

          <Text style={styles.h1}>어느 지역에 사세요?</Text>
          <Text style={styles.sub}>우리 동네를 고르면 농기구·로컬푸드·이웃 소식을 한 곳에서 볼 수 있어요.</Text>

          {/* 내 위치로 찾기 */}
          <Pressable style={styles.locateBtn} onPress={handleLocate} disabled={locating}>
            {locating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons name="locate" size={24} color="#fff" />
            )}
            <Text style={styles.locateText}>{locating ? "위치 찾는 중…" : "내 위치로 찾기"}</Text>
          </Pressable>

          {/* 검색 */}
          <View style={styles.search}>
            <Ionicons name="search" size={20} color="rgba(34,90,57,0.55)" />
            <TextInput
              value={query}
              onChangeText={(t) => { setQuery(t); setByLocation(false) }}
              placeholder="지역 이름으로 찾기 — 예: 강원, 강릉"
              placeholderTextColor="#9ca3af"
              style={styles.searchInput}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color="#9ca3af" />
              </Pressable>
            )}
          </View>

          <Text style={styles.statLine}>전국 {stats.total}개 지역 · 지금 {stats.open}곳 열림</Text>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 40 }}><ActivityIndicator color={GREEN} /></View>
        ) : (
          <View style={styles.body}>
            {/* ─── 우리 동네 큰 카드 ───────────────────────────── */}
            {featured ? (
              <>
                <Text style={styles.kicker}>
                  {byLocation ? "📍 가까운 지역이에요" : trimmed ? `🔍 “${trimmed}” 검색 결과` : "우리 동네"}
                </Text>
                <BigCard plaza={featured} onEnter={() => enterPlaza(featured)} />
              </>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>“{trimmed}” 에 해당하는 지역이 없어요</Text>
                <Text style={styles.emptySub}>다른 지역 이름으로 찾아보세요.</Text>
              </View>
            )}

            {/* ─── 지금 마을 (LIVE) ─────────────────────────────── */}
            {!trimmed && stats.open > 0 && (
              <View style={styles.liveBar}>
                <View style={styles.liveDot}>
                  <View style={styles.liveDotPing} />
                  <View style={styles.liveDotCore} />
                </View>
                <Text style={styles.liveLabel}>지금 마을</Text>
                <Text style={styles.liveText} numberOfLines={1}>
                  <Text style={{ fontWeight: "800" }}>{firstOpen?.name ?? "전원일기"}</Text>
                  {stats.open > 1 ? ` 외 ${stats.open - 1}곳` : ""}에서 이웃들이 활동 중
                </Text>
              </View>
            )}

            {/* ─── 다른 열린 지역 ───────────────────────────────── */}
            {otherOpen.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>다른 열린 지역</Text>
                <View style={styles.grid}>
                  {otherOpen.map((p) => (
                    <RegionTile key={p.id} plaza={p} onPress={() => enterPlaza(p)} />
                  ))}
                </View>
              </>
            )}

            {/* ─── 곧 열릴 지역 ─────────────────────────────────── */}
            {comingSoon.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: "#78716c" }]}>곧 열릴 지역</Text>
                <View style={styles.grid}>
                  {comingSoon.map((p) => (
                    <RegionTile key={p.id} plaza={p} onPress={() => {}} />
                  ))}
                </View>
              </>
            )}

            <View style={styles.footer}>
              <Text style={styles.footerText}>🌱 전원일기 — 전국의 농촌을 잇는 플랫폼</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function BigCard({ plaza, onEnter }: { plaza: Plaza; onEnter: () => void }) {
  const isOpen = plaza.is_active
  const coverage = plaza.coverage ?? []
  return (
    <View style={styles.bigCard}>
      <ImageBackground source={SCENERY} style={styles.bigCardBg} imageStyle={{ borderRadius: 24 }}>
        <LinearGradient
          colors={["rgba(34,90,57,0.35)", "rgba(31,61,42,0.72)", "rgba(23,53,36,0.94)"]}
          style={styles.bigCardOverlay}
        >
          <View style={styles.bigCardTopRow}>
            {isOpen ? (
              <View style={styles.openBadge}>
                <View style={styles.liveDot}>
                  <View style={styles.liveDotPing} />
                  <View style={styles.liveDotCore} />
                </View>
                <Text style={styles.openBadgeText}>지금 열림</Text>
              </View>
            ) : (
              <View style={styles.soonBadge}>
                <Ionicons name="lock-closed" size={11} color="#fff" />
                <Text style={styles.soonBadgeText}>오픈예정</Text>
              </View>
            )}
            {plaza.parent_region && <Text style={styles.regionText}>{plaza.parent_region}</Text>}
          </View>

          <Text style={styles.bigCardTitle}>{plaza.name}</Text>

          {coverage.length > 0 && (
            <View style={styles.chips}>
              {coverage.slice(0, 6).map((c) => (
                <View key={c} style={styles.chip}><Text style={styles.chipText}>{c}</Text></View>
              ))}
              {coverage.length > 6 && <Text style={styles.chipMore}>+{coverage.length - 6}</Text>}
            </View>
          )}

          <Pressable style={[styles.enterBtn, !isOpen && styles.enterBtnDisabled]} onPress={onEnter} disabled={!isOpen}>
            {isOpen ? (
              <>
                <Text style={styles.enterBtnText}>들어가기</Text>
                <Ionicons name="arrow-forward" size={22} color={GREEN} />
              </>
            ) : (
              <Text style={[styles.enterBtnText, { color: "#fff" }]}>오픈예정</Text>
            )}
          </Pressable>
        </LinearGradient>
      </ImageBackground>
    </View>
  )
}

function RegionTile({ plaza, onPress }: { plaza: Plaza; onPress: () => void }) {
  const isOpen = plaza.is_active
  return (
    <Pressable
      style={[styles.tile, !isOpen && styles.tileDisabled]}
      onPress={onPress}
      disabled={!isOpen}
    >
      <View style={styles.tileTop}>
        {isOpen ? <View style={styles.tileDot} /> : <Ionicons name="lock-closed" size={14} color="#a8a29e" />}
        <Text style={[styles.tileName, !isOpen && { color: "#a8a29e" }]} numberOfLines={1}>{plaza.name}</Text>
      </View>
      <Text style={[styles.tileHint, !isOpen && { color: "#a8a29e" }]}>
        {isOpen ? "눌러서 입장 →" : "오픈예정"}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CREAM },

  heroBgWrap: { position: "absolute", top: 0, left: 0, right: 0, height: 320, overflow: "hidden" },
  heroBgImg: { width: "100%", height: "100%", opacity: 0.14 },

  hero: { alignItems: "center", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  brandLogo: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: "#fff" },
  brandText: { fontSize: 16, fontWeight: "900", color: GREEN },

  h1: { fontSize: 30, fontWeight: "900", color: GREEN, textAlign: "center" },
  sub: { fontSize: 16, color: "#57534e", textAlign: "center", marginTop: 8, lineHeight: 23, fontWeight: "500" },

  locateBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: GREEN, borderRadius: 18, paddingVertical: 18, paddingHorizontal: 28,
    marginTop: 22, width: "100%",
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  locateText: { color: "#fff", fontSize: 21, fontWeight: "900" },

  search: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#fff", borderRadius: 16, borderWidth: 2, borderColor: "rgba(34,90,57,0.2)",
    paddingHorizontal: 16, paddingVertical: 4, marginTop: 12, width: "100%",
  },
  searchInput: { flex: 1, fontSize: 17, paddingVertical: 13, color: "#1c1917" },

  statLine: { fontSize: 14, color: "#78716c", fontWeight: "600", marginTop: 14 },

  body: { paddingHorizontal: 16, paddingTop: 8 },

  kicker: { fontSize: 15, fontWeight: "800", color: "#57534e", marginBottom: 8 },

  bigCard: { borderRadius: 24, overflow: "hidden", minHeight: 230 },
  bigCardBg: { width: "100%", minHeight: 230, justifyContent: "flex-end" },
  bigCardOverlay: { padding: 22, borderRadius: 24, justifyContent: "flex-end", minHeight: 230 },
  bigCardTopRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  openBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(16,185,129,0.25)", borderWidth: 1, borderColor: "rgba(110,231,183,0.5)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  openBadgeText: { color: "#ecfdf5", fontSize: 12, fontWeight: "800" },
  soonBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  soonBadgeText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  regionText: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: "700" },

  bigCardTitle: { color: "#fff", fontSize: 32, fontWeight: "900", marginBottom: 10, textShadowColor: "rgba(0,0,0,0.35)", textShadowRadius: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 18 },
  chip: { backgroundColor: "rgba(255,255,255,0.22)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  chipMore: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "600", alignSelf: "center" },

  enterBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#fff", borderRadius: 16, paddingVertical: 16,
  },
  enterBtnDisabled: { backgroundColor: "rgba(255,255,255,0.18)" },
  enterBtnText: { color: GREEN, fontSize: 21, fontWeight: "900" },

  liveBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#1f3d2a", borderRadius: 999, paddingHorizontal: 18, paddingVertical: 14, marginTop: 14,
  },
  liveDot: { width: 8, height: 8, alignItems: "center", justifyContent: "center" },
  liveDotPing: { position: "absolute", width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(52,211,153,0.6)" },
  liveDotCore: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#34d399" },
  liveLabel: { color: "#fff", fontSize: 14, fontWeight: "800" },
  liveText: { color: "rgba(255,255,255,0.9)", fontSize: 14, flex: 1 },

  sectionTitle: { fontSize: 21, fontWeight: "900", color: GREEN, marginTop: 26, marginBottom: 12 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    width: "47.5%", flexGrow: 1, backgroundColor: "#fff", borderRadius: 16, borderWidth: 2, borderColor: "rgba(34,90,57,0.15)",
    paddingHorizontal: 14, paddingVertical: 14,
  },
  tileDisabled: { backgroundColor: "#fafaf9", borderColor: "#e7e5e4" },
  tileTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },
  tileDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#2f7d4f" },
  tileName: { fontSize: 18, fontWeight: "900", color: "#1c1917", flexShrink: 1 },
  tileHint: { fontSize: 14, fontWeight: "700", color: GREEN },

  empty: { backgroundColor: "rgba(255,255,255,0.6)", borderWidth: 2, borderColor: "rgba(34,90,57,0.2)", borderStyle: "dashed", borderRadius: 20, padding: 36, alignItems: "center" },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: "#44403c" },
  emptySub: { fontSize: 14, color: "#78716c", marginTop: 4 },

  footer: { paddingTop: 28, marginTop: 24, borderTopWidth: 1, borderTopColor: "rgba(34,90,57,0.15)", alignItems: "center" },
  footerText: { fontSize: 14, fontWeight: "700", color: GREEN },
})
