# `@gwangjang/api-client`

광장 **API 클라이언트 안전** 헬퍼 — 서버 / 클라이언트 양쪽에서 사용 가능.

## ⚠️ 무엇이 들어가는가

이 패키지는 **client-safe** 코드만:
- 순수 함수 (검증, 포맷, 변환)
- 상수 / 타입
- Next.js `NextResponse` 사용 OK (edge runtime)
- ❌ Supabase server/admin client, upstash, AWS SDK 등 server-only 의존성 없음

server-only 코드 (billing/payments, moderation, ratelimit 등 16개) 는
**`apps/web/lib/services/`** 에 잔존. 이유: 보안 키, RLS 우회, 캐시 등이 apps/web 환경에 종속.

## 사용

```ts
// 모듈별
import { apiError, apiAuthRequired } from "@gwangjang/api-client/api-error"
import { validateUploadedFile, verifyFileContent } from "@gwangjang/api-client/file-validation"
import { getHeroBanners, defaultBanners, type BannerData } from "@gwangjang/api-client/hero-banners"
import { PAGE_HERO_DEFS } from "@gwangjang/api-client/page-heroes"
import type { BillingType } from "@gwangjang/api-client/billing/types"

// 배럴
import { apiError, validateUploadedFile, type BannerData } from "@gwangjang/api-client"
```

## 모듈

| 서브패스 | 책임 | 환경 |
|---|---|---|
| `/api-error` | API 라우트 에러 응답 헬퍼 (Supabase raw 에러 마스킹) | edge / server |
| `/file-validation` | 업로드 파일 MIME/byte 검증 (스푸핑 방지) | server + client |
| `/hero-banners` | 메인 배너 데이터 + getHeroBanners() 함수 | server (DB 호출) — supabase param 주입 |
| `/page-heroes` | 페이지별 히어로 정의 상수 | client |
| `/billing/types` | 결제/구독 도메인 타입 (BillingTransaction, Plan 등) | 양쪽 |

## 원칙

- 이 패키지에 추가될 수 있는 코드:
  - 순수 TS 함수 (도메인 로직)
  - 타입 정의
  - 상수
  - `NextResponse` (edge OK)
  - 함수 인자로 Supabase client 받기 (DI 패턴)
- 추가될 수 없는 코드:
  - `import "@/lib/supabase/server"` (server-only client)
  - `import "@/lib/supabase/admin"` (RLS 우회)
  - `import "@upstash/ratelimit"` (server secret)
  - `import "@aws-sdk/..."` (server secret)
  - `process.env.SUPABASE_SERVICE_ROLE_KEY` 등 server-only env

## 후속

- M8 미포함 (별도 PR 검토): `site-settings.ts` mixed 분리, `billing/index.ts` 배럴 정리
