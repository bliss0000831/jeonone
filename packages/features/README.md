# `@gwangjang/features`

광장 **도메인 비즈니스 로직** — UI 와 분리. 컴포넌트는 이 패키지의 hook / fetcher 만 호출.

## 사용

```ts
// 배럴
import { Property, PropertyFilter } from "@gwangjang/features/property"
import { useCurrentUser, type AuthProfile } from "@gwangjang/features/auth"
import { type ChatRoom, type Message } from "@gwangjang/features/chat"
```

## 도메인

| 서브패스 | 책임 | 상태 |
|---|---|---|
| `/auth` | 사용자 프로필, 권한, 역할/계정타입 검증 | ✅ 활성 |
| `/property` | 매물 타입, 필터, 입력 스키마 | ✅ 활성 |
| `/chat` | 채팅방/메시지 타입 | ⚠️ `api.ts` placeholder (Phase 2 RN 채팅 구현 시 채움) |
| `/clubs` | 동호회 (스캐폴드) | 🟡 미사용 |
| `/group-buying` | 공동구매 (스캐폴드) | 🟡 미사용 |

각 도메인은 `types.ts / api.ts / hooks.ts / validators.ts / formatters.ts` 표준 구조.
세부는 `src/README.md` 참고.

## 원칙

- 이 패키지는 **컴포넌트 / Next.js 라우터 의존성 0** (RN 에서도 동일하게 사용 가능해야 함).
- `@gwangjang/platform` 사용 OK (storage 등).
- React hooks 사용 OK (`hooks.ts`).
- 반대로 컴포넌트가 features 사용 OK, 그 반대는 X.

## 임시 사항 (M6 에서 정리 예정)

`property/types.ts` 가 `@/types/app` import — apps/web 의 path alias.
M5 한정으로 tsconfig.paths 에서 cross-package 매핑 임시 허용.
M6 에서 `apps/web/types/app.ts` 를 `@gwangjang/types` 로 이동하면 자연스럽게 정리.
