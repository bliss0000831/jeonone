# `apps/mobile`

광장 RN 하이브리드 앱 — Expo SDK 54 + Expo Router + WebView.

## 목적

| 영역 | 처리 |
|---|---|
| 홈 / 매물 / 게시판 / 모든 광장 라우트 | **WebView** (https://www.gwangjang.app live URL) |
| 채팅 (Phase 2B) | **RN native** UI (Supabase Realtime 직접) |
| 마이페이지 (Phase 2B) | **RN native** UI |

→ 80% 의 광장 페이지는 web 그대로 재사용. 채팅/마이만 RN 으로 다시 만들어 앱 체험 향상.

## 구조

```
apps/mobile/
├── app/                          ← Expo Router (file-based)
│   ├── (tabs)/
│   │   ├── _layout.tsx           ← Bottom Tab Navigator (3개)
│   │   ├── index.tsx             ← 홈 — 광장 사이트 WebView
│   │   ├── chat.tsx              ← 채팅 placeholder (Phase 2B)
│   │   └── mypage.tsx            ← 마이 placeholder (Phase 2B)
│   ├── _layout.tsx               ← Root layout (Stack + Theme)
│   ├── modal.tsx                 ← 기본 모달
│   └── +not-found.tsx
├── components/
│   ├── WebViewContainer.tsx      ← 광장 사이트 WebView 래퍼
│   └── ...                        (Expo 기본)
├── assets/                       ← 아이콘 / 스플래시 (Expo 기본)
├── app.json                      ← Expo 설정 (name=광장, scheme=gwangjang)
├── metro.config.js               ← 모노레포 워크스페이스 + symlink 해석
├── package.json
└── tsconfig.json                 ← extends expo/tsconfig.base
```

## 모노레포 통합

- workspace 의존: `@gwangjang/platform`, `@gwangjang/tokens`, `@gwangjang/types`
- Metro `metro.config.js` 가 `watchFolders` + `nodeModulesPaths` 로 monorepo root 해석
- `disableHierarchicalLookup: true` — pnpm 의 strict symlink 정확히 작동

## 개발 시작

루트에서:

```bash
pnpm install                # 한 번
pnpm mobile:tunnel          # 권장 — ngrok 통해 PC↔폰 인터넷만 있으면 OK
# 또는 PC↔폰 같은 Wi-Fi:
pnpm mobile:lan
```

폰 (Android) 측:

1. **Play Store** 에서 **Expo Go** 설치
2. Expo Go 실행 → "Scan QR code"
3. PC 터미널의 QR 스캔 → 광장 앱 실행

## 의존성 호환성

| 패키지 | 버전 | 비고 |
|---|---|---|
| Expo SDK | ~54.0.33 | React 19 + RN 0.81 native 지원 |
| Expo Router | ~6.0.23 | typedRoutes 활성 |
| react-native-webview | 13.15.0 | SDK 54 호환 |
| expo-secure-store | ~15.0.7 | Phase 2 카카오 토큰 저장용 |

## Phase 2 로드맵

- **2A** (이번 PR): 부트스트랩 — WebView + Tab navigator + tokens 검증
- **2B**: RN 채팅 — `@gwangjang/features/chat` placeholder API 채우기 + Supabase Realtime + 메시지 UI
- **2C**: RN 마이페이지 — Supabase Auth 세션 + 프로필/찜/판매내역 UI
- **2D**: 카카오 native 로그인 — `@gwangjang/auth/kakao.native` 채우기 + 세션 동기화 API
- **2E**: EAS Build — APK/AAB → Internal Testing
