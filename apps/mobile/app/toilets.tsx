/**
 * 공중화장실 — 광장 web /toilets (NearbyToilets 컴포넌트) 1:1 RN 미러.
 *
 * 동작:
 *   - 권한 요청 → expo-location 로 현재 위치 획득
 *   - GET /api/toilets?lat=..&lng=..&radius=1 (gwangjangFetch)
 *   - 거리순 정렬, 1km 이내
 *   - 마커/카드 탭 → 바텀시트 (정보 표시 + 카카오/네이버 지도 길찾기 선택)
 */

import { useCallback, useEffect, useState } from "react"
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { gwangjangFetch } from "@/lib/supabase"
import { PointsMapView, type MapPoint } from "@/components/PointsMapView"

interface Toilet {
  id: string
  name: string
  lat: number
  lng: number
  address?: string
  open24h: boolean
  openingHours?: string | null
  unisex: boolean
  hasDiaperTable: boolean
  hasDisabled?: boolean
  distance: number
}

// 화장실 SVG 마커 (web 과 동일 — 파란 핀 + 흰 원 + 화장실 픽토그램)
const TOILET_MARKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="46" viewBox="0 0 38 46"><defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-opacity="0.35"/></filter></defs><path d="M19 0 C8.5 0 0 8.3 0 18.6 C0 32 19 46 19 46 C19 46 38 32 38 18.6 C38 8.3 29.5 0 19 0 Z" fill="#2563eb" filter="url(#s)"/><circle cx="19" cy="18" r="13" fill="#ffffff"/><g transform="translate(9,8)" fill="#2563eb"><circle cx="4.5" cy="2.2" r="1.8"/><path d="M2.2 5 h4.6 v7 h-1.4 v6 h-1.8 v-6 h-1.4 z"/><circle cx="15.5" cy="2.2" r="1.8"/><path d="M12.6 12 l2.9 -7 l2.9 7 h-1.7 v6 h-2.4 v-6 z"/></g></svg>`

// Native(Naver Map) 용 — 원형 마커 + 아래 꼭지(꼬리) 추가.
function ToiletMarkerNode() {
  return (
    <View style={markerStyles.wrap}>
      <View style={markerStyles.outer}>
        <View style={markerStyles.inner}>
          <Ionicons name="people" size={18} color="#2563eb" />
        </View>
      </View>
      {/* 아래 삼각형 꼭지 */}
      <View style={markerStyles.tail} />
    </View>
  )
}

const markerStyles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    // 외부 컨테이너 크기 = NaverMapMarkerOverlay width/height 와 매칭 (iconWidth/Height)
  },
  outer: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: "#2563eb",
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 3,
    elevation: 4,
  },
  inner: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  tail: {
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 14,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#2563eb",
    marginTop: -3,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 2,
    elevation: 2,
  },
})

export default function ToiletsScreen() {
  const router = useRouter()
  const [permission, setPermission] = useState<
    "idle" | "prompting" | "granted" | "denied"
  >("idle")
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null)
  const [list, setList] = useState<Toilet[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Toilet | null>(null)
  // 지도 카메라 이동 — nonce 로 재발화 (같은 좌표 다시 눌러도 이동)
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom?: number; nonce: number } | null>(null)

  const requestLocation = useCallback(async () => {
    setPermission("prompting")
    setError(null)

    const { getFastUserLocation } = await import("@/lib/location")
    const coords = await getFastUserLocation()
    if (coords) {
      setMyLoc(coords)
      // 내 위치 기준으로 지도 센터링
      setFocus({ ...coords, zoom: 15, nonce: Date.now() })
      setPermission("granted")
    } else {
      setError("위치 정보를 가져올 수 없습니다")
      setPermission("denied")
    }
  }, [])

  // 카드 탭 → 지도 이동 + 바텀시트
  function selectToilet(t: Toilet) {
    setFocus({ lat: t.lat, lng: t.lng, zoom: 16, nonce: Date.now() })
    setSelected(t)
  }

  useEffect(() => {
    if (!myLoc) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const res = await gwangjangFetch(
          `/api/toilets?lat=${myLoc.lat}&lng=${myLoc.lng}&radius=1`,
          { cache: "no-store" } as any,
        )
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        setList((data?.toilets ?? []) as Toilet[])
      } catch {
        setError("화장실 정보를 불러오지 못했습니다")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [myLoc])

  // 카카오맵 길찾기 (외부 앱 또는 웹)
  function openKakao(t: Toilet) {
    const fromPart = myLoc ? `/from/내위치,${myLoc.lat},${myLoc.lng}` : ""
    const url = `https://map.kakao.com/link/to/${encodeURIComponent(
      t.name,
    )},${t.lat},${t.lng}${fromPart}`
    Linking.openURL(url).catch(() => {})
  }

  // 네이버 지도 길찾기 — 앱 deep link 우선 (목적지 자동 입력)
  function openNaver(t: Toilet) {
    const dname = encodeURIComponent(t.name)
    // 화장실은 도보 모드 (walk)
    const appUrl = `nmap://route/walk?dlat=${t.lat}&dlng=${t.lng}&dname=${dname}&appname=com.gwangjang.mobile`
    const webUrl = `https://map.naver.com/p/directions/-/${t.lng},${t.lat},${dname},,PLACE_POI/-/walk`
    Linking.openURL(appUrl).catch(() => {
      Linking.openURL(webUrl).catch(() => {})
    })
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.headerTitle}>내 주변 화장실</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing[4] }}>
        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Ionicons name="location" size={20} color="#2563eb" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>내 주변 화장실</Text>
            <Text style={styles.infoSub}>반경 1km 이내 공공화장실</Text>
          </View>
          {permission === "granted" && list.length > 0 && (
            <Text style={styles.countText}>{list.length}곳</Text>
          )}
        </View>

        {/* 지도 — 위치 권한 + 결과 있을 때만 */}
        {permission === "granted" && list.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <PointsMapView
              center={myLoc ? { ...myLoc, zoom: 15 } : undefined}
              myLocation={myLoc}
              focus={focus}
              points={list.map<MapPoint>((t) => ({
                id: t.id,
                lat: t.lat,
                lng: t.lng,
                title: t.name,
                color: "#2563eb",
                // Web: 파란 핀 + 흰 원 + 화장실 픽토그램 SVG (자체에 꼭지 포함)
                iconHtml: TOILET_MARKER_SVG,
                // Native: 커스텀 React View (원형 + 아래 꼭지)
                iconNode: <ToiletMarkerNode />,
                iconWidth: 38,
                iconHeight: 54, // 원 38 + 꼭지 14 + 여유
              }))}
              onMarkerPress={(id) => {
                const t = list.find((x) => x.id === id)
                if (t) selectToilet(t)
              }}
              height={300}
            />
          </View>
        )}

        {permission === "idle" && (
          <View style={styles.idleCard}>
            <View style={styles.idleIconWrap}>
              <Ionicons name="location" size={32} color="#2563eb" />
            </View>
            <Text style={styles.idleTitle}>내 위치로 근처 화장실을 찾아드려요</Text>
            <Text style={styles.idleSub}>위치 정보는 이 기기에서만 사용돼요</Text>
            <Pressable style={styles.idleBtn} onPress={requestLocation}>
              <Text style={styles.idleBtnText}>내 위치 가져오기</Text>
            </Pressable>
          </View>
        )}

        {permission === "prompting" && (
          <View style={styles.center}>
            <ActivityIndicator color="#2563eb" />
            <Text style={styles.muted}>위치 확인 중...</Text>
          </View>
        )}

        {permission === "denied" && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={20} color="#dc2626" />
            <View style={{ flex: 1 }}>
              <Text style={styles.errorTitle}>위치를 확인할 수 없습니다</Text>
              <Text style={styles.errorSub}>{error ?? ""}</Text>
              <Pressable style={styles.retryBtn} onPress={requestLocation}>
                <Text style={styles.retryBtnText}>다시 시도</Text>
              </Pressable>
            </View>
          </View>
        )}

        {permission === "granted" && (
          <>
            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator color="#2563eb" />
                <Text style={styles.muted}>화장실 검색 중...</Text>
              </View>
            ) : list.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="search" size={32} color={lightColors.ink500} />
                <Text style={styles.emptyText}>
                  반경 1km 이내에 등록된 화장실이 없어요
                </Text>
                <Text style={styles.emptySub}>
                  더 넓은 반경에서 다시 찾아보세요
                </Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {list.map((t) => (
                  <Pressable
                    key={t.id}
                    style={({ pressed }) => [
                      styles.card,
                      pressed && { opacity: 0.85 },
                    ]}
                    onPress={() => selectToilet(t)}
                  >
                    <View style={styles.cardIcon}>
                      <Ionicons name="location" size={20} color="#2563eb" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View
                        style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                      >
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {t.name}
                        </Text>
                        {t.open24h && (
                          <View style={[styles.badge, { backgroundColor: "#dcfce7" }]}>
                            <Text style={[styles.badgeText, { color: "#15803d" }]}>
                              24시간
                            </Text>
                          </View>
                        )}
                      </View>
                      {!!t.address && (
                        <Text style={styles.cardAddr} numberOfLines={1}>
                          {t.address}
                        </Text>
                      )}
                      <View style={styles.cardMeta}>
                        <Ionicons
                          name="navigate-outline"
                          size={11}
                          color={lightColors.ink500}
                        />
                        <Text style={styles.cardDistance}>
                          {(t.distance * 1000).toFixed(0)}m
                        </Text>
                        {t.hasDisabled && (
                          <>
                            <Text style={styles.dot}>·</Text>
                            <Text style={styles.cardMetaText}>장애인</Text>
                          </>
                        )}
                        {t.hasDiaperTable && (
                          <>
                            <Text style={styles.dot}>·</Text>
                            <Text style={styles.cardMetaText}>기저귀</Text>
                          </>
                        )}
                      </View>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={lightColors.ink500}
                    />
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* 바텀시트 — 웹과 동일한 UX */}
      <ToiletBottomSheet
        toilet={selected}
        onClose={() => setSelected(null)}
        onKakao={openKakao}
        onNaver={openNaver}
      />
    </SafeAreaView>
  )
}

// ====== 바텀시트 ======

function ToiletBottomSheet({
  toilet,
  onClose,
  onKakao,
  onNaver,
}: {
  toilet: Toilet | null
  onClose: () => void
  onKakao: (t: Toilet) => void
  onNaver: (t: Toilet) => void
}) {
  const open = !!toilet
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={sheetStyles.backdrop} onPress={onClose}>
        <Pressable style={sheetStyles.sheet} onPress={(e) => e.stopPropagation?.()}>
          {/* Grabber */}
          <View style={sheetStyles.grabberWrap}>
            <View style={sheetStyles.grabber} />
          </View>

          {toilet && (
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Header — 아이콘 + 이름 + 주소 + 닫기 */}
              <View style={sheetStyles.header}>
                <View style={sheetStyles.titleWrap}>
                  <View style={sheetStyles.headerIcon}>
                    <Ionicons name="location" size={20} color="#2563eb" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={sheetStyles.title}>{toilet.name}</Text>
                    {!!toilet.address && (
                      <Text style={sheetStyles.address}>{toilet.address}</Text>
                    )}
                  </View>
                </View>
                <Pressable onPress={onClose} hitSlop={8} style={sheetStyles.closeBtn}>
                  <Ionicons name="close" size={18} color={lightColors.ink900} />
                </Pressable>
              </View>

              {/* 정보 그리드 — 2x2 */}
              <View style={sheetStyles.grid}>
                <InfoTile
                  icon={<Ionicons name="time-outline" size={16} color="#2563eb" />}
                  label="개방 시간"
                  value={
                    toilet.open24h
                      ? "24시간"
                      : toilet.openingHours || "확인 필요"
                  }
                  highlight={toilet.open24h}
                />
                <InfoTile
                  icon={<Ionicons name="people-outline" size={16} color="#2563eb" />}
                  label="남녀 구분"
                  value={toilet.unisex ? "남녀공용" : "남녀분리"}
                />
                <InfoTile
                  icon={
                    <Ionicons
                      name="happy-outline"
                      size={16}
                      color="#2563eb"
                    />
                  }
                  label="기저귀 교환대"
                  value={toilet.hasDiaperTable ? "있음" : "없음"}
                  highlight={toilet.hasDiaperTable}
                />
                <InfoTile
                  icon={
                    <Ionicons
                      name="accessibility-outline"
                      size={16}
                      color="#2563eb"
                    />
                  }
                  label="장애인 화장실"
                  value={toilet.hasDisabled ? "있음" : "없음"}
                  highlight={toilet.hasDisabled}
                />
              </View>

              {/* 길찾기 버튼 — 카카오 / 네이버 */}
              <View style={sheetStyles.actions}>
                <Pressable
                  style={({ pressed }) => [
                    sheetStyles.btnKakao,
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={() => onKakao(toilet)}
                >
                  <Ionicons name="navigate" size={16} color="#ffffff" />
                  <Text style={sheetStyles.btnText}>카카오맵 길찾기</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    sheetStyles.btnNaver,
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={() => onNaver(toilet)}
                >
                  <Ionicons name="navigate" size={16} color="#ffffff" />
                  <Text style={sheetStyles.btnText}>네이버 지도</Text>
                </Pressable>
              </View>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function InfoTile({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <View
      style={[
        sheetStyles.tile,
        highlight && {
          backgroundColor: "#eff6ff",
          borderColor: "#bfdbfe",
        },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {icon}
        <Text style={sheetStyles.tileLabel}>{label}</Text>
      </View>
      <Text
        style={[
          sheetStyles.tileValue,
          highlight && { color: "#2563eb" },
        ]}
      >
        {value}
      </Text>
    </View>
  )
}

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
    paddingTop: 8,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 12,
    elevation: 12,
  },
  grabberWrap: {
    alignItems: "center",
    paddingVertical: 6,
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 999,
    backgroundColor: lightColors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 4,
    paddingBottom: 12,
  },
  titleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  address: {
    fontSize: 11,
    color: lightColors.ink500,
    marginTop: 4,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  tile: {
    flexBasis: "48%",
    flexGrow: 1,
    padding: 12,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: lightColors.border,
    gap: 6,
  },
  tileLabel: {
    fontSize: 11,
    color: lightColors.ink500,
    fontWeight: "600",
  },
  tileValue: {
    fontSize: 14,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 20,
  },
  btnKakao: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#2563eb",
  },
  btnNaver: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#10b981",
  },
  btnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
})

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    paddingHorizontal: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  iconBtn: { width: 36, height: 36, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: lightColors.ink900,
    textAlign: "center",
  },

  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    marginBottom: 16,
  },
  infoIcon: {
    width: 36, height: 36, borderRadius: 999,
    backgroundColor: "#dbeafe",
    alignItems: "center", justifyContent: "center",
  },
  infoTitle: { fontSize: 14, fontWeight: "700", color: lightColors.ink900 },
  infoSub: { fontSize: 11, color: lightColors.ink500, marginTop: 2 },
  countText: { fontSize: 13, fontWeight: "700", color: "#2563eb" },

  cta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#2563eb",
    paddingVertical: 14, borderRadius: 12,
  },
  ctaText: { color: "#ffffff", fontSize: 14, fontWeight: "700" },

  idleCard: {
    alignItems: "center",
    backgroundColor: "#eff6ff",
    borderRadius: 16,
    paddingVertical: 40,
    paddingHorizontal: 24,
    gap: 12,
  },
  idleIconWrap: {
    width: 56, height: 56, borderRadius: 999,
    backgroundColor: "#ffffff",
    alignItems: "center", justifyContent: "center",
  },
  idleTitle: {
    fontSize: 14, fontWeight: "700", color: lightColors.ink900,
    textAlign: "center",
  },
  idleSub: {
    fontSize: 11, color: lightColors.ink500,
    textAlign: "center",
  },
  idleBtn: {
    paddingHorizontal: 24, paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#2563eb",
    marginTop: 8,
  },
  idleBtnText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },

  center: { alignItems: "center", paddingVertical: 40, gap: 8 },
  muted: { fontSize: 12, color: lightColors.ink500 },

  errorCard: {
    flexDirection: "row", gap: 12,
    padding: 16, borderRadius: 12,
    backgroundColor: "#fef2f2",
    borderWidth: 1, borderColor: "rgba(220,38,38,0.2)",
  },
  errorTitle: { fontSize: 14, fontWeight: "700", color: "#991b1b" },
  errorSub: { fontSize: 12, color: "#7f1d1d", marginTop: 4 },
  retryBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#dc2626",
  },
  retryBtnText: { color: "#ffffff", fontSize: 13, fontWeight: "600" },

  empty: {
    alignItems: "center", paddingVertical: 60, gap: 8,
    backgroundColor: "#f8fafc", borderRadius: 12,
  },
  emptyText: { fontSize: 14, color: lightColors.ink900, fontWeight: "600" },
  emptySub: { fontSize: 12, color: lightColors.ink500 },

  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1, borderColor: lightColors.border,
  },
  cardIcon: {
    width: 36, height: 36, borderRadius: 999,
    backgroundColor: "#dbeafe",
    alignItems: "center", justifyContent: "center",
  },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: "700", color: lightColors.ink900 },
  cardAddr: { fontSize: 11, color: lightColors.ink500, marginTop: 2 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  cardDistance: { fontSize: 11, fontWeight: "600", color: "#2563eb" },
  cardMetaText: { fontSize: 11, color: lightColors.ink500 },
  dot: { fontSize: 11, color: lightColors.ink500 },

  badge: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: { fontSize: 9, fontWeight: "800" },
})
