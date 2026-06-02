/**
 * Naver Maps 네이티브 모듈 안전 로더.
 *
 * @mj-studio/react-native-naver-map 은 native 전용이라 web (react-native-web)
 * 환경에서 import 시 `codegenNativeComponent is not a function` 으로 크래시.
 * Platform 체크 + try/catch 로 web 에서 안전하게 null 반환.
 *
 * 사용:
 *   import { NaverMapView, NaverMapMarkerOverlay } from "@/lib/naver-map-loader"
 *   if (!NaverMapView) return <FallbackUI />
 *   <NaverMapView ... />
 */

import { Platform } from "react-native"

let _NaverMapView: any = null
let _NaverMapMarkerOverlay: any = null

if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require("@mj-studio/react-native-naver-map")
    _NaverMapView = m.NaverMapView
    _NaverMapMarkerOverlay = m.NaverMapMarkerOverlay
  } catch {
    /* native 모듈 미설치(이전 APK 등) — fallback UI 사용 */
  }
}

export const NaverMapView = _NaverMapView
export const NaverMapMarkerOverlay = _NaverMapMarkerOverlay
// 모듈 사용 가능 여부 플래그 — 부모 컴포넌트가 분기에 사용
export const hasNativeNaverMap = !!_NaverMapView
// 타입은 type-only import 라 web 에서도 안전
export type { NaverMapViewRef } from "@mj-studio/react-native-naver-map"
