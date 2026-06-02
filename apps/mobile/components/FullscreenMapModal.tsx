/**
 * FullscreenMapModal — 풀스크린 동적 지도 모달.
 *
 * 디테일 페이지의 "지도 보기" 버튼이 호출. 같은 좌표를 MapPrewarmer 가
 * 백그라운드로 워밍해뒀으면 SDK 디스크 캐시 hit 으로 그리드 없이 즉시 표시.
 *
 * 마커 + 일반/위성 토글 + 닫기 버튼.
 */

import { useState } from "react"
import { Modal, Pressable, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Ionicons } from "@expo/vector-icons"
import {
  NaverMapView,
  NaverMapMarkerOverlay,
  hasNativeNaverMap,
} from "@/lib/naver-map-loader"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"

interface Props {
  visible: boolean
  onClose: () => void
  lat: number
  lng: number
  /** 마커 캡션 (제목/주소). 비어있으면 마커만 표시. */
  title?: string
  /** 줌 (기본 15 — MapPrewarmer 와 동일하게 두면 캐시 hit) */
  zoom?: number
}

export function FullscreenMapModal({
  visible,
  onClose,
  lat,
  lng,
  title,
  zoom = 15,
}: Props) {
  // 위성 지도 토글 비활성화 — 성능 테스트
  // const [satellite, setSatellite] = useState(false)

  // native SDK 없으면 안내만
  if (!hasNativeNaverMap || !NaverMapView) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <SafeAreaView style={styles.container} edges={["top"]}>
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={26} color={lightColors.ink900} />
            </Pressable>
            <Text style={styles.headerTitle}>지도</Text>
            <View style={{ width: 36 }} />
          </View>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: lightColors.ink500 }}>
              지도 보기는 앱 최신 버전에서 표시됩니다.
            </Text>
          </View>
        </SafeAreaView>
      </Modal>
    )
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
            <Ionicons name="close" size={26} color={lightColors.ink900} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title || "지도"}
          </Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={{ flex: 1, position: "relative" }}>
          <NaverMapView
            style={{ flex: 1 }}
            initialCamera={{ latitude: lat, longitude: lng, zoom }}
            mapType="Basic"
            isShowZoomControls
            isScrollGesturesEnabled
            isZoomGesturesEnabled
            isTiltGesturesEnabled
            isRotateGesturesEnabled
            isShowLocationButton={false}
            isShowCompass={false}
            isShowScaleBar={false}
          >
            <NaverMapMarkerOverlay
              latitude={lat}
              longitude={lng}
            />
          </NaverMapView>

          {/* 위성/일반 토글 — 성능 테스트로 임시 제거 */}
        </View>
      </SafeAreaView>
    </Modal>
  )
}

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
  closeBtn: { padding: 6, width: 36 },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  satelliteBtn: {
    position: "absolute",
    top: spacing[3],
    right: spacing[3],
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: lightColors.border,
  },
  satelliteBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: lightColors.ink900,
  },
})
