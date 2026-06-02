/**
 * MapPrewarmer — 보이지 않는 NaverMapView 를 화면 밖에 마운트해서
 * SDK 디스크 캐시에 타일을 미리 채워두는 컴포넌트.
 *
 * 사용 패턴:
 *   디테일 페이지 진입 시 정적 PNG 만 표시하고, 백그라운드로 이 워머를
 *   마운트. 사용자가 본문/사진을 읽는 동안 NaverMap 이 onInitialized 되고
 *   타일을 fetch 해 디스크 캐시에 적재. 사용자가 "지도 보기" 모달을 열 때
 *   같은 좌표 NaverMapView 가 디스크 캐시에서 즉시 렌더 → 그리드 안 보임.
 *
 * 왜 1×1 이 아닌가:
 *   SDK 가 "보이지 않는 뷰" 최적화로 타일 fetch 를 skip 할 수 있어서, 정상
 *   크기로 화면 밖에 두는 게 안전. top: -10000 으로 완전히 가려도 SDK 입장에선
 *   "정상 크기 + 위치 있음" 으로 보임.
 *
 * 언마운트:
 *   onInitialized 콜백 후 1.5초 더 두고 자동 언마운트 (타일 캐시 적재 여유).
 *   사용자가 모달 열기 전에 일찍 끄면 메모리 절약.
 */

import { memo, useEffect, useMemo, useState } from "react"
import { View } from "react-native"
import { NaverMapView, hasNativeNaverMap } from "@/lib/naver-map-loader"

interface Props {
  lat: number
  lng: number
  /** 디테일에서 실제 보여줄 줌 레벨과 동일하게 (기본 15 — AddressMapPreview 와 동일) */
  zoom?: number
  /** 워머 자동 언마운트까지 ms (기본 4초). 모달이 4초 안에 열려도 SDK 캐시는 공유됨. */
  unmountAfterMs?: number
  /** disabled — 부모가 끄고 싶을 때 */
  enabled?: boolean
}

export const MapPrewarmer = memo(function MapPrewarmer({
  lat,
  lng,
  zoom = 15,
  unmountAfterMs = 4000,
  enabled = true,
}: Props) {
  const [alive, setAlive] = useState(true)

  // 타이머 — 자동 언마운트
  useEffect(() => {
    if (!enabled) return
    const t = setTimeout(() => setAlive(false), unmountAfterMs)
    return () => clearTimeout(t)
  }, [enabled, unmountAfterMs, lat, lng])

  const camera = useMemo(
    () => ({ latitude: lat, longitude: lng, zoom }),
    [lat, lng, zoom],
  )

  if (!enabled || !alive) return null
  if (!hasNativeNaverMap || !NaverMapView) return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        // 화면 밖으로 완전히 밀어내되 SDK 가 "보이는 뷰" 로 인식하도록 정상 크기 유지
        top: -10000,
        left: 0,
        width: 320,
        height: 200,
        opacity: 0,
      }}
    >
      <NaverMapView
        style={{ width: 320, height: 200 }}
        initialCamera={camera}
        isScrollGesturesEnabled={false}
        isZoomGesturesEnabled={false}
        isTiltGesturesEnabled={false}
        isRotateGesturesEnabled={false}
        isShowLocationButton={false}
        isShowCompass={false}
        isShowScaleBar={false}
        isShowZoomControls={false}
        // 백그라운드 워밍이라 TextureView 불필요 (보이지도 않음)
      />
    </View>
  )
})
