/**
 * NaverMapView 워밍업 — 앱 시작 시 hidden 1×1 지도 마운트.
 *
 * 효과:
 *   - 네이티브 NaverMap 모듈이 첫 사용 전 초기화 완료 (cold start 비용 분산)
 *   - 현재 광장 중심 좌표 영역 타일을 미리 SDK 캐시에 적재
 *     → 광장 내 매물 상세 진입 시 타일 fetch 없이 즉시 paint
 *
 * 비용:
 *   - 1×1 pixel + 투명 → 화면 표시 없음
 *   - 메모리: ~5MB (Naver SDK 초기화 기본 비용)
 *   - 네트워크: 타일 몇 장 (~수십KB) 한 번
 *
 * TTL: 15초 — SDK 초기화 + 타일 캐시 적재 후 자동 unmount하여 ~5MB 회수.
 * 네이티브 SDK 초기화 상태는 프로세스 수명 동안 유지되므로 MapView를
 * unmount해도 이후 지도 화면에서 cold start 비용이 발생하지 않음.
 */

import { useEffect, useState } from "react"
import { View } from "react-native"
import { NaverMapView, hasNativeNaverMap } from "@/lib/naver-map-loader"
import { useCurrentPlaza } from "@/lib/plaza"

// 광장 중심 좌표 — 워밍업용 카메라 초기 위치.
// TODO: packages/tokens 등으로 옮겨서 single source of truth 로 관리
const PLAZA_CENTER: Record<string, { lat: number; lng: number; zoom: number }> = {
  chuncheon: { lat: 37.881, lng: 127.73, zoom: 12 },
  gangneung: { lat: 37.7519, lng: 128.8761, zoom: 12 },
  goyang: { lat: 37.6584, lng: 126.832, zoom: 12 },
  nambu: { lat: 35.1596, lng: 129.0602, zoom: 12 },
  wonju: { lat: 37.3422, lng: 127.9202, zoom: 12 },
  sokcho: { lat: 38.207, lng: 128.5918, zoom: 12 },
  donghae: { lat: 37.5247, lng: 129.1143, zoom: 12 },
  samcheok: { lat: 37.4498, lng: 129.1652, zoom: 12 },
  taebaek: { lat: 37.1641, lng: 128.9856, zoom: 12 },
  yeongwol: { lat: 37.1838, lng: 128.4617, zoom: 12 },
  jeongseon: { lat: 37.3807, lng: 128.6609, zoom: 12 },
  pyeongchang: { lat: 37.3688, lng: 128.3905, zoom: 12 },
  hongcheon: { lat: 37.6972, lng: 127.888, zoom: 12 },
  hoengseong: { lat: 37.4917, lng: 127.9847, zoom: 12 },
  yanggu: { lat: 38.1098, lng: 127.9895, zoom: 12 },
  inje: { lat: 38.0691, lng: 128.1706, zoom: 12 },
  cheolwon: { lat: 38.1467, lng: 127.3133, zoom: 12 },
  hwacheon: { lat: 38.1062, lng: 127.7082, zoom: 12 },
}
const FALLBACK_CENTER = { lat: 37.5665, lng: 126.978, zoom: 11 } // 서울 (미등록 광장 fallback)

export function NaverMapWarmup() {
  const plaza = useCurrentPlaza()
  const [active, setActive] = useState(false)

  // Mount warmup MapView after 2.5s, then unmount after 15s to reclaim ~5MB RAM.
  // The native SDK stays initialized in-process even after the View is removed.
  useEffect(() => {
    if (!hasNativeNaverMap || !NaverMapView) return
    const tStart = setTimeout(() => setActive(true), 2500)
    const tStop = setTimeout(() => setActive(false), 2500 + 15000)
    return () => {
      clearTimeout(tStart)
      clearTimeout(tStop)
    }
  }, [])

  if (!active || !NaverMapView) return null

  const center = (plaza && PLAZA_CENTER[plaza]) || FALLBACK_CENTER

  // 화면 밖에 1×1 pixel — 사용자 보이지 않음, native 마운트는 진행됨
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        left: -100,
        top: -100,
        opacity: 0,
      }}
    >
      <NaverMapView
        style={{ flex: 1 }}
        initialCamera={{ latitude: center.lat, longitude: center.lng, zoom: center.zoom }}
        isScrollGesturesEnabled={false}
        isZoomGesturesEnabled={false}
        isShowLocationButton={false}
        isShowCompass={false}
        isShowScaleBar={false}
      />
    </View>
  )
}
