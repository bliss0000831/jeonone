# `packages/` — 모노레포 공유 패키지 자리

이 디렉토리는 **M4~M9 단계에서 점진적으로 채워질 공유 패키지** 자리입니다.

현재 (M2 단계) 상태:
- 빈 placeholder
- 어떤 패키지도 아직 생성되지 않음

계획된 패키지 (M4~M9):

| 패키지 | M | 출처 | 역할 |
|---|---|---|---|
| `platform` ✅ | M4 (완료) | `apps/web/lib/native/` → `packages/platform/src/` | Capacitor / RN 환경 추상화 |
| `features` ✅ | M5 (완료) | `apps/web/lib/features/` → `packages/features/src/` | 도메인 비즈니스 로직 (auth, chat, property…) |
| `types` ✅ | M6 (완료) | `apps/web/types/` → `packages/types/src/` | TS 공유 타입 |
| `tokens` ✅ | M7 (완료) | `apps/web/app/globals.css` 동일값을 TS 객체로 (RN 용) | 디자인 토큰 (color, typography, spacing, radius, shadows) |
| `api-client` ✅ | M8 (완료) | `apps/web/lib/services/` 의 client-safe 5개 → `packages/api-client/src/` (api-error, file-validation, hero-banners, page-heroes, billing/types). server-only 16개는 apps/web 잔존. | client-safe 헬퍼 + 타입 |
| `auth` ✅ | M9 (완료) | 카카오 로그인 추상화 (옵션 1 — 최소). web 구현은 Supabase OAuth 그대로, native 는 Phase 2 placeholder. apps/web login + sign-up 2곳 호출 교체. | Web/Native 인증 분기 |

각 패키지는 PR 단위로 추출되며, 추출 완료 시 위 표에서 항목이 제거됩니다.
