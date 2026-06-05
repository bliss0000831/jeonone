/**
 * AddressMapPreview (RN) — 광장 web AddressMapPreview 1:1 미러.
 *
 * 주소 입력 → /api/geocode/naver 호출 → 좌표 확보 시 작은 Naver 지도 미리보기.
 * 부모 form 의 lat/lng state 를 onCoordsResolved 콜백으로 갱신.
 *
 * 사용:
 *   <AddressMapPreview
 *     address={address}
 *     onCoordsResolved={(c) => setCoords(c)}
 *     height={220}
 *   />
 */

import { memo, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native"
import { Image as ExpoImage } from "expo-image"
import AsyncStorage from "@react-native-async-storage/async-storage"
import {
  NaverMapView,
  NaverMapMarkerOverlay,
  hasNativeNaverMap,
} from "@/lib/naver-map-loader"
import { getSupabase } from "@/lib/supabase"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { MapPrewarmer } from "@/components/MapPrewarmer"
import { FullscreenMapModal } from "@/components/FullscreenMapModal"

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ?? "https://jeonwondiary.vercel.app"

// 영구 캐시 키 prefix — 한번 geocode 한 주소는 앱 재실행해도 캐시.
const PERSIST_PREFIX = "geocode:v1:"
async function loadPersistCache(addr: string): Promise<{ lat: number; lng: number } | null | undefined> {
  try {
    const v = await AsyncStorage.getItem(PERSIST_PREFIX + addr)
    if (!v) return undefined
    if (v === "fail") return null
    const j = JSON.parse(v)
    if (typeof j?.lat === "number" && typeof j?.lng === "number") return j
  } catch {}
  return undefined
}
async function savePersistCache(addr: string, c: { lat: number; lng: number } | null): Promise<void> {
  try {
    await AsyncStorage.setItem(PERSIST_PREFIX + addr, c ? JSON.stringify(c) : "fail")
  } catch {}
}

interface Props {
  address: string
  onCoordsResolved?: (coords: { lat: number; lng: number } | null) => void
  height?: number
  /** 지도 드래그/줌/회전 활성화 (default: false — 미리보기 모드) */
  interactive?: boolean
  /** "지도에 정확히 표시됩니다" 체크마크 라벨 숨김 (default: false) */
  hideOkBadge?: boolean
  /** DB 에 저장된 좌표가 있으면 geocode 호출 없이 즉시 표시 */
  initialLat?: number | null
  initialLng?: number | null
  /**
   * 첫 geocode 성공 시 DB 에 lat/lng 를 backfill 할 대상 (옛 글 자동 보정).
   * 두 번째 진입부터 initialLat/Lng 로 즉시 표시 → 지도 늦게 뜨는 현상 제거.
   * 미지정이면 backfill 안 함 (등록 form 등).
   */
  persistTo?: { table: string; id: string | null | undefined }
  /**
   * 정적 PNG 만 표시하고 우측 하단 "지도 보기" 버튼으로 토글 (default: false).
   * true 면 interactive 와 무관하게 사용자 탭 전까진 정적만. 부동산 외 도메인
   * (홈즈/중고/나눔/모임/구인/신장개업) 에서 사용.
   */
  manualNaverToggle?: boolean
}

// 모듈 캐시 — 같은 주소 재진입 시 geocode 호출 스킵 (앱 세션 동안 유지)
const GEOCODE_CACHE: Record<string, { lat: number; lng: number } | null> = {}

export function AddressMapPreview({
  address,
  onCoordsResolved,
  height = 220,
  interactive = false,
  hideOkBadge = false,
  initialLat,
  initialLng,
  persistTo,
  manualNaverToggle = false,
}: Props) {
  const hasInitial =
    typeof initialLat === "number" &&
    typeof initialLng === "number" &&
    Number.isFinite(initialLat) &&
    Number.isFinite(initialLng)
  const [state, setState] = useState<"idle" | "loading" | "ok" | "fail">(
    hasInitial ? "ok" : "idle",
  )
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    hasInitial ? { lat: initialLat as number, lng: initialLng as number } : null,
  )
  const reqIdRef = useRef(0)
  const lastAddrRef = useRef<string>("")

  useEffect(() => {
    const addr = address.trim()
    // DB 좌표가 있으면 geocode 스킵 — 즉시 표시.
    if (hasInitial && state === "ok") return
    if (!addr) {
      setState("idle")
      setCoords(null)
      onCoordsResolved?.(null)
      lastAddrRef.current = ""
      return
    }
    if (addr === lastAddrRef.current) return
    lastAddrRef.current = addr

    // 모듈 캐시 hit → 즉시 표시 (네트워크 호출 X)
    if (addr in GEOCODE_CACHE) {
      const c = GEOCODE_CACHE[addr]
      if (c) {
        setState("ok")
        setCoords(c)
        onCoordsResolved?.(c)
      } else {
        setState("fail")
        setCoords(null)
        onCoordsResolved?.(null)
      }
      return
    }

    const reqId = ++reqIdRef.current
    setState("loading")

    const done = (c: { lat: number; lng: number } | null) => {
      if (reqId !== reqIdRef.current) return
      GEOCODE_CACHE[addr] = c
      void savePersistCache(addr, c)
      if (c) {
        setState("ok")
        setCoords(c)
        onCoordsResolved?.(c)
      } else {
        setState("fail")
        setCoords(null)
        onCoordsResolved?.(null)
      }
    }

    let cancelled = false
    ;(async () => {
      // 1) 영구 캐시 hit — 앱 재실행 후에도 즉시 표시.
      const cached = await loadPersistCache(addr)
      if (cancelled || reqId !== reqIdRef.current) return
      if (cached !== undefined) {
        GEOCODE_CACHE[addr] = cached
        done(cached)
        return
      }
      // 2) 네트워크 fetch — 영구 캐시에 결과 저장.
      try {
        const res = await fetch(
          `${API_BASE}/api/geocode/naver?address=${encodeURIComponent(addr)}`,
        )
        if (cancelled || reqId !== reqIdRef.current) return
        if (!res.ok) return done(null)
        const data = await res.json()
        if (typeof data?.lat === "number" && typeof data?.lng === "number") {
          const c = { lat: data.lat, lng: data.lng }
          // 옛 글 자동 backfill — 다음 진입부터 initialLat/Lng 로 즉시 표시
          // (fire-and-forget — 실패해도 사용자 경험엔 영향 없음)
          if (persistTo?.table && persistTo?.id) {
            void getSupabase()
              .from(persistTo.table)
              .update({ lat: c.lat, lng: c.lng })
              .eq("id", persistTo.id)
              .then((res: any) => {
                if (res?.error) {
                  // 컬럼 없음 등 — 무시 (해당 테이블이 lat/lng 미지원)
                }
              })
          }
          return done(c)
        }
        return done(null)
      } catch {
        return done(null)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  if (state === "idle") {
    return (
      <View style={styles.idleBox}>
        <Ionicons name="location-outline" size={14} color={lightColors.ink500} />
        <Text style={styles.idleText}>주소를 선택하면 지도 미리보기가 표시됩니다</Text>
      </View>
    )
  }
  if (state === "loading") {
    return (
      <View style={styles.idleBox}>
        <ActivityIndicator size="small" color={lightColors.ink500} />
        <Text style={styles.idleText}>주소 확인 중...</Text>
      </View>
    )
  }
  if (state === "fail") {
    return (
      <View style={styles.failBox}>
        <Ionicons name="warning-outline" size={16} color="#b45309" />
        <View style={{ flex: 1 }}>
          <Text style={styles.failTitle}>이 주소로는 지도가 표시되지 않을 수 있어요</Text>
          <Text style={styles.failBody}>
            신축·번지 누락 등일 수 있습니다. 등록은 가능하지만 상세 페이지 지도에 핀이 표시되지 않을 수 있습니다.
          </Text>
        </View>
      </View>
    )
  }
  return (
    <View style={{ gap: spacing[2] }}>
      {!hideOkBadge && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="checkmark-circle" size={16} color="#059669" />
          <Text style={styles.okText}>지도에 정확히 표시됩니다</Text>
        </View>
      )}
      {coords && (
        <MiniMap
          lat={coords.lat}
          lng={coords.lng}
          address={address}
          height={height}
          interactive={interactive}
          manualNaverToggle={manualNaverToggle}
        />
      )}
    </View>
  )
}

// React.memo — 부모(property/[id] 등) 가 useFocusEffect 로 매 포커스마다 re-render
// 되어도, 같은 lat/lng/height/interactive 조합이면 NaverMapView 재마운트 안 함.
// 매 진입 시 네이티브 지도 재초기화로 타일 다시 받느라 느려지던 회귀 방지.
const MiniMap = memo(function MiniMap({
  lat,
  lng,
  address,
  height,
  interactive = false,
  manualNaverToggle = false,
}: {
  lat: number
  lng: number
  address: string
  height: number
  interactive?: boolean
  manualNaverToggle?: boolean
}) {
  // 위성/일반 토글 상태 (interactive 모드 전용)
  const [satellite, setSatellite] = useState(false)
  // 🅲 정책:
  //   - interactive=true (등록/수정 폼) : 인라인 동적 NaverMap 자동 마운트, 정적 PNG 가 위에서 덮음.
  //   - manualNaverToggle=true (디테일 페이지) : 인라인 마운트 없음. MapPrewarmer 백그라운드 워밍 +
  //     "지도 보기" 버튼 탭 시 FullscreenMapModal 오픈. 같은 좌표 NaverMapView 가 SDK 디스크 캐시
  //     hit 으로 그리드 없이 즉시 표시.
  const [imgFailed, setImgFailed] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  // 🅲 manualNaverToggle 모드 — 풀스크린 모달 오픈 상태
  const [modalOpen, setModalOpen] = useState(false)
  // 🅲 디버그 ms 측정 — 그리드 원인 진단 (interactive 전용)
  const mountTimeRef = useRef(Date.now())
  const [dbg, setDbg] = useState<{ init?: number; idle?: number }>({})
  // lat/lng 바뀌면 상태 리셋
  useEffect(() => {
    setMapReady(false)
    setModalOpen(false)
    mountTimeRef.current = Date.now()
    setDbg({})
  }, [lat, lng])
  // 인라인 NaverMap 마운트 조건:
  //  - manualNaverToggle 모드: 인라인 NaverMap 안 씀 (모달로 대체)
  //  - 그 외 interactive 모드: 자동 마운트 (정적 PNG 가 위에서 덮음)
  //  - 정적 실패 시: fallback 으로 NaverMap
  const shouldMountNaver = manualNaverToggle ? false : interactive
  const showNaver = (shouldMountNaver && hasNativeNaverMap && NaverMapView) || imgFailed
  // 정적 PNG URL — Naver Static Maps API 프록시 (우리 CDN 30일 캐시)
  // View 의 실제 aspect ratio 에 맞춰 정적·동적 시각적 차이 최소화.
  const winWidth = useWindowDimensions().width
  // 좌우 padding 24px (spacing[3]*2) 가정 — 실제 매물 detail 의 컨테이너 폭과 거의 일치
  const staticW = Math.round(winWidth - 24)
  const staticMapUrl = `${API_BASE}/api/static-map?lat=${lat}&lng=${lng}&w=${staticW}&h=${height}&level=15`
  // 정적 → 동적 fade transition (250ms)
  const fadeAnim = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (mapReady) {
      Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start()
    } else {
      fadeAnim.setValue(1)
    }
  }, [mapReady, fadeAnim])
  // 정적 PNG 는 imgFailed 아니면 항상 마운트, fadeAnim 으로 visibility 제어
  // initialCamera stable reference
  const initialCamera = useMemo(
    () => ({ latitude: lat, longitude: lng, zoom: 15 }),
    [lat, lng],
  )

  return (
    <View style={[styles.mapBox, { height }]}>
      {/* NaverMapView — 백그라운드 마운트. TextureView 로 정적 PNG 가 위에서 정상 덮이도록. */}
      {showNaver && (
        <NaverMapView
          style={{ flex: 1 }}
          initialCamera={initialCamera}
          mapType={satellite ? "Hybrid" : "Basic"}
          isShowZoomControls={interactive}
          isScrollGesturesEnabled={interactive}
          isZoomGesturesEnabled={interactive}
          isTiltGesturesEnabled={interactive}
          isRotateGesturesEnabled={interactive}
          isShowLocationButton={false}
          isShowCompass={false}
          isShowScaleBar={false}
          // 정적 PNG 가 RN view tree 위에 정상 합성되도록 TextureView 사용.
          // 첫 프레임 ~200ms 추가되지만 그 시간 동안 정적 PNG 가 가리므로 사용자 무관.
          isUseTextureViewAndroid
          onInitialized={() => {
            setDbg((d) => ({ ...d, init: Date.now() - mountTimeRef.current }))
            // 🅲 정적 가림 제거 — dns-prefetch + warmup 효과 측정용. SDK init 즉시 노출.
            setMapReady(true)
          }}
          onCameraIdle={() => {
            setDbg((d) => (d.idle ? d : { ...d, idle: Date.now() - mountTimeRef.current }))
          }}
        >
          <NaverMapMarkerOverlay latitude={lat} longitude={lng} />
        </NaverMapView>
      )}
      {/* 정적 PNG 오버레이 — NaverMap 위에 깔려 그리드 차단.
          mapReady 시 250ms fade out → 시각적 연속성. pointerEvents="none" → 터치 통과. */}
      {!imgFailed && (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill as any, { opacity: fadeAnim }]}
        >
          <ExpoImage
            source={{ uri: staticMapUrl }}
            onError={() => setImgFailed(true)}
            style={StyleSheet.absoluteFill as any}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
            recyclingKey={`${lat},${lng}`}
          />
        </Animated.View>
      )}
      {/* native 미지원 fallback — 정적 PNG 도 실패한 경우만 표시 */}
      {(!hasNativeNaverMap || !NaverMapView) && imgFailed && (
        <View style={[StyleSheet.absoluteFill as any, { alignItems: "center", justifyContent: "center" }]}>
          <Text style={styles.failTitle}>지도 미리보기는 앱 최신 버전에서 표시됩니다</Text>
        </View>
      )}
      {/* 🅲 디버그 ms 오버레이 — 좌상단. 측정 끝나면 제거. */}
      {interactive && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            backgroundColor: "rgba(0,0,0,0.75)",
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 6,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 11, fontFamily: "monospace" }}>
            init:{dbg.init ?? "-"} idle:{dbg.idle ?? "-"}
          </Text>
        </View>
      )}
      {interactive && (
        <Pressable
          onPress={() => {
            // 위성 모드 토글 — 정적 PNG 가 가리고 있다면 즉시 NaverMap 표시
            // (정적은 위성 모드 미지원이라 사용자가 위성 누르면 진짜 지도 봐야 함)
            setSatellite((v) => !v)
            setMapReady(true)
          }}
          hitSlop={8}
          style={({ pressed }) => [
            styles.satelliteBtn,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons
            name={satellite ? "map" : "earth"}
            size={14}
            color={lightColors.ink900}
          />
          <Text style={styles.satelliteBtnText}>
            {satellite ? "일반 지도" : "위성 지도"}
          </Text>
        </Pressable>
      )}
      {/* "지도 보기" 버튼 — manualNaverToggle 모드. 풀스크린 모달 오픈. */}
      {manualNaverToggle && !imgFailed && (
        <Pressable
          onPress={() => setModalOpen(true)}
          hitSlop={8}
          style={({ pressed }) => [
            styles.mapToggleBtn,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons name="map" size={14} color="#ffffff" />
          <Text style={styles.mapToggleBtnText}>지도 보기</Text>
        </Pressable>
      )}

      {/* 🅲 백그라운드 타일 워머 — 사용자가 본문/사진 읽는 동안 SDK 디스크 캐시 적재.
          modalOpen 되면 unmount (모달 안에서 같은 좌표 마운트하므로 중복 불요). */}
      {manualNaverToggle && !modalOpen && (
        <MapPrewarmer lat={lat} lng={lng} zoom={15} />
      )}

      {/* 풀스크린 동적 지도 — "지도 보기" 탭 시 오픈 */}
      {manualNaverToggle && (
        <FullscreenMapModal
          visible={modalOpen}
          onClose={() => setModalOpen(false)}
          lat={lat}
          lng={lng}
          title={address}
          zoom={15}
        />
      )}
    </View>
  )
})

const styles = StyleSheet.create({
  idleBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2] + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderStyle: "dashed",
    backgroundColor: lightColors.muted,
  },
  idleText: { fontSize: fontSize.sm, color: lightColors.ink500 },
  failBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2] + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#fcd34d",
    backgroundColor: "#fffbeb",
  },
  failTitle: { fontSize: fontSize.sm, fontWeight: "600", color: "#92400e" },
  failBody: { fontSize: 11, color: "#92400e", opacity: 0.85, marginTop: 2 },
  okText: { fontSize: fontSize.sm, color: "#047857" },
  mapBox: {
    width: "100%",
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: "#f1f5f9",
    position: "relative",
  },
  satelliteBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.95)",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  satelliteBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  // "지도 보기" 토글 — 우측 하단
  mapToggleBtn: {
    position: "absolute",
    bottom: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: lightColors.primary,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  mapToggleBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
})
