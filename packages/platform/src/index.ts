/**
 * lib/native — 환경 추상화 레이어 (web ↔ Capacitor)
 *
 * 사용처:
 *   import { storage, share, impactLight, openExternal } from '@/lib/native'
 *
 * 원칙 (ESLint 강제):
 *   - 이 레이어는 features / services / components / app 모르게.
 *   - native 모듈이 도메인 의존성 가지면 RN 등 다른 환경 이전 어려워짐.
 *
 * 모듈 가이드:
 *   platform.ts       — 환경 감지 (web / ios / android)
 *   storage.ts        — KV 저장 (localStorage ↔ Preferences)
 *   camera.ts         — 카메라 / 갤러리 (file input ↔ Camera)
 *   share.ts          — 공유 시트 (Web Share ↔ Share)
 *   network.ts        — 연결 상태 (navigator.onLine ↔ Network)
 *   haptics.ts        — 진동 / 햅틱 (Vibration ↔ Haptics)
 *   browser.ts        — 외부 링크 (window.open ↔ Browser)
 *   push.ts           — 푸시 알림 (Web Push ↔ Push Notifications)
 *   app-lifecycle.ts  — 앱 상태 (visibility ↔ App)
 */

export { getPlatform, isNative, isWeb, isNativeSync } from './platform'
export { storage } from './storage'
export {
  pickImage,
  pickImages,
  type PickImageOptions,
  type PickedImage,
  type ImageSource,
} from './camera'
export { share, copyToClipboard, type ShareOptions } from './share'
export {
  getNetworkStatus,
  onNetworkChange,
  type NetworkStatus,
  type NetworkListener,
} from './network'
export {
  impact,
  impactLight,
  impactMedium,
  impactHeavy,
  notification as hapticNotification,
  selection as hapticSelection,
  type ImpactStyle,
  type NotificationType,
} from './haptics'
export { openExternal, closeBrowser, type OpenOptions } from './browser'
export {
  getPushPermission,
  requestAndRegister,
  onPushReceived,
  unregister as unregisterPush,
  type PermissionState,
  type PushToken,
  type PushPayload,
  type PushHandler,
} from './push'
export {
  onAppStateChange,
  onBackButton,
  onDeepLink,
  minimizeApp,
  type AppStateListener,
} from './app-lifecycle'
