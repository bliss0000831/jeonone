/**
 * PlazaSelector — 광장 선택 바텀시트 모달.
 *
 * 허브 화면에서 현재 광장 이름을 탭하면 열림.
 * 전국 광장 목록을 권역별(서울권·경기권·강원권·충청권·전라권·경상권·제주권)
 * 그룹으로 보여주고, 검색·선택 기능을 제공.
 *
 * 선택 시 setSelectedPlaza() 로 AsyncStorage + 전역 리스너 전파.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { getSupabase } from "@/lib/supabase"
import { setSelectedPlaza, getRecentPlazas, HIDDEN_PLAZA_IDS, HIDDEN_PLAZA_NAMES } from "@/lib/plaza"
import { getFastUserLocation } from "@/lib/location"
import * as Location from "expo-location"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlazaSelectorProps {
  visible: boolean
  onClose: () => void
  currentPlazaId: string
  currentPlazaName: string
}

interface PlazaRow {
  id: string
  name: string
  parent_region: string | null
  is_active: boolean
  is_open_soon: boolean
  sort_order: number
  coverage: string[] | string | null
}

// ---------------------------------------------------------------------------
// Region theme (hub.tsx 미러)
// ---------------------------------------------------------------------------

const REGION_THEME: Record<string, { chip: string; dot: string }> = {
  서울권: { chip: "#e11d48", dot: "#f43f5e" },
  경기권: { chip: "#ea580c", dot: "#f97316" },
  강원권: { chip: "#0369a1", dot: "#0ea5e9" },
  충청권: { chip: "#047857", dot: "#10b981" },
  전라권: { chip: "#6d28d9", dot: "#a855f7" },
  경상권: { chip: "#b45309", dot: "#f59e0b" },
  제주권: { chip: "#0f766e", dot: "#14b8a6" },
}

const REGION_ORDER = [
  "서울권",
  "경기권",
  "강원권",
  "충청권",
  "전라권",
  "경상권",
  "제주권",
]

const FALLBACK_CHIP = "#6b7280"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isHidden(plaza: PlazaRow): boolean {
  return HIDDEN_PLAZA_IDS.has(plaza.id) || HIDDEN_PLAZA_NAMES.has(plaza.name)
}

function groupByRegion(plazas: PlazaRow[]): Map<string, PlazaRow[]> {
  const map = new Map<string, PlazaRow[]>()
  for (const region of REGION_ORDER) {
    map.set(region, [])
  }
  for (const p of plazas) {
    const region = p.parent_region ?? "기타"
    if (!map.has(region)) map.set(region, [])
    map.get(region)!.push(p)
  }
  // 빈 그룹 제거
  for (const [key, arr] of map) {
    if (arr.length === 0) map.delete(key)
  }
  return map
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PlazaSelector({
  visible,
  onClose,
  currentPlazaId,
  currentPlazaName,
}: PlazaSelectorProps) {
  const insets = useSafeAreaInsets()

  // ---- state ----
  const [plazas, setPlazas] = useState<PlazaRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [recent, setRecent] = useState<Array<{ id: string; name: string }>>([])
  const fetched = useRef(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---- data fetch (한 번만) ----
  useEffect(() => {
    if (!visible) return
    if (fetched.current && plazas.length > 0) return

    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const supabase = getSupabase()
        const { data, error } = await supabase
          .from("plazas")
          .select("id, name, parent_region, is_active, is_open_soon, sort_order, coverage")
          .order("sort_order", { ascending: true })

        if (!cancelled && data && !error) {
          setPlazas(data as PlazaRow[])
          fetched.current = true
        }
      } catch {
        // 네트워크 에러 — silent
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [visible])

  // 모달 닫힐 때 검색어 초기화
  useEffect(() => {
    if (!visible) setSearch("")
  }, [visible])

  // 모달 열릴 때 최근 광장 로드
  useEffect(() => {
    if (!visible) return
    let mounted = true
    getRecentPlazas().then((list) => { if (mounted) setRecent(list) })
    return () => { mounted = false }
  }, [visible])

  // ---- toast helper ----
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(null), 1800)
  }, [])

  // ---- filtered + grouped ----
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return plazas
      .filter((p) => !isHidden(p))
      .filter((p) => {
        if (!q) return true
        // 광장 이름 매칭
        if (p.name.toLowerCase().includes(q)) return true
        // coverage (하위 지역명) 매칭 — 송파구, 도봉구 등
        const covArr = Array.isArray(p.coverage)
          ? p.coverage
          : typeof p.coverage === "string"
            ? p.coverage.split(",").map((t) => t.trim())
            : []
        return covArr.some((c) => c.toLowerCase().includes(q))
      })
  }, [plazas, search])

  const grouped = useMemo(() => groupByRegion(filtered), [filtered])

  // ---- handlers ----
  const handleSelectPlaza = useCallback(
    async (plaza: PlazaRow) => {
      // 비활성 광장은 전환 불가. "오픈예정"은 안내만 하고 전환하지 않음
      // (전환 시 콘텐츠 없는 빈 광장으로 들어가는 문제 방지)
      if (!plaza.is_active) {
        if (plaza.is_open_soon) {
          Alert.alert("오픈 예정", `${plaza.name}은(는) 곧 오픈 예정입니다. 오픈 후 이용해 주세요.`)
        }
        return
      }
      await setSelectedPlaza(plaza.id, plaza.name)
      onClose()
    },
    [onClose],
  )

  // 최근 광장 — 현재 광장 제외하고 최대 4개
  const recentToShow = useMemo(
    () => recent.filter((r) => r.id !== currentPlazaId).slice(0, 4),
    [recent, currentPlazaId],
  )

  const handleSelectRecent = useCallback(
    async (r: { id: string; name: string }) => {
      // 목록이 로드돼 있으면 PlazaRow 로 정식 가드(is_active 등) 통과, 아니면 직접 설정
      const row = plazas.find((p) => p.id === r.id)
      if (row) {
        await handleSelectPlaza(row)
        return
      }
      await setSelectedPlaza(r.id, r.name)
      onClose()
    },
    [plazas, handleSelectPlaza, onClose],
  )

  const [locLoading, setLocLoading] = useState(false)

  const handleLocationPress = useCallback(async () => {
    if (locLoading) return
    setLocLoading(true)
    try {
      const loc = await getFastUserLocation({ forceFresh: true })
      if (!loc) {
        showToast("위치를 가져올 수 없습니다")
        return
      }

      // reverse geocode로 지역명 가져오기
      let geo: Location.LocationGeocodedAddress | null = null
      try {
        const results = await Location.reverseGeocodeAsync({
          latitude: loc.lat,
          longitude: loc.lng,
        })
        geo = results?.[0] ?? null
      } catch {
        // reverse geocode 실패 — 좌표 기반 매칭으로 진행
      }

      // 시/도 + 시/군/구 + 동/읍/면 조합으로 광장 매칭
      const parts = geo
        ? [
            geo.region,       // 강원도, 서울특별시 등
            geo.city,         // 춘천시, 강남구 등
            geo.subregion,    // 구/군
            geo.district,     // 동/읍/면
            geo.street,
          ].filter(Boolean).map((s) => s!.replace(/\s/g, ""))
        : []

      // 광장 이름 or coverage 에 매칭되는 광장 찾기
      const match = plazas.find((p) => {
        if (!p.is_active) return false
        // 광장 이름에 지역명 포함 체크 (예: "춘천광장" ← "춘천시")
        const nameNorm = p.name.replace(/광장|플라자|\s/g, "")
        for (const part of parts) {
          if (part && (nameNorm.includes(part) || part.includes(nameNorm))) return true
        }
        // coverage 필드 체크
        const covArr = Array.isArray(p.coverage)
          ? p.coverage
          : typeof p.coverage === "string"
            ? p.coverage.split(",").map((t) => t.trim())
            : []
        for (const cov of covArr) {
          const covNorm = cov.replace(/\s/g, "")
          for (const part of parts) {
            if (part && (covNorm.includes(part) || part.includes(covNorm))) return true
          }
        }
        return false
      })

      if (match) {
        await setSelectedPlaza(match.id, match.name)
        showToast(`${match.name}으로 설정되었습니다`)
        setTimeout(() => onClose(), 800)
      } else if (parts.length === 0) {
        // reverse geocode 실패 — 좌표만 있는 경우
        showToast("주소를 확인할 수 없습니다. 직접 선택해주세요")
      } else {
        const locationStr = geo ? [geo.city, geo.district].filter(Boolean).join(" ") : ""
        showToast(`${locationStr || "현재 위치"}에 해당하는 광장이 없습니다`)
      }
    } catch (e) {
      showToast("위치 확인에 실패했습니다")
    } finally {
      setLocLoading(false)
    }
  }, [plazas, locLoading, showToast, onClose])

  // ---- render helpers ----
  const renderCoverageTags = (coverage: string[] | string | null) => {
    if (!coverage) return null
    const tags = Array.isArray(coverage)
      ? coverage
      : coverage.split(",").map((t) => t.trim())
    const filtered = tags.filter(Boolean)
    if (filtered.length === 0) return null
    return (
      <View style={styles.tagRow}>
        {filtered.map((tag) => (
          <View key={tag} style={styles.tag}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
      </View>
    )
  }

  const renderPlazaItem = (plaza: PlazaRow) => {
    const isActive = plaza.is_active
    const isCurrent = plaza.id === currentPlazaId
    const isOpenSoon = plaza.is_open_soon && !isActive

    return (
      <Pressable
        key={plaza.id}
        style={({ pressed }) => [
          styles.plazaItem,
          isCurrent && styles.plazaItemCurrent,
          pressed && isActive && styles.plazaItemPressed,
          !isActive && !isOpenSoon && styles.plazaItemDisabled,
        ]}
        onPress={() => handleSelectPlaza(plaza)}
        disabled={!isActive && !isOpenSoon}
      >
        <View style={styles.plazaItemLeft}>
          {/* 아이콘 서클 */}
          <View style={[styles.plazaIconCircle, isCurrent && styles.plazaIconCircleCurrent]}>
            {isActive ? (
              <Ionicons name="storefront" size={16} color={isCurrent ? "#ffffff" : "#6b7280"} />
            ) : isOpenSoon ? (
              <Ionicons name="time-outline" size={16} color="#f59e0b" />
            ) : (
              <Ionicons name="lock-closed" size={14} color="#d1d5db" />
            )}
          </View>

          <View style={styles.plazaTextCol}>
            <View style={styles.plazaNameRow}>
              <Text
                style={[
                  styles.plazaName,
                  isCurrent && styles.plazaNameCurrent,
                  !isActive && !isOpenSoon && styles.plazaNameDisabled,
                ]}
                numberOfLines={1}
              >
                {plaza.name}
              </Text>
              {isCurrent && (
                <View style={styles.currentBadge}>
                  <Text style={styles.currentBadgeText}>현재</Text>
                </View>
              )}
              {isOpenSoon && (
                <View style={styles.openSoonBadge}>
                  <Text style={styles.openSoonText}>오픈예정</Text>
                </View>
              )}
            </View>
            {renderCoverageTags(plaza.coverage)}
          </View>
        </View>

        {isActive && (
          <Ionicons name="chevron-forward" size={16} color={isCurrent ? lightColors.primary : "#d1d5db"} />
        )}
      </Pressable>
    )
  }

  // ---- render ----
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* 닫기 탭 영역 */}
        <Pressable style={styles.backdrop} onPress={onClose} />

        {/* 본체 */}
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {/* ---- Header ---- */}
          <View style={styles.header}>
            <View style={styles.headerHandle} />
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.headerTitle}>광장 선택</Text>
                <Text style={styles.headerSub}>현재: {currentPlazaName}</Text>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={22} color="#9ca3af" />
              </Pressable>
            </View>
          </View>

          {/* ---- Search ---- */}
          <View style={styles.searchRow}>
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={16} color="#9ca3af" />
              <TextInput
                style={styles.searchInput}
                placeholder="광장 이름이나 지역명을 검색해보세요"
                placeholderTextColor="#9ca3af"
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            </View>
          </View>

          {/* ---- 내 위치로 설정 ---- */}
          <View style={styles.locationRow}>
            <Pressable style={styles.locationBtn} onPress={handleLocationPress} disabled={locLoading}>
              <Ionicons name="locate" size={16} color={lightColors.primary} />
              <Text style={styles.locationBtnText}>
                {locLoading ? "위치 확인 중..." : "내 위치로 설정"}
              </Text>
              {locLoading && <ActivityIndicator size="small" color={lightColors.primary} style={{ marginLeft: 4 }} />}
            </Pressable>
          </View>

          {/* ---- 최근 광장 ---- */}
          {!search.trim() && recentToShow.length > 0 && (
            <View style={styles.recentSection}>
              <Text style={styles.recentLabel}>최근 광장</Text>
              <View style={styles.recentRow}>
                {recentToShow.map((r) => (
                  <Pressable
                    key={r.id}
                    style={({ pressed }) => [styles.recentChip, pressed && { opacity: 0.7 }]}
                    onPress={() => handleSelectRecent(r)}
                  >
                    <Ionicons name="time-outline" size={13} color={lightColors.primary} />
                    <Text style={styles.recentChipText} numberOfLines={1}>{r.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* ---- List ---- */}
          {loading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator size="large" color={lightColors.primary} />
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="search-outline" size={40} color="#d1d5db" />
              <Text style={styles.emptyText}>
                {search.trim() ? "검색 결과가 없습니다" : "광장 목록을 불러올 수 없습니다"}
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {Array.from(grouped.entries()).map(([region, items]) => {
                const theme = REGION_THEME[region]
                const chipColor = theme?.chip ?? FALLBACK_CHIP

                return (
                  <View key={region} style={styles.regionGroup}>
                    {/* 권역 chip 헤더 */}
                    <View style={[styles.regionChip, { backgroundColor: chipColor }]}>
                      <Text style={styles.regionChipText}>{region}</Text>
                    </View>

                    {items.map(renderPlazaItem)}
                  </View>
                )
              })}
            </ScrollView>
          )}

          {/* ---- Toast ---- */}
          {toastMsg && (
            <View style={styles.toast}>
              <Text style={styles.toastText}>{toastMsg}</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  backdrop: {
    height: "25%",
  },
  sheet: {
    backgroundColor: "#fafafa",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    flex: 1,
    minHeight: 320,
  },

  // header
  header: {
    alignItems: "center",
    paddingTop: 10,
    paddingHorizontal: spacing[5],
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  headerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e5e7eb",
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: radius.full,
    backgroundColor: "#f3f4f6",
  },

  // search
  searchRow: {
    paddingHorizontal: spacing[5],
    paddingBottom: 8,
    backgroundColor: "#ffffff",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: "#111827",
    padding: 0,
  },
  // 내 위치로 설정
  locationRow: {
    paddingHorizontal: spacing[5],
    paddingBottom: 14,
    backgroundColor: "#ffffff",
  },
  recentSection: {
    paddingHorizontal: spacing[5],
    paddingBottom: 14,
    backgroundColor: "#ffffff",
  },
  recentLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9ca3af",
    marginBottom: 8,
  },
  recentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  recentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: "#f0f9ff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#bae6fd",
    maxWidth: "48%",
  },
  recentChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: lightColors.primary,
  },
  locationBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 42,
    borderRadius: 12,
    backgroundColor: lightColors.primary + "0f",
    borderWidth: 1,
    borderColor: lightColors.primary + "30",
    gap: 6,
  },
  locationBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: lightColors.primary,
  },

  // scroll
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing[4],
    paddingTop: 8,
    paddingBottom: 24,
  },

  // region group
  regionGroup: {
    marginBottom: 20,
  },
  regionChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 10,
  },
  regionChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.5,
  },

  // plaza item — 카드 스타일
  plazaItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 6,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  plazaItemCurrent: {
    backgroundColor: "#f0f9ff",
    borderWidth: 1.5,
    borderColor: lightColors.primary + "40",
  },
  plazaItemPressed: {
    backgroundColor: "#f3f4f6",
  },
  plazaItemDisabled: {
    opacity: 0.45,
  },
  plazaItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  plazaIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  plazaIconCircleCurrent: {
    backgroundColor: lightColors.primary,
  },
  plazaTextCol: {
    flex: 1,
  },
  plazaNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  plazaName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
  },
  plazaNameCurrent: {
    fontWeight: "700",
    color: lightColors.primary,
  },
  plazaNameDisabled: {
    color: "#9ca3af",
  },
  currentBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: lightColors.primary + "1a",
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: lightColors.primary,
  },

  // coverage tags
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
  },
  tag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#f3f4f6",
  },
  tagText: {
    fontSize: 10.5,
    color: "#6b7280",
    fontWeight: "500",
  },

  // open soon badge
  openSoonBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#fef3c7",
  },
  openSoonText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#b45309",
  },

  // loader / empty
  loaderWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: "#9ca3af",
  },

  // toast
  toast: {
    position: "absolute",
    bottom: 80,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(17,24,39,0.9)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  toastText: {
    fontSize: fontSize.sm,
    color: "#fff",
    fontWeight: "600",
  },
})
