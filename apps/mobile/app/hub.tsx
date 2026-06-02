/**
 * 광장 허브 — 광장 web HubLanding 1:1 RN 미러.
 *
 * 정독 매핑 (apps/web/components/hub-landing.tsx):
 *   - Hero: 전국 광장 플랫폼 pill + "우리 동네 광장, 한 곳에서" + 설명
 *   - Search: rounded pill + 좌측 돋보기 + 우측 rose "광장 찾기" 버튼
 *   - Stats: MapPin/Users/Building2 아이콘 + 값 (전체 / 오픈 / 오픈예정)
 *   - LiveActivityBar: stone-900 pill ("지금 광장 N곳에서 이웃들이 활동 중")
 *   - Featured 섹션: 오픈된 광장 카드 (강원권 chip + 오픈됨 + name + coverage chips + 입장하기 →)
 *   - 권역별 전체 섹션: chip header + 2-col tile grid (오픈/오픈예정 lock)
 *
 * 모바일 환경: 선택한 광장은 lib/plaza setSelectedPlaza 통해 AsyncStorage 저장.
 */

import { useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  ImageBackground,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { Image } from "expo-image"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { useThemedStyles } from "@/components/useColorScheme"
import { getSupabase } from "@/lib/supabase"
import {
  setSelectedPlaza,
  HIDDEN_PLAZA_IDS as GLOBAL_HIDDEN_IDS,
  HIDDEN_PLAZA_NAMES as GLOBAL_HIDDEN_NAMES,
} from "@/lib/plaza"

const HUB_BG_CACHE_KEY = "hub.background.v1"
// 비활성 plaza id — lib/plaza.ts 와 동기 (cache/setter/picker 모두 동일 set 사용)
const HIDDEN_PLAZA_IDS = GLOBAL_HIDDEN_IDS
const HIDDEN_PLAZA_NAMES = GLOBAL_HIDDEN_NAMES

// 첫 진입 시에도 즉시 표시되도록 default 값 하드코딩 — DB 의 site_settings.hub_background 와 동기 유지
// (super-admin 에서 변경되면 다음 fetch 후 갱신됨)
const DEFAULT_HUB_BG: HubBackground = {
  image_url: "https://pub-8bbddd005e4240fabcfd00960d392ecc.r2.dev/hub/super/1777609710728-38a8fa1a.webp",
  overlay_color: "slate",
  overlay_opacity: 0.25,
  position: "center",
}

interface HubBackground {
  image_url?: string | null
  overlay_color?: "slate" | "sky" | "violet" | "emerald" | "rose"
  overlay_opacity?: number
  position?: "top" | "center" | "bottom"
}

// web OVERLAY_BG_CLASS 1:1 매핑
const OVERLAY_HEX: Record<NonNullable<HubBackground["overlay_color"]>, string> = {
  slate: "#020617",   // slate-950
  sky: "#0c4a6e",     // sky-900
  violet: "#2e1065",  // violet-950
  emerald: "#022c22", // emerald-950
  rose: "#4c0519",    // rose-950
}

interface Plaza {
  id: string
  name: string
  parent_region: string | null
  is_active: boolean
  is_open_soon: boolean
  sort_order: number
  coverage?: string[] | null
}

const REGION_ORDER = ["서울권", "경기권", "강원권", "충청권", "전라권", "경상권", "제주권"]

// web REGION_THEME 1:1 매핑 — chip 배경 + dot 색
const REGION_THEME: Record<string, { chip: string; dot: string; tint: string }> = {
  서울권: { chip: "#e11d48", dot: "#f43f5e", tint: "#fff1f2" }, // rose-600 / rose-500 / rose-50
  경기권: { chip: "#ea580c", dot: "#f97316", tint: "#fff7ed" }, // orange-600
  강원권: { chip: "#0369a1", dot: "#0ea5e9", tint: "#f0f9ff" }, // sky-700
  충청권: { chip: "#047857", dot: "#10b981", tint: "#ecfdf5" }, // emerald-700
  전라권: { chip: "#6d28d9", dot: "#a855f7", tint: "#f5f3ff" }, // violet-700
  경상권: { chip: "#b45309", dot: "#f59e0b", tint: "#fffbeb" }, // amber-700
  제주권: { chip: "#0f766e", dot: "#14b8a6", tint: "#f0fdfa" }, // teal-700
}
const DEFAULT_THEME = REGION_THEME["서울권"]

export default function HubScreen() {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const [plazas, setPlazas] = useState<Plaza[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  // 초기값 default 하드코딩 → 첫 진입에도 즉시 배경 표시 (이후 DB fetch 가 덮어씀)
  const [background, setBackground] = useState<HubBackground | null>(DEFAULT_HUB_BG)

  // 1) 캐시된 hub background 즉시 적용 — 네트워크 fetch 기다리지 않고 바로 표시
  //    (default 가 이미 set 되어 있으므로 캐시가 있으면 덮어씀)
  useEffect(() => {
    // default 이미지 prefetch — 마운트 직후 다운로드 시작
    if (DEFAULT_HUB_BG.image_url) {
      Image.prefetch(DEFAULT_HUB_BG.image_url).catch(() => {})
    }
    let alive = true
    ;(async () => {
      try {
        const cached = await AsyncStorage.getItem(HUB_BG_CACHE_KEY)
        if (cached && alive) {
          const parsed = JSON.parse(cached) as HubBackground
          setBackground(parsed)
          if (parsed.image_url) {
            Image.prefetch(parsed.image_url).catch(() => {})
          }
        }
      } catch {}
    })()
    return () => { alive = false }
  }, [])

  // 2) 실제 fetch — 캐시 갱신 + 첫 진입 시
  useEffect(() => {
    ;(async () => {
      try {
        const supabase = getSupabase()
        // plazas + site_settings.hub_background 병렬 (web /page.tsx 미러)
        const [plazasRes, bgRes] = await Promise.all([
          supabase
            .from("plazas")
            .select("id, name, parent_region, is_active, is_open_soon, sort_order, coverage")
            .order("sort_order", { ascending: true }),
          supabase
            .from("site_settings")
            .select("value")
            .eq("key", "hub_background")
            .maybeSingle(),
        ])
        // 비활성 plaza (원주 등) 제외 — 모바일에서 차단
        const all = (plazasRes.data ?? []) as Plaza[]
        const filtered = all.filter(
          (p) => !HIDDEN_PLAZA_IDS.has(p.id) && !HIDDEN_PLAZA_NAMES.has(p.name),
        )
        setPlazas(filtered)
        if (bgRes?.data?.value) {
          const v = bgRes.data.value as any
          const parsed = typeof v === "string" ? JSON.parse(v) : v
          setBackground(parsed as HubBackground)
          // AsyncStorage 캐시 + 이미지 prefetch
          AsyncStorage.setItem(HUB_BG_CACHE_KEY, JSON.stringify(parsed)).catch(() => {})
          if (parsed?.image_url) {
            Image.prefetch(parsed.image_url).catch(() => {})
          }
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const hasBg = !!background?.image_url
  const overlayColor = background?.overlay_color ?? "slate"
  const overlayOpacity =
    typeof background?.overlay_opacity === "number" ? background.overlay_opacity : 0.65

  const trimmed = query.trim()

  const filtered = useMemo(() => {
    if (!trimmed) return plazas
    const q = trimmed.toLowerCase()
    return plazas.filter((p) => {
      if (p.name.toLowerCase().includes(q)) return true
      if ((p.parent_region ?? "").toLowerCase().includes(q)) return true
      if ((p.coverage ?? []).some((c) => c.toLowerCase().includes(q))) return true
      return false
    })
  }, [plazas, trimmed])

  const grouped = useMemo(() => {
    const map = new Map<string, Plaza[]>()
    for (const p of filtered) {
      const key = p.parent_region ?? "기타"
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    const result: { region: string; items: Plaza[] }[] = []
    for (const r of REGION_ORDER) {
      if (map.has(r)) {
        result.push({
          region: r,
          items: map.get(r)!.sort((a, b) => a.sort_order - b.sort_order),
        })
      }
    }
    if (map.has("기타")) result.push({ region: "기타", items: map.get("기타")! })
    return result
  }, [filtered])

  const stats = useMemo(() => {
    const total = plazas.length
    const open = plazas.filter((p) => p.is_active).length
    const soon = plazas.filter((p) => !p.is_active && p.is_open_soon).length
    return { total, open, soon }
  }, [plazas])

  const openPlazas = useMemo(
    () => filtered.filter((p) => p.is_active).sort((a, b) => a.sort_order - b.sort_order),
    [filtered],
  )

  async function selectPlaza(p: Plaza) {
    if (!p.is_active) return
    await setSelectedPlaza(p.id, p.name)
    router.replace("/(tabs)" as any)
  }

  const content = (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing[8] }}>
        {/* ─── Hero ───────────────────────────────────────────── */}
        <View style={[styles.hero, hasBg && styles.heroGlass]}>
          {/* 전국 광장 플랫폼 pill */}
          <View style={[styles.heroBadge, hasBg && styles.heroBadgeGlass]}>
            <Ionicons
              name="sparkles"
              size={12}
              color={hasBg ? "#ffffff" : lightColors.primary}
            />
            <Text style={[styles.heroBadgeText, hasBg && { color: "#ffffff" }]}>
              전국 광장 플랫폼
            </Text>
          </View>

          <Text style={[styles.heroTitle, hasBg && { color: "#ffffff" }]}>
            우리 동네 광장,{"\n"}
            <Text style={[styles.heroTitleAccent, hasBg && { color: "#ffffff" }]}>
              한 곳에서
            </Text>
          </Text>
          <Text style={[styles.heroSub, hasBg && { color: "rgba(255,255,255,0.95)" }]}>
            지역별 부동산·생활정보·이웃 커뮤니티를 광장 하나로. 우리 동네를 선택해 들어가세요.
          </Text>

          {/* Search pill — 좌측 돋보기 + input + rose "광장 찾기" 버튼 */}
          <View style={styles.searchPill}>
            <View style={styles.searchIcon}>
              <Ionicons name="search" size={16} color="#94a3b8" />
            </View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="동네 이름으로 광장 찾기 — 예: 망원, 인제, 분당"
              placeholderTextColor="#94a3b8"
              style={styles.searchInput}
            />
            {!!query && (
              <Pressable onPress={() => setQuery("")} hitSlop={8} style={{ paddingHorizontal: 4 }}>
                <Ionicons name="close" size={16} color="#94a3b8" />
              </Pressable>
            )}
            <Pressable
              style={styles.searchBtn}
              onPress={() => {
                // 키보드 dismiss — 검색은 query state 변경 시 자동 필터됨
                Keyboard.dismiss()
              }}
            >
              <Text style={styles.searchBtnText}>광장 찾기</Text>
            </Pressable>
          </View>
          {trimmed.length > 0 && (
            <Text style={styles.searchHint}>
              "{trimmed}" 검색 결과: {filtered.length}개 광장
            </Text>
          )}

          {/* Stats — 검색 안 할 때만 */}
          {!trimmed && (
            <View style={styles.statsRow}>
              <StatCard icon="location-outline" value={stats.total} label="전체 광장" glass={hasBg} />
              <StatCard icon="people-outline" value={stats.open} label="오픈" highlighted glass={hasBg} />
              <StatCard icon="business-outline" value={stats.soon} label="오픈예정" glass={hasBg} />
            </View>
          )}
        </View>

        {/* ─── LIVE 알림 바 ─────────────────────────── */}
        {openPlazas.length > 0 && !trimmed && (
          <View style={styles.liveBarWrap}>
            <View style={styles.liveBar}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBarLabel}>지금 광장</Text>
              <Text style={styles.liveBarSep}>·</Text>
              <Text style={styles.liveBarText} numberOfLines={1}>
                <Text style={styles.liveBarPlazaName}>{openPlazas[0].name}</Text>
                {openPlazas.length > 1 && (
                  <Text style={styles.liveBarMuted}> 외 {openPlazas.length - 1}곳</Text>
                )}
                <Text style={styles.liveBarMuted}>에서 이웃들이 활동 중</Text>
              </Text>
              <Text style={styles.liveBarArrow}>→</Text>
            </View>
          </View>
        )}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={lightColors.primary} />
          </View>
        ) : (
          <View style={{ paddingHorizontal: spacing[3], paddingTop: spacing[3], gap: spacing[6] }}>
            {/* ─── 검색 결과 없음 ──────────────── */}
            {trimmed && filtered.length === 0 && (
              <View style={styles.noResults}>
                <Ionicons name="search-outline" size={32} color="#cbd5e1" />
                <Text style={styles.noResultsTitle}>"{trimmed}" 에 해당하는 광장이 없습니다</Text>
                <Text style={styles.noResultsSub}>다른 지역명으로 다시 검색해보세요.</Text>
              </View>
            )}

            {/* ─── 지금 이용 가능한 광장 ──────────── */}
            {openPlazas.length > 0 && (
              <View>
                <View style={styles.sectionHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sectionTitle, hasBg && { color: "#ffffff" }]}>
                      지금 이용 가능한 광장
                    </Text>
                    <Text style={[styles.sectionSub, hasBg && { color: "rgba(255,255,255,0.95)" }]}>
                      바로 클릭해서 입장하세요
                    </Text>
                  </View>
                  <View style={[styles.liveChip, hasBg && styles.liveChipGlass]}>
                    <View style={styles.liveChipDot} />
                    <Text style={[styles.liveChipText, hasBg && { color: "#a7f3d0" }]}>
                      LIVE
                    </Text>
                  </View>
                </View>
                <View style={{ gap: 12 }}>
                  {openPlazas.map((p) => (
                    <FeaturedCard
                      key={p.id}
                      plaza={p}
                      onPress={() => selectPlaza(p)}
                      glass={hasBg}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* ─── 권역별 전체 ─────────────────── */}
            <View>
              <Text style={[styles.sectionTitle, hasBg && { color: "#ffffff" }]}>
                전체 광장 둘러보기
              </Text>
              <Text style={[styles.sectionSub, hasBg && { color: "rgba(255,255,255,0.95)" }]}>
                7개 권역 · {plazas.length}개 광장 (확장 중)
              </Text>
              <View style={{ marginTop: spacing[3], gap: spacing[3] }}>
                {grouped.map(({ region, items }) => {
                  const theme = REGION_THEME[region] ?? DEFAULT_THEME
                  const openCount = items.filter((p) => p.is_active).length
                  return (
                    <View
                      key={region}
                      style={[
                        styles.regionGroup,
                        hasBg
                          ? styles.regionGroupGlass
                          : { backgroundColor: theme.tint },
                      ]}
                    >
                      <View style={styles.regionGroupHead}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <View style={[styles.regionChip, { backgroundColor: theme.chip }]}>
                            <Text style={styles.regionChipText}>{region}</Text>
                          </View>
                          <Text
                            style={[
                              styles.regionGroupCount,
                              hasBg && { color: "rgba(255,255,255,0.95)" },
                            ]}
                          >
                            {items.length}개 광장
                          </Text>
                        </View>
                        {openCount > 0 ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <View style={[styles.openCountDot, { backgroundColor: theme.dot }]} />
                            <Text
                              style={[
                                styles.openCountText,
                                hasBg && { color: "rgba(255,255,255,0.9)" },
                              ]}
                            >
                              {openCount}개 오픈
                            </Text>
                          </View>
                        ) : (
                          <Text
                            style={[
                              styles.preparingText,
                              hasBg && { color: "rgba(255,255,255,0.75)" },
                            ]}
                          >
                            준비 중
                          </Text>
                        )}
                      </View>

                      <View style={styles.tileGrid}>
                        {items.map((p) => (
                          <PlazaTile
                            key={p.id}
                            plaza={p}
                            accentDot={theme.dot}
                            onPress={() => selectPlaza(p)}
                            glass={hasBg}
                          />
                        ))}
                      </View>
                    </View>
                  )
                })}
              </View>
            </View>
          </View>
        )}
      </ScrollView>
  )

  if (hasBg) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <ImageBackground
          source={{ uri: background!.image_url! }}
          contentFit="cover"
          style={StyleSheet.absoluteFill}
          imageStyle={{
            // top/center/bottom 위치 매핑 (web bgPosition 미러)
            // RN ImageBackground 는 native style 로 직접 처리 불가하므로
            // contentFit="cover" 고정 + alignSelf 로 근사
          }}
        />
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: OVERLAY_HEX[overlayColor], opacity: overlayOpacity },
          ]}
        />
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          {content}
        </SafeAreaView>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {content}
    </SafeAreaView>
  )
}

// ─── Sub Components ─────────────────────────────────────────────────────

function StatCard({
  icon,
  value,
  label,
  highlighted,
  glass,
}: {
  icon: keyof typeof Ionicons.glyphMap
  value: number
  label: string
  highlighted?: boolean
  glass?: boolean
}) {
  return (
    <View
      style={[
        styles.statCard,
        highlighted && styles.statCardHighlighted,
        glass && (highlighted ? styles.statCardGlassHighlighted : styles.statCardGlass),
      ]}
    >
      <View
        style={[
          styles.statIconBox,
          highlighted && styles.statIconBoxHighlighted,
          glass && styles.statIconBoxGlass,
        ]}
      >
        <Ionicons
          name={icon}
          size={14}
          color={glass ? "#ffffff" : highlighted ? lightColors.primary : "#64748b"}
        />
      </View>
      <Text style={[styles.statValue, glass && { color: "#ffffff" }]}>{value}</Text>
      <Text style={[styles.statLabel, glass && { color: "rgba(255,255,255,0.95)" }]}>
        {label}
      </Text>
    </View>
  )
}

function FeaturedCard({
  plaza,
  onPress,
  glass,
}: {
  plaza: Plaza
  onPress: () => void
  glass?: boolean
}) {
  const theme = REGION_THEME[plaza.parent_region ?? ""] ?? DEFAULT_THEME
  const coverage = plaza.coverage ?? []
  return (
    <Pressable style={[styles.featured, glass && styles.featuredGlass]} onPress={onPress}>
      {/* 배경 데코 — 우상단 색 블롭 (web group-hover 효과 정적 미러) */}
      <View
        pointerEvents="none"
        style={[
          styles.featuredBlob,
          { backgroundColor: theme.dot, opacity: glass ? 0.35 : 0.25 },
        ]}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <View style={[styles.regionChipSm, { backgroundColor: theme.chip }]}>
          <Text style={styles.regionChipSmText}>{plaza.parent_region}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={styles.openDot} />
          <Text style={[styles.openText, glass && { color: "#6ee7b7" }]}>오픈됨</Text>
        </View>
      </View>
      <Text style={[styles.featuredTitle, glass && { color: "#ffffff" }]}>{plaza.name}</Text>
      {coverage.length > 0 ? (
        <View style={styles.coverageRow}>
          {coverage.slice(0, 6).map((c) => (
            <View key={c} style={[styles.coverageChip, glass && styles.coverageChipGlass]}>
              <Text style={[styles.coverageChipText, glass && { color: "#ffffff" }]}>{c}</Text>
            </View>
          ))}
          {coverage.length > 6 && (
            <Text style={[styles.coverageMore, glass && { color: "rgba(255,255,255,0.8)" }]}>
              +{coverage.length - 6}
            </Text>
          )}
        </View>
      ) : (
        <Text style={[styles.featuredSub, glass && { color: "rgba(255,255,255,0.7)" }]}>
          매물 · 커뮤니티 · 동네 정보
        </Text>
      )}
      <View style={styles.enterRow}>
        <Text style={[styles.enterText, glass && { color: "#ffffff" }]}>입장하기</Text>
        <Ionicons
          name="arrow-forward"
          size={14}
          color={glass ? "#ffffff" : lightColors.primary}
        />
      </View>
    </Pressable>
  )
}

function PlazaTile({
  plaza,
  accentDot,
  onPress,
  glass,
}: {
  plaza: Plaza
  accentDot: string
  onPress: () => void
  glass?: boolean
}) {
  const isOpen = plaza.is_active
  const baseName = plaza.name.replace(/광장$/, "")
  const coverage = plaza.coverage ?? []
  const display = coverage.filter((c) => c !== baseName).slice(0, 3)
  const more = coverage.length - display.length
  return (
    <Pressable
      onPress={onPress}
      disabled={!isOpen}
      style={[
        styles.tile,
        !isOpen && styles.tileLocked,
        glass && (isOpen ? styles.tileGlass : styles.tileGlassLocked),
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
          {isOpen ? (
            <View style={[styles.tileDot, { backgroundColor: accentDot }]} />
          ) : (
            <Ionicons
              name="lock-closed"
              size={11}
              color={glass ? "rgba(255,255,255,0.4)" : "#94a3b8"}
            />
          )}
          <Text
            style={[
              styles.tileName,
              !isOpen && styles.tileNameLocked,
              glass && (isOpen ? { color: "#ffffff" } : { color: "rgba(255,255,255,0.4)" }),
            ]}
            numberOfLines={1}
          >
            {plaza.name}
          </Text>
        </View>
        {coverage.length > 0 ? (
          <Text
            style={[
              styles.tileCoverage,
              !isOpen && styles.tileCoverageLocked,
              glass && (isOpen
                ? { color: "rgba(255,255,255,0.9)" }
                : { color: "rgba(255,255,255,0.4)" }),
            ]}
            numberOfLines={2}
          >
            {display.length > 0 ? display.join(", ") : coverage.slice(0, 3).join(", ")}
            {more > 0 && display.length > 0 && (
              <Text style={{ color: glass ? "rgba(255,255,255,0.4)" : "#94a3b8" }}>
                {" "}· 외 {more}
              </Text>
            )}
          </Text>
        ) : (
          <Text
            style={[
              styles.tileHint,
              !isOpen && styles.tileHintLocked,
              glass && (isOpen
                ? { color: "#6ee7b7" }
                : { color: "rgba(255,255,255,0.4)" }),
            ]}
          >
            {isOpen ? "클릭해서 입장" : "오픈예정"}
          </Text>
        )}
      </View>
      {isOpen && (
        <Ionicons
          name="arrow-forward"
          size={13}
          color={glass ? "rgba(255,255,255,0.6)" : "#94a3b8"}
          style={{ marginTop: 2 }}
        />
      )}
    </Pressable>
  )
}

function makeStyles(colors: any) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  center: { padding: spacing[8], alignItems: "center" },

  // ─── Hero ───
  hero: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[6],
    paddingBottom: spacing[6],
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(15,23,42,0.06)",
  },
  heroGlass: {
    backgroundColor: "transparent",
    borderBottomWidth: 0,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.primary + "1A",
    borderWidth: 1,
    borderColor: colors.primary + "33",
    marginBottom: 12,
  },
  heroBadgeGlass: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderColor: "rgba(255,255,255,0.4)",
  },
  heroBadgeText: { fontSize: 11, fontWeight: "600", color: colors.primary },
  heroTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: "#0f172a",
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  heroTitleAccent: {
    color: colors.primary,
  },
  heroSub: {
    fontSize: 14,
    color: "#475569",
    lineHeight: 20,
    marginTop: 12,
  },

  // ─── Search ───
  searchPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 4,
    marginTop: 24,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  searchIcon: { paddingRight: 6 },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: "#0f172a",
    paddingVertical: 8,
  },
  searchBtn: {
    backgroundColor: "#e11d48",
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
  },
  searchBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  searchHint: {
    marginTop: 8,
    fontSize: 11,
    color: "#64748b",
  },

  // ─── Stats ───
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 24,
  },
  statCard: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  statCardHighlighted: {
    backgroundColor: colors.primary + "08",
    borderColor: colors.primary + "33",
  },
  statCardGlass: {
    backgroundColor: "rgba(255,255,255,0.20)",
    borderColor: "rgba(255,255,255,0.35)",
  },
  statCardGlassHighlighted: {
    backgroundColor: "rgba(255,255,255,0.30)",
    borderColor: "rgba(255,255,255,0.50)",
  },
  statIconBoxGlass: {
    backgroundColor: "rgba(255,255,255,0.30)",
  },
  statIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  statIconBoxHighlighted: {
    backgroundColor: colors.primary + "1A",
  },
  statValue: { fontSize: 22, fontWeight: "800", color: "#0f172a", lineHeight: 24 },
  statLabel: { fontSize: 11, color: "#64748b", marginTop: 4, fontWeight: "500" },

  // ─── Live activity bar ───
  liveBarWrap: {
    paddingHorizontal: spacing[3],
    marginTop: -16,
    marginBottom: 4,
  },
  liveBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1c1917", // stone-900
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10b981",
  },
  liveBarLabel: { color: "#ffffff", fontWeight: "700", fontSize: 13 },
  liveBarSep: { color: "rgba(255,255,255,0.3)" },
  liveBarText: { flex: 1, color: "rgba(255,255,255,0.85)", fontSize: 13 },
  liveBarPlazaName: { color: "#ffffff", fontWeight: "600" },
  liveBarMuted: { color: "rgba(255,255,255,0.6)" },
  liveBarArrow: { color: "rgba(255,255,255,0.6)", fontSize: 14 },

  // ─── Section ───
  sectionHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: "#0f172a" },
  sectionSub: { fontSize: 13, color: "#64748b", marginTop: 2 },

  liveChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#10b9811A",
    borderWidth: 1,
    borderColor: "#10b98155",
  },
  liveChipGlass: {
    backgroundColor: "rgba(16,185,129,0.25)",
    borderColor: "rgba(110,231,183,0.4)",
  },
  liveChipDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#10b981",
  },
  liveChipText: { color: "#047857", fontSize: 11, fontWeight: "700" },

  // ─── No results ───
  noResults: {
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    paddingVertical: 40,
    alignItems: "center",
  },
  noResultsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
    marginTop: 8,
  },
  noResultsSub: { fontSize: 12, color: "#94a3b8", marginTop: 4 },

  // ─── Featured card (오픈된 광장) ───
  featured: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    padding: 18,
    overflow: "hidden",
    position: "relative",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  featuredGlass: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderColor: "rgba(255,255,255,0.4)",
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowColor: "#000",
  },
  featuredBlob: {
    position: "absolute",
    right: -48,
    top: -48,
    width: 160,
    height: 160,
    borderRadius: 80,
  },
  regionChipSm: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  regionChipSmText: { color: "#ffffff", fontSize: 10, fontWeight: "800" },
  openDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10b981",
  },
  openText: { fontSize: 10, color: "#059669", fontWeight: "600" },
  featuredTitle: { fontSize: 20, fontWeight: "800", color: "#0f172a", marginBottom: 8 },
  featuredSub: { fontSize: 13, color: "#64748b", marginBottom: 12 },
  coverageRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 12,
  },
  coverageChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "#f1f5f9",
  },
  coverageChipGlass: {
    backgroundColor: "rgba(255,255,255,0.30)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
  },
  coverageChipText: { fontSize: 10, color: "#475569", fontWeight: "500" },
  coverageMore: { fontSize: 10, color: "#94a3b8", fontWeight: "500", paddingHorizontal: 2, paddingVertical: 2 },
  enterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  enterText: { color: colors.primary, fontWeight: "600", fontSize: 13 },

  // ─── Region group ───
  regionGroup: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
  },
  regionGroupGlass: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderColor: "rgba(255,255,255,0.30)",
  },
  regionGroupHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  regionChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  regionChipText: { color: "#ffffff", fontSize: 11, fontWeight: "800" },
  regionGroupCount: { fontSize: 13, color: "#475569", fontWeight: "500" },
  openCountDot: { width: 6, height: 6, borderRadius: 3 },
  openCountText: { fontSize: 11, color: "#64748b", fontWeight: "500" },
  preparingText: { fontSize: 11, color: "#94a3b8", fontWeight: "500" },

  // ─── Tile (권역내 광장 카드) ───
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tile: {
    width: "48.5%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  tileLocked: {
    backgroundColor: "rgba(248,250,252,0.6)",
    borderColor: "rgba(226,232,240,0.6)",
  },
  tileGlass: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderColor: "rgba(255,255,255,0.4)",
  },
  tileGlassLocked: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.20)",
  },
  tileDot: { width: 6, height: 6, borderRadius: 3 },
  tileName: { fontSize: 13, fontWeight: "700", color: "#0f172a", flex: 1 },
  tileNameLocked: { color: "#94a3b8" },
  tileCoverage: { fontSize: 10, color: "#64748b", lineHeight: 14 },
  tileCoverageLocked: { color: "#cbd5e1" },
  tileHint: { fontSize: 10, color: "#10b981", fontWeight: "600" },
  tileHintLocked: { color: "#94a3b8" },
})
}

// module-level fallback — light 색상 (외부 함수에서 styles 참조용)
const styles = makeStyles(lightColors)
