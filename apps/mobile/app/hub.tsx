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
import { setSelectedPlaza, loadSelectedPlaza, provinceName, provinceColors, provincePhoto } from "@/lib/plaza"

const GREEN = "#225a39"
const GREEN_DARK = "#1b4a2f"
const CREAM = "#f7f6f0"

const LOGO = require("../assets/images/logo-farmer.png")
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
  // 통계 (목업 카드의 "142명 · 8개 글 · 18개 동네")
  member_count?: number
  posts_today?: number
  recent_post_title?: string | null
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

function getKickerLabel(byLocation: boolean, trimmed: string, hasVisited: boolean): string {
  if (byLocation) return '📍 가까운 지역이에요'
  if (trimmed) return '🔍 ' + trimmed + ' 검색 결과'
  return hasVisited ? '최근 동네' : '추천 동네'
}

export default function HubScreen() {
  const router = useRouter()
  const [plazas, setPlazas] = useState<Plaza[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [locating, setLocating] = useState(false)
  const [byLocation, setByLocation] = useState(false)
  const [featuredId, setFeaturedId] = useState<string | null>(null)
  const [hasVisited, setHasVisited] = useState(false)
  const trimmed = query.trim()

  // 최근 접속한 전원일기 = 기본값. AsyncStorage에 저장돼있으면 "최근 동네", 없으면 "추천 동네"
  useEffect(() => {
    ;(async () => {
      try {
        const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default
        const saved = await AsyncStorage.getItem("selected.plaza")
        if (saved && saved.length > 0) {
          setHasVisited(true)
          setFeaturedId((cur) => cur ?? saved)
        }
      } catch {}
      // fallback
      loadSelectedPlaza().then((p) => setFeaturedId((cur) => cur ?? p.id))
    })()
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const supabase = getSupabase()
        const { data } = await supabase
          .from("plazas")
          .select("id, name, parent_region, center_lat, center_lng, is_active, is_open_soon, sort_order, coverage")
          .order("sort_order", { ascending: true })
        const base = (data ?? []) as Plaza[]

        // 통계 fetch — 회원수·오늘 글수·최근글 (웹과 동일 로직)
        const memberMap = new Map<string, number>()
        const postCountMap = new Map<string, number>()
        const snippetMap = new Map<string, string>()
        try {
          const { data: members } = await (supabase.from("plaza_profiles") as any)
            .select("plaza_id")
            .eq("is_active", true)
          for (const r of (members as any[]) ?? []) {
            memberMap.set(r.plaza_id, (memberMap.get(r.plaza_id) ?? 0) + 1)
          }
        } catch {}
        try {
          const openIds = base.filter((p) => p.is_active).map((p) => p.id)
          if (openIds.length > 0) {
            const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
            const { data: posts } = await (supabase.from("board_posts") as any)
              .select("title, plaza_id, created_at")
              .in("plaza_id", openIds)
              .eq("status", "published")
              .gte("created_at", sinceIso)
              .order("created_at", { ascending: false })
              .limit(60)
            for (const p of (posts as any[]) ?? []) {
              postCountMap.set(p.plaza_id, (postCountMap.get(p.plaza_id) ?? 0) + 1)
              if (!snippetMap.has(p.plaza_id)) snippetMap.set(p.plaza_id, p.title)
            }
          }
        } catch {}

        const enriched = base.map((p) => ({
          ...p,
          member_count: memberMap.get(p.id) ?? 0,
          posts_today: postCountMap.get(p.id) ?? 0,
          recent_post_title: snippetMap.get(p.id) ?? null,
        }))
        setPlazas(enriched)
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
      if (provinceName(p.id, p.name).toLowerCase().includes(q)) return true
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
      setLocating(false)
      if (n && n.is_active) {
        // 바로 입장 — 고르는 단계 없이
        await setSelectedPlaza(n.id, n.name)
        router.replace("/(tabs)" as any)
      } else if (n) {
        setQuery("")
        setFeaturedId(n.id)
        setByLocation(true)
      }
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
          </View>

          <Text style={styles.h1}>어디에 사세요?</Text>
          <Text style={styles.sub}>사는 곳을 고르면 농기구·로컬푸드·이웃 소식을 한곳에서 볼 수 있어요.</Text>

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
              placeholder="지역 이름으로 찾기 — 예: 강원도, 강릉"
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
            {/* ─── LIVE 칩 바 (목업 상단) ────────────────────── */}
            {!trimmed && stats.open > 0 && (
              <View style={styles.liveChip}>
                <View style={styles.liveDot}>
                  <View style={styles.liveDotPing} />
                  <View style={styles.liveDotCore} />
                </View>
                <Text style={styles.liveChipText} numberOfLines={1}>
                  지금 <Text style={styles.liveChipBold}>{stats.open}</Text>곳 마을에서 이웃들이 모이고 있어요
                </Text>
              </View>
            )}

            {/* ─── 우리 동네 큰 카드 ───────────────────────────── */}
            {featured ? (
              <>
                <View style={styles.kickerRow}>
                  <View style={styles.kickerBar} />
                  <Text style={styles.kicker}>
                    {getKickerLabel(byLocation, trimmed, hasVisited)}
                  </Text>
                </View>
                <BigCard plaza={featured} onEnter={() => enterPlaza(featured)} />
              </>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>“{trimmed}” 에 해당하는 지역이 없어요</Text>
                <Text style={styles.emptySub}>다른 지역 이름으로 찾아보세요.</Text>
              </View>
            )}

            {/* ─── 열린 마을 둘러보기 (가로 슬라이드) ───────────── */}
            {otherOpen.length > 0 && (
              <>
                <View style={styles.browseHeader}>
                  <Text style={styles.sectionTitle}>열린 마을 둘러보기</Text>
                  <Text style={styles.browseAll}>전체 {stats.open}곳 →</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.hScroll}
                >
                  {otherOpen.map((p) => (
                    <VillageCard key={p.id} plaza={p} onPress={() => enterPlaza(p)} />
                  ))}
                </ScrollView>
              </>
            )}

            {/* ─── 곧 열릴 지역 ─────────────────────────────────── */}
            {comingSoon.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: "#78716c", marginTop: 24, marginBottom: 12 }]}>곧 열릴 지역</Text>
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
  const province = provinceName(plaza.id, plaza.name)
  const members = plaza.member_count ?? 0
  const postsToday = plaza.posts_today ?? 0
  const c = provinceColors(plaza.id)
  return (
    <View style={styles.bigCardWrap}>
      {/* 헤더 — 도별 농촌 사진 + 어두운 오버레이 */}
      <ImageBackground source={provincePhoto(plaza.id)} style={styles.bigHeader} imageStyle={{ resizeMode: "cover" }}>
        <LinearGradient
          colors={["rgba(34,90,57,0.3)", "rgba(31,61,42,0.6)", "rgba(23,53,36,0.9)"]}
          style={StyleSheet.absoluteFill as any}
        />
        {/* 좌상단 칩 */}
        <View style={styles.bigCardTopRow}>
          {isOpen ? (
            <View style={styles.openBadgeMockup}>
              <View style={styles.liveDot}>
                <View style={styles.liveDotPing} />
                <View style={styles.liveDotCore} />
              </View>
              <Text style={styles.openBadgeMockupTextWhite}>지금 열림</Text>
              {plaza.parent_region && <Text style={styles.openBadgeMockupSubWhite}> · {plaza.parent_region}</Text>}
            </View>
          ) : (
            <View style={styles.soonBadge}>
              <Ionicons name="lock-closed" size={11} color="#44403c" />
              <Text style={styles.soonBadgeTextDark}>곧 열려요</Text>
            </View>
          )}
        </View>
        {/* 좌하단 도명 */}
        <Text style={styles.bigCardProvince}>{province}</Text>
      </ImageBackground>

      {/* 통계 행 */}
      <View style={styles.statsRow}>
        <View style={styles.statCell}>
          <Ionicons name="people" size={18} color={GREEN} />
          <Text style={styles.statValue}>{members.toLocaleString()}</Text>
          <Text style={styles.statLabel}>명</Text>
        </View>
        <Text style={styles.statSep}>·</Text>
        <View style={styles.statCell}>
          <Ionicons name="chatbubble-ellipses" size={18} color={GREEN} />
          <Text style={styles.statValue}>{postsToday}</Text>
          <Text style={styles.statLabel}>개 글 오늘</Text>
        </View>
        <Text style={styles.statSep}>·</Text>
        <View style={styles.statCell}>
          <Ionicons name="location" size={18} color={GREEN} />
          <Text style={styles.statValue}>{coverage.length}</Text>
          <Text style={styles.statLabel}>개 동네</Text>
        </View>
      </View>

      {/* CTA */}
      <Pressable style={[styles.enterBtn, !isOpen && styles.enterBtnDisabled]} onPress={onEnter} disabled={!isOpen}>
        {isOpen ? (
          <>
            <Text style={styles.enterBtnText}>{province} 들어가기</Text>
            <Ionicons name="arrow-forward" size={22} color={GREEN} />
          </>
        ) : (
          <Text style={[styles.enterBtnText, { color: "#a8a29e" }]}>곧 열려요</Text>
        )}
      </Pressable>
    </View>
  )
}

function VillageCard({ plaza, onPress }: { plaza: Plaza; onPress: () => void }) {
  const province = provinceName(plaza.id, plaza.name)
  const members = plaza.member_count ?? 0
  const postsToday = plaza.posts_today ?? 0
  const snippet = plaza.recent_post_title ?? "이웃들이 모이고 있어요"
  const c = provinceColors(plaza.id)
  return (
    <Pressable style={styles.village} onPress={onPress}>
      <ImageBackground source={provincePhoto(plaza.id)} style={styles.villagePhoto} imageStyle={{ resizeMode: "cover" }}>
        <LinearGradient
          colors={["rgba(23,53,36,0)", "rgba(23,53,36,0.7)"]}
          style={StyleSheet.absoluteFill as any}
        />
        <View style={styles.villageBadge}>
          <View style={styles.villageBadgeDot} />
          <Text style={styles.villageBadgeTextWhite}>열림</Text>
        </View>
        <Text style={styles.villagePhotoTitle}>{province}</Text>
      </ImageBackground>
      <View style={styles.villageBody}>
        <Text style={styles.villageSnippet} numberOfLines={1}>{snippet}</Text>
        <View style={styles.villageStats}>
          <Ionicons name="people" size={14} color={GREEN} />
          <Text style={styles.villageStatValue}>{members.toLocaleString()}</Text>
          <Text style={styles.villageStatLabel}>명</Text>
          <Text style={styles.statSep}>·</Text>
          <Ionicons name="chatbubble-ellipses" size={14} color={GREEN} />
          <Text style={styles.villageStatValue}>{postsToday}</Text>
          <Text style={styles.villageStatLabel}>개 글</Text>
        </View>
      </View>
    </Pressable>
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
        <Text style={[styles.tileName, !isOpen && { color: "#a8a29e" }]} numberOfLines={1}>{provinceName(plaza.id, plaza.name)}</Text>
      </View>
      <Text style={[styles.tileHint, !isOpen && { color: "#a8a29e" }]}>
        {isOpen ? "눌러서 입장 →" : "곧 열려요"}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CREAM },

  heroBgWrap: { position: "absolute", top: 0, left: 0, right: 0, height: 320, overflow: "hidden" },
  heroBgImg: { width: "100%", height: "100%", opacity: 0.14 },

  hero: { alignItems: "center", paddingHorizontal: 20, paddingTop: 22, paddingBottom: 14 },
  brandRow: { alignItems: "center", marginBottom: 6 },
  brandLogo: { width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: "#fff" },

  h1: { fontSize: 30, fontWeight: "900", color: GREEN, textAlign: "center", includeFontPadding: false },
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

  // LIVE 칩
  liveChip: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "rgba(220,252,231,0.7)", borderColor: "#bbf7d0", borderWidth: 1,
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, marginTop: 6,
  },
  liveChipText: { color: "#44403c", fontSize: 15, fontWeight: "600", flex: 1 },
  liveChipBold: { color: GREEN, fontWeight: "900" },
  liveDot: { width: 10, height: 10, alignItems: "center", justifyContent: "center" },
  liveDotPing: { position: "absolute", width: 10, height: 10, borderRadius: 5, backgroundColor: "rgba(52,211,153,0.6)" },
  liveDotCore: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#10b981" },

  // 우리 동네 라벨
  kickerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 18, marginBottom: 8 },
  kickerBar: { width: 4, height: 18, borderRadius: 2, backgroundColor: GREEN },
  kicker: { fontSize: 16, fontWeight: "900", color: "#1c1917" },

  // 큰 카드 (그라데이션 헤더 + 통계행 + CTA)
  bigCardWrap: { backgroundColor: "#fff", borderRadius: 24, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  bigHeader: { height: 180, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 14, justifyContent: "space-between" },
  bigCardTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  openBadgeMockup: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(16,185,129,0.9)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  openBadgeMockupText: { color: "#173524", fontSize: 13, fontWeight: "900" },
  openBadgeMockupTextWhite: { color: "#ffffff", fontSize: 13, fontWeight: "900" },
  openBadgeMockupSub: { color: "rgba(23,53,36,0.75)", fontSize: 13, fontWeight: "700" },
  openBadgeMockupSubWhite: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "700" },
  liveDotPingDark: { position: "absolute", width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(23,53,36,0.55)" },
  liveDotCoreDark: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#173524" },
  soonBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  soonBadgeTextDark: { color: "#44403c", fontSize: 12, fontWeight: "800" },
  bigCardProvince: { color: "#fff", fontSize: 36, fontWeight: "900", letterSpacing: -0.5, textShadowColor: "rgba(0,0,0,0.35)", textShadowRadius: 8 },

  // 통계 행
  statsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10 },
  statCell: { flexDirection: "row", alignItems: "center", gap: 5 },
  statValue: { color: GREEN, fontSize: 16, fontWeight: "900" },
  statLabel: { color: "#78716c", fontSize: 14, fontWeight: "600" },
  statSep: { color: "#d6d3d1", fontSize: 16 },

  // CTA
  enterBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 12, marginBottom: 14, marginTop: 2, backgroundColor: "#fff", borderRadius: 16, paddingVertical: 16, borderWidth: 2, borderColor: "rgba(34,90,57,0.15)" },
  enterBtnDisabled: { backgroundColor: "#f5f5f4", borderColor: "#e7e5e4" },
  enterBtnText: { color: GREEN, fontSize: 19, fontWeight: "900" },

  // 열린 마을 둘러보기
  browseHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 24, marginBottom: 10 },
  browseAll: { fontSize: 14, fontWeight: "700", color: "#78716c" },
  hScroll: { paddingRight: 16, paddingVertical: 4, gap: 12 },
  village: { width: 230, backgroundColor: "#fff", borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: "#e7e5e4", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  villagePhoto: { height: 100, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, justifyContent: "flex-end" },
  villagePhotoTitle: { color: "#fff", fontSize: 24, fontWeight: "900", letterSpacing: -0.3, textShadowColor: "rgba(0,0,0,0.3)", textShadowRadius: 4 },
  villageBadge: { position: "absolute", top: 10, left: 10, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(16,185,129,0.9)", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  villageBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#ffffff" },
  villageBadgeText: { color: "#173524", fontSize: 11, fontWeight: "900" },
  villageBadgeTextWhite: { color: "#ffffff", fontSize: 11, fontWeight: "900" },
  villageBody: { paddingHorizontal: 12, paddingVertical: 12, gap: 4 },
  villageSnippet: { fontSize: 13, color: "#78716c", fontWeight: "500" },
  villageStats: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  villageStatValue: { color: GREEN, fontSize: 13, fontWeight: "900" },
  villageStatLabel: { color: "#a8a29e", fontSize: 12, fontWeight: "600" },

  sectionTitle: { fontSize: 21, fontWeight: "900", color: GREEN },

  // 곧 열릴 지역 그리드 (남겨둠)
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "47.5%", flexGrow: 1, backgroundColor: "#fff", borderRadius: 16, borderWidth: 2, borderColor: "rgba(34,90,57,0.15)", paddingHorizontal: 14, paddingVertical: 14 },
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
