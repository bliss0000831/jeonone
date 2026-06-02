# 01 — 아키텍처

## 개요

광장(Gwangjang)은 **한 코드베이스, N개 도메인**의 멀티테넌트 부동산 + 동네 커뮤니티 플랫폼이다. Next.js 16 App Router 기반 풀스택 SSR 앱이고, Supabase(Postgres + Auth + Realtime + Storage 일부) 가 데이터/인증의 단일 진실, Cloudflare R2 가 미디어 저장, Vercel 이 호스팅, Sentry 가 모니터링이다.

이 문서는 신규 개발자가 코드를 처음 열었을 때 "어디부터 봐야 하나"를 답한다.

## 스택

| 레이어 | 기술 | 비고 |
|---|---|---|
| 프레임워크 | Next.js 16 App Router | RSC + Client component 혼합. Turbopack dev. |
| UI | React 19 + TailwindCSS + shadcn/ui | radix-ui primitives. lucide-react 아이콘. |
| 데이터 | Supabase (Postgres) | RLS + RPC + Realtime |
| 인증 | Supabase Auth | 이메일 + 카카오 소셜 |
| 파일 | Cloudflare R2 (S3-compatible) | 매물/모임 이미지/동영상 |
| 결제 | PortOne (구 아임포트) | dev 는 mock-pay |
| 캐시 / Rate limit | Upstash Redis | sliding window |
| 모니터링 | Sentry | client / server / edge 3 config |
| 호스팅 | Vercel | preview deployment + cron |
| 패키지 | pnpm | workspace 미사용 (단일 패키지) |
| 폰트 | Noto Sans KR (next/font) | korean subset 자동 |
| 지도 | Naver Maps SDK + Kakao 우편번호 | |
| AI | fal.ai (`@fal-ai/client`) | 매물 AI 비디오 생성 |

## 폴더 구조

```
app/                      # Next.js App Router
  (auth)/                 # 로그인 / 회원가입 라우트 그룹
  (legal)/                # 약관 / 개인정보 / maintenance 라우트 그룹
  (plaza)/                # 광장(서브도메인) 라우트 그룹 — 가장 큰 영역
    chuncheon/           # 춘천 광장 진입 페이지 (sample)
    properties/          # 매물 목록
    property/[id]/       # 매물 상세
    group-buying/        # 공동구매
    clubs/               # 모임
    local-food/          # 로컬푸드
    chat/                # 채팅
    board/               # 게시판
    jobs/                # 구인구직
    interior/, moving/, cleaning/, repair/  # 서비스
    mypage/, profile/, my-properties/        # 사용자 페이지
    error.tsx, loading.tsx                  # 그룹 boundaries
  admin/                 # 광장 어드민 콘솔
  super-admin/           # 슈퍼 어드민 콘솔
  api/                   # API 라우트 (~120개)
  layout.tsx             # 루트 레이아웃 (metadata, providers)
  page.tsx               # 허브 (루트 도메인) 홈
  error.tsx, not-found.tsx
  sitemap.ts, robots.txt

components/              # 재사용 UI
  ui/                    # shadcn/ui primitives
  chat/                  # 채팅 전용
  detail/                # 상세 페이지 전용
  property-card.tsx, hero-banner-client.tsx, ...

lib/                     # 비즈니스 로직 / 헬퍼
  supabase/              # client / server / admin / middleware
  plaza/                 # 멀티-광장 헬퍼
  services/              # 도메인별 서비스
    admin-auth.ts, super-admin.ts, ratelimit.ts, notifications.ts, ...
  security/              # 보안 헬퍼 (cron-auth)
  integrations/          # 외부 SDK wrapper
  ai-video/, billing/, constants/
  logger.ts              # Sentry 연동 로거
  utils.ts, upload-media.ts, ...

supabase/
  migrations/            # 36+ 개 .sql
  config.toml

types/
  app.ts                 # DB row → UI 타입 매핑

middleware.ts            # 광장 식별 + 세션 갱신 + maintenance gate
next.config.mjs          # 보안 헤더 / image / Sentry / bundle analyzer
sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts

docs/handover/           # 이 문서들
```

### 폴더 의도

- **app/(plaza)/** — 광장 안 모든 사용자 페이지. Next 라우트 그룹은 URL 에 영향 안 줌(`/properties` 그대로). 그룹 단위 layout / error / loading boundary 가 자동 적용.
- **app/admin/** — 광장 어드민. 일반 광장과 chrome 분리. 권한 체크는 layout.tsx + 각 page.
- **app/super-admin/** — 슈퍼 어드민. 별도 인증 (PBKDF2 + TOTP).
- **app/api/** — 모든 mutation 은 여기. SSR 페이지에서 직접 Supabase 호출도 가능하지만, 비즈니스 로직(검증/RPC/외부 API)은 API 라우트로 분리.
- **components/ui/** — shadcn 패턴 (Tailwind + radix). 직접 확장 / 수정 가능.
- **lib/services/** — 도메인 헬퍼. 새 비즈니스 로직 추가 시 여기 lib 파일 만들고 라우트는 얇게 유지 권장.

## 요청 흐름

브라우저 요청 → 서버 응답까지 거치는 단계:

```
1. 브라우저: GET https://chuncheon.gwangjang.app/properties
   ↓
2. Vercel Edge → middleware.ts
   - host 분석 → 'chuncheon' 광장 ID 추출
   - MAINTENANCE_MODE 체크 → 503 / pass
   - Supabase session refresh (쿠키 갱신)
   ↓
3. Next.js App Router → app/(plaza)/properties/page.tsx
   - RSC 가 server-side 에서 Supabase 호출
   - getCurrentPlaza() 로 광장 식별
   - properties select(*) + RLS 적용
   - HTML 렌더 (스트리밍)
   ↓
4. 브라우저: 초기 HTML 받음 + JS hydration
   - Client component 활성화
   - 인터랙션 시 fetch /api/properties (필터 변경 등)
   ↓
5. 클라이언트 fetch → API 라우트 (api/properties/route.ts)
   - rate limit
   - Supabase 쿼리 + RPC
   - JSON 응답
```

## 빌드 / 배포 흐름

```
git push origin main
   ↓
Vercel Webhook 수신
   ↓
빌드 시작 (next build with Turbopack? 또는 webpack)
   - SENTRY_AUTH_TOKEN 있으면 source map 업로드
   - VERCEL_GIT_COMMIT_SHA → Sentry release 태그
   ↓
배포 → Edge / Lambda 분산
   ↓
Production URL 활성화
```

마이그레이션은 **별도 절차** — `supabase db push` 수동.

## RSC vs Client Component 경계

### RSC (기본)
- async 함수로 데이터 직접 fetch
- 파일 최상단에 `'use client'` 없음
- Supabase server client 사용
- 클라이언트로 직렬화 가능한 데이터만 props 전달

### Client Component
- `'use client'` 디렉티브
- useState / useEffect / 이벤트 핸들러 / 브라우저 API
- Supabase browser client 사용 (RLS 적용)
- realtime channel / form / 모달 / 인터랙션

### 경계 패턴
```
Server Component (page.tsx)
  → 데이터 fetch + 헤더/푸터 등 정적
  → ClientComponent 에 데이터 props 전달

ClientComponent ('use client')
  → 인터랙션 (좋아요 토글 / 모달 / form)
  → 추가 fetch 시 /api/* 호출
```

## 핵심 entry points

신규 개발자가 처음 봐야 할 파일:

| 파일 | 왜 |
|---|---|
| `middleware.ts` | 모든 요청의 첫 단계. 광장 식별 / 점검 모드. |
| `app/layout.tsx` | 루트 메타데이터 / providers / 폰트 / Sentry 초기화 트리거. |
| `lib/plaza/server.ts` | 광장 식별 헬퍼 (`getCurrentPlaza`). 거의 모든 API 라우트가 호출. |
| `lib/supabase/server.ts` | 서버용 Supabase 클라이언트. cookie 세션. |
| `lib/services/admin-auth.ts` | 권한 통합 (`checkAdminAuth`). |
| `lib/services/ratelimit.ts` | 도배 방어 (`enforceRateLimit`). |
| `app/api/properties/route.ts` | 가장 큰 도메인의 API 패턴 샘플. |
| `supabase/migrations/20260521000000_multi_plaza_foundation.sql` | 멀티-광장 토대 마이그. plazas / plaza_admins / plaza_profiles. |
| `next.config.mjs` | 보안 헤더 (CSP) / image / Sentry config. |

## 기술 결정 / 트레이드오프

### 왜 Next.js App Router?
- RSC 로 서버에서 Supabase 직접 호출 가능 → API 라우트 줄일 수 있음.
- Streaming + Suspense 로 LCP 개선.
- Sentry 통합 자연스러움.

### 왜 Supabase?
- Postgres + Auth + Realtime + Storage 통합.
- RLS 로 backend 코드 줄임.
- 한국 PaaS 대비 가격 / 문서 우수.

### 왜 R2 (Storage 분리)?
- Supabase Storage 보다 비용 저렴.
- S3 호환 → 표준 SDK.
- public URL 직접 노출 가능.

### 왜 Upstash?
- Vercel 배포 환경에서 Redis 필요 (rate limit).
- Upstash REST API → serverless 친화적.

### 왜 모놀리식 Next 앱?
- 트래픽 / 팀 규모 작음 → 마이크로서비스 오버킬.
- 향후 분할 시 도메인별 service folder 가 자연스러운 경계.

## 알아두면 좋은 패턴

### 모든 라우트에 광장 필터
`getCurrentPlaza()` → `if (plaza) q = q.eq('plaza_id', plaza)`. 까먹으면 다른 광장 데이터 노출.

### Realtime 구독
Supabase Realtime channel 로 INSERT/UPDATE 받음. 채팅, 알림 등에 사용.

### Atomic RPC 우선
TOCTOU 우려 있는 흐름은 단계별 코드 대신 RPC.

### Service-role 사용 후 권한 검증
admin client 는 RLS 우회라 위험. 라우트 위에서 명시적 권한 체크 후 사용.

## 다음 읽을 문서

- 광장 개념 → `02-multi-plaza.md`
- 권한 / RLS → `03-auth-permissions.md`
- 어떤 데이터가 어디 → `04-data-model.md`
- 새 기능 추가 → `05-features/<도메인>.md`
