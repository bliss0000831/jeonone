# `@gwangjang/types`

광장 **전역 공유 TypeScript 타입**. 순수 타입만 — 런타임 코드 0.

## 사용

```ts
import type { Property, DbProperty } from "@gwangjang/types/app"
import type { SearchCategory } from "@gwangjang/types/search"

// 또는 배럴:
import type { Property, SearchCategory } from "@gwangjang/types"
```

## 모듈

| 서브패스 | 책임 |
|---|---|
| `/app` | Property, DbProperty, Review, SellerType, TransactionType 등 광장 핵심 도메인 |
| `/search` | SearchCategory, SearchFilter 등 통합 검색 타입 |

## 원칙

- **순수 타입만**. interface/type/enum 만 export — 런타임 코드 X.
- 의존성 0 (모든 환경에서 사용 가능 — web/RN/Node).
- 도메인 로직은 `@gwangjang/features`, native 추상화는 `@gwangjang/platform`.
