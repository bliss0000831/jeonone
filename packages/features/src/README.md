# lib/features — 도메인별 비즈니스 로직 레이어

UI(컴포넌트) 와 분리된 도메인 로직. 컴포넌트는 features 의 hook / fetcher 호출만 한다.

## 구조 (각 도메인)

```
lib/features/<domain>/
  api.ts          # Supabase 호출 / fetch 래퍼
  validators.ts   # 입력 검증 (Zod 또는 plain function)
  formatters.ts   # 표시용 변환 (가격 / 날짜 / 라벨)
  hooks.ts        # React hooks (useFoo, useFoos)
  types.ts        # 도메인 타입 정의
  index.ts        # barrel export — 컴포넌트는 이것만 import
```

## 의존 규칙 (ESLint 강제)

- ✅ features → lib/native (환경 추상화 사용 OK)
- ✅ features → lib/services (점진 이전 중)
- ✅ features → types/app.ts
- ❌ features → components/* (UI 의존 금지 — 한 방향만)
- ❌ features → app/* (라우트 의존 금지)

## 컴포넌트 측 사용 예

```tsx
// ❌ 안 좋음 — 비즈니스 로직이 컴포넌트에 박힘
function PropertyCard({ property }) {
  const formatPrice = (p) => {
    if (p >= 10000) {
      const uk = Math.floor(p / 10000)
      // 50줄 ...
    }
  }
  return <div>{formatPrice(property.price)}</div>
}

// ✅ 좋음 — formatter 분리
import { formatPropertyPrice } from '@/lib/features/property'

function PropertyCard({ property }) {
  return <div>{formatPropertyPrice(property)}</div>
}
```

## 신규 도메인 추가 절차

1. 디렉터리 생성 — `lib/features/<domain>/`
2. types.ts 부터 (다른 모듈이 import 함)
3. validators.ts → api.ts → formatters.ts → hooks.ts 순서
4. index.ts barrel export
5. 기존 컴포넌트의 비즈니스 로직 점진 이동

## 점진 이전 가이드 (services → features)

`lib/services/` 의 도메인 헬퍼는 시간이 지나면서 features 로 이동:

| 현재 (services) | 이동 후 (features) |
|---|---|
| `lib/services/notifications.ts` | `lib/features/notifications/api.ts` |
| `lib/services/billing/points.ts` | `lib/features/points/api.ts` |
| `lib/services/admin-auth.ts` | `lib/features/auth/admin.ts` |
| `lib/services/super-admin.ts` | `lib/features/auth/super-admin.ts` |
| `lib/services/ratelimit.ts` | (인프라 — services 유지 또는 lib/security/) |

이전은 한 번에 X. PR 별로 한 도메인씩.
