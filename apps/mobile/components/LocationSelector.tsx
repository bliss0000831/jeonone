/**
 * LocationSelector — 광장 web LocationSelector 1:1 RN 미러.
 *
 * 정독 매핑 (apps/web/components/location-selector.tsx):
 *   - pill 클릭 시 모달 오픈
 *   - GET /api/regions 로 광장 지역 트리 (시/도 → 시/군/구 → 동/면/리)
 *   - "현재 위치 사용" — geolocation API (RN 은 expo-location 추후)
 *   - 부모 → 자식 (동) 2-step 선택
 *   - AsyncStorage 에 user-location 저장
 *
 * RN: Modal + ScrollView 기반.
 */

import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { getSupabase, gwangjangFetch } from "@/lib/supabase"

export interface UserLocation {
  sido: string
  sigungu?: string
  dong?: string
}

const LOCATION_STORAGE_KEY = "user-location"

interface DBRegion {
  id: string
  name: string
  parent_id: string | null
  level: number
  children?: DBRegion[]
}

interface Props {
  visible: boolean
  onClose: () => void
  location: UserLocation | null
  onLocationChange: (loc: UserLocation) => void
  /** 광장 ID (chuncheon / gangneung) — region 격리에 사용 (web /api/regions?plaza=) */
  plazaId?: string
  /** AsyncStorage 에 글로벌 user-location 저장 여부 (default: true). 필터 모드 등에서 false. */
  persistGlobal?: boolean
}

export function LocationSelector({
  visible,
  onClose,
  location,
  onLocationChange,
  plazaId,
  persistGlobal = true,
}: Props) {
  const [regions, setRegions] = useState<DBRegion[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedParent, setSelectedParent] = useState<DBRegion | null>(null)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    if (regions.length > 0) return
    setLoading(true)
    ;(async () => {
      try {
        // supabase 직접 쿼리 — production /api/regions 호출 회피 + 광장 격리 보장
        const supabase = getSupabase()
        let q = supabase
          .from("regions")
          .select("id, name, parent_id, level, is_active, order_index, plaza_id")
          .eq("is_active", true)
          .order("order_index", { ascending: true })
        if (plazaId) q = q.eq("plaza_id", plazaId)
        const { data, error } = await q
        if (error) {
          console.warn("[LocationSelector] regions fetch failed", error.message)
          return
        }
        // 트리 구조 빌드 (web /api/regions 와 동일 로직)
        const map = new Map<string, DBRegion>()
        const roots: DBRegion[] = []
        ;(data ?? []).forEach((r: any) => {
          map.set(r.id, { ...r, children: [] })
        })
        ;(data ?? []).forEach((r: any) => {
          const region = map.get(r.id)!
          if (r.parent_id && map.has(r.parent_id)) {
            map.get(r.parent_id)!.children!.push(region)
          } else {
            roots.push(region)
          }
        })
        setRegions(roots)
        // 루트가 1개면 자동 선택
        if (roots.length === 1) setSelectedParent(roots[0])
      } catch (e) {
        console.warn("[LocationSelector] error", e)
      } finally {
        setLoading(false)
      }
    })()
  }, [visible, regions.length, plazaId])

  // 닫을 때 selectedParent 초기화 (루트 여러개 케이스 대비)
  function handleClose() {
    if (regions.length !== 1) setSelectedParent(null)
    onClose()
  }

  function handleParentSelect(parent: DBRegion) {
    setSelectedParent(parent)
  }

  async function resolveDongAndApply(latitude: number, longitude: number) {
    try {
      const targetParent = selectedParent ?? regions[0]
      if (!targetParent) {
        setLocateError("지역 목록을 불러올 수 없습니다")
        setLocating(false)
        return
      }
      // 역지오코딩 — gwangjang.app /api/geocode/reverse (cross-origin / 앱은 직접 호출)
      let resolvedDong: string | null = null
      try {
        const res = await gwangjangFetch(
          `/api/geocode/reverse?lat=${latitude}&lng=${longitude}`,
          { cache: "no-store" } as any,
        )
        if (res.ok) {
          const data = await res.json()
          const rawDong: string = (data?.dong || "").trim()
          const candidates = [rawDong, rawDong.replace(/\d+동$/, "동")]
          for (const c of candidates) {
            if (!c) continue
            const hit = (targetParent.children || []).find((x) => x.name === c)
            if (hit) { resolvedDong = hit.name; break }
            if (!resolvedDong && c === rawDong) resolvedDong = c
          }
        }
      } catch (e) {
        console.warn("[LocationSelector] reverse geocode failed", e)
      }

      if (!resolvedDong) {
        setLocateError("현재 위치를 인식할 수 없습니다")
        setLocating(false)
        return
      }
      const targetChild = (targetParent.children || []).find((c) => c.name === resolvedDong)
      const next: UserLocation = {
        sido: targetParent.name,
        sigungu: targetParent.name,
        dong: targetChild?.name ?? resolvedDong,
      }
      onLocationChange(next)
      if (persistGlobal) {
        try { await AsyncStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(next)) } catch {}
      }
      setLocating(false)
      handleClose()
    } catch (err) {
      setLocateError((err as Error).message || "위치 처리 중 오류")
      setLocating(false)
    }
  }

  async function handleUseMyLocation() {
    setLocateError(null)
    setLocating(true)

    // 공용 helper — 모듈/AsyncStorage 캐시 → lastKnown → GPS 순으로 빠르게.
    const { getFastUserLocation } = await import("@/lib/location")
    const coords = await getFastUserLocation()
    if (!coords) {
      setLocateError("위치 확인에 실패했습니다 (권한 또는 신호 부족)")
      setLocating(false)
      return
    }
    await resolveDongAndApply(coords.lat, coords.lng)
  }

  async function handleDongSelect(parent: DBRegion, child: DBRegion) {
    const next: UserLocation = {
      sido: parent.name,
      sigungu: parent.name,
      dong: child.name,
    }
    onLocationChange(next)
    if (persistGlobal) {
      try { await AsyncStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(next)) } catch {}
    }
    handleClose()
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      // Android edge-to-edge 모드에서 시스템바까지 덮도록 — flex:1 이 0으로 평가되는 문제 회피
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation && e.stopPropagation()}>
          {/* 드래그 핸들 */}
          <View style={styles.handleBarWrap}>
            <View style={styles.handleBar} />
          </View>
          {/* 헤더 */}
          <View style={styles.header}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
              {selectedParent && regions.length > 1 && (
                <Pressable
                  onPress={() => setSelectedParent(null)}
                  hitSlop={6}
                  style={styles.backBtn}
                >
                  <Ionicons name="chevron-back" size={20} color={lightColors.ink900} />
                </Pressable>
              )}
              <Text style={styles.title}>
                {selectedParent ? `${selectedParent.name} 동네 선택` : "지역 선택"}
              </Text>
            </View>
            <Pressable onPress={handleClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={lightColors.ink500} />
            </Pressable>
          </View>

          {/* 컨텐츠 — web 정독 1:1
              flexShrink:1 — sheet maxHeight 도달 시 ScrollView 가 줄어들면서 내부 스크롤 활성화 */}
          <ScrollView
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          >
            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator color={lightColors.primary} />
              </View>
            ) : regions.length === 0 ? (
              <Text style={styles.emptyText}>설정된 지역이 없습니다.</Text>
            ) : (
              <View style={{ gap: 8 }}>
                {/* 내 위치로 설정 — 점선 테두리 + primary 톤 (web border-dashed border-primary/40) */}
                <Pressable
                  style={[styles.locateBtn, locating && { opacity: 0.6 }]}
                  onPress={handleUseMyLocation}
                  disabled={locating}
                >
                  {locating ? (
                    <ActivityIndicator size="small" color={lightColors.primary} />
                  ) : (
                    <Ionicons name="locate" size={16} color={lightColors.primary} />
                  )}
                  <Text style={styles.locateBtnText}>
                    {locating ? "내 위치 확인 중..." : "내 위치로 설정"}
                  </Text>
                </Pressable>
                {locateError && (
                  <Text style={styles.locateError}>{locateError}</Text>
                )}

                {selectedParent ? (
                  <>
                    {/* 부모 전체 선택 */}
                    <Pressable
                      style={styles.allRow}
                      onPress={async () => {
                        const next: UserLocation = {
                          sido: selectedParent.name,
                          sigungu: selectedParent.name,
                        }
                        onLocationChange(next)
                        if (persistGlobal) {
                          try {
                            await AsyncStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(next))
                          } catch {}
                        }
                        handleClose()
                      }}
                    >
                      <Text style={styles.allRowText}>{selectedParent.name} 전체</Text>
                      <Ionicons name="checkmark" size={16} color={lightColors.primary} />
                    </Pressable>
                    {/* 동 grid (2 col) — web grid-cols-2 */}
                    {(selectedParent.children ?? []).length > 0 && (
                      <View style={styles.dongGrid}>
                        {(selectedParent.children ?? []).map((c) => {
                          const active =
                            location?.dong === c.name &&
                            location?.sigungu === selectedParent.name
                          return (
                            <Pressable
                              key={c.id}
                              onPress={() => handleDongSelect(selectedParent, c)}
                              style={[styles.dongCard, active && styles.dongCardActive]}
                            >
                              <Text
                                style={[
                                  styles.dongCardText,
                                  active && { color: lightColors.primary, fontWeight: "700" },
                                ]}
                              >
                                {c.name}
                              </Text>
                            </Pressable>
                          )
                        })}
                      </View>
                    )}
                  </>
                ) : (
                  // 시/군 list (web 정독: MapPin + 이름 + N개 동네 →)
                  regions.map((r) => {
                    const active = location?.sigungu === r.name
                    const childCount = (r.children ?? []).length
                    return (
                      <Pressable
                        key={r.id}
                        onPress={() => handleParentSelect(r)}
                        style={[styles.parentRow, active && styles.parentRowActive]}
                      >
                        <View style={styles.parentRowLeft}>
                          <Ionicons
                            name="location-outline"
                            size={16}
                            color={active ? lightColors.primary : lightColors.ink900}
                          />
                          <Text
                            style={[
                              styles.parentRowText,
                              active && { color: lightColors.primary, fontWeight: "700" },
                            ]}
                          >
                            {r.name}
                          </Text>
                        </View>
                        {childCount > 0 && (
                          <Text style={styles.parentRowCount}>
                            {childCount}개 동네 →
                          </Text>
                        )}
                      </Pressable>
                    )
                  })
                )}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

/** AsyncStorage 에서 사용자 위치 로드 (web localStorage 미러) */
export async function loadUserLocation(): Promise<UserLocation | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as UserLocation
  } catch {
    return null
  }
}

const styles = StyleSheet.create({
  backdrop: {
    // edge-to-edge 모드에서 flex:1 이 0으로 떨어지는 문제 → 절대 위치로 전체 화면 강제
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: lightColors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    // 콘텐츠 크기에 맞춰 자동 sizing — 단 화면의 85% 까지만 (그 이상은 ScrollView 스크롤)
    maxHeight: Math.round(Dimensions.get("window").height * 0.85),
    overflow: "hidden",
  },
  handleBarWrap: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: lightColors.ink300 ?? "#cbd5e1",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightColors.border,
  },
  backBtn: {
    padding: 4,
    borderRadius: 999,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: lightColors.ink900,
  },
  center: {
    paddingVertical: 48,
    alignItems: "center",
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: lightColors.ink500,
    textAlign: "center",
    paddingVertical: 48,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
  },
  rowActive: {
    backgroundColor: lightColors.primary + "0F",
  },
  rowText: {
    fontSize: 14,
    fontWeight: "500",
    color: lightColors.ink900,
  },
  locateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: lightColors.primary + "66",
    backgroundColor: lightColors.primary + "0D",
    marginBottom: 4,
  },
  locateBtnText: {
    fontSize: 14,
    fontWeight: "500",
    color: lightColors.primary,
  },
  locateError: {
    fontSize: 12,
    color: "#dc2626",
    paddingHorizontal: 4,
    marginTop: 2,
  },
  allRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: lightColors.primary,
    backgroundColor: lightColors.primary + "0F",
  },
  allRowText: {
    fontSize: 14,
    fontWeight: "600",
    color: lightColors.primary,
  },
  dongGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  dongCard: {
    width: "48%",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
    alignItems: "center",
  },
  dongCardActive: {
    borderColor: lightColors.primary,
    backgroundColor: lightColors.primary + "0F",
  },
  dongCardText: {
    fontSize: 13,
    fontWeight: "500",
    color: lightColors.ink900,
  },
  parentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
  },
  parentRowActive: {
    borderColor: lightColors.primary,
    backgroundColor: lightColors.primary + "0F",
  },
  parentRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  parentRowText: {
    fontSize: 14,
    fontWeight: "500",
    color: lightColors.ink900,
  },
  parentRowCount: {
    fontSize: 12,
    color: lightColors.ink500,
  },
})
