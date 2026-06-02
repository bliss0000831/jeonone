# `@gwangjang/platform`

광장 **플랫폼 추상화 레이어** — web / Capacitor / RN 환경별 분기를 단일 API 로.

## 사용

```ts
// 배럴 (가장 흔한 사용법)
import { storage, share, impactLight, openExternal } from "@gwangjang/platform"

// 딥 임포트 (특정 모듈만 필요한 경우 — 번들 절감)
import { isNativeSync } from "@gwangjang/platform/platform"
import { impactLight } from "@gwangjang/platform/haptics"
```

## 모듈 가이드

| 서브패스 | 책임 | web fallback | Capacitor | RN (예정) |
|---|---|---|---|---|
| `/platform` | 환경 감지 | `typeof window` | `Capacitor.getPlatform()` | `Platform.OS` |
| `/storage` | KV 저장 | `localStorage` | `Preferences` | `AsyncStorage` |
| `/camera` | 카메라/갤러리 | `<input type=file>` | `Camera` | `expo-image-picker` |
| `/share` | OS 공유 시트 | `Web Share` | `Share` | RN `Share` |
| `/network` | 연결 상태 | `navigator.onLine` | `Network` | `NetInfo` |
| `/haptics` | 진동 | `Vibration API` | `Haptics` | `expo-haptics` |
| `/browser` | 외부 링크 | `window.open` | `Browser` | `Linking` |
| `/push` | 푸시 알림 | Web Push | `PushNotifications` | FCM |
| `/app-lifecycle` | 앱 상태/백버튼 | `visibilitychange` | `App` | `AppState` |

## 원칙 (변경 금지)

- 이 패키지는 **도메인 의존성 0** (auth/property/chat 등 features 모름).
- features / services / components 는 이 패키지를 사용 OK.
- 반대 방향 의존 금지 (RN 이전 시 단방향만 옮기면 됨).

## RN 마이그레이션 (Phase 2)

각 모듈에 `*.native.ts` 추가 → React Native 가 자동 우선 픽업:
```
src/
├── storage.ts          ← web/Capacitor
├── storage.native.ts   ← React Native (Phase 2 신규)
```
