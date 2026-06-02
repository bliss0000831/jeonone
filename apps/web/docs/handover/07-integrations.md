# 07 — 외부 연동

## 개요

광장이 의존하는 외부 SDK / API. 각 통합에 대해 환경변수, 호출 위치, 실패 시 동작, 비용 / 사용량 모니터 포인트 정리.

## Supabase

### 무엇을
- Postgres DB + Auth + Realtime + Storage(스토리지는 거의 사용 안 함, R2 우선)

### 환경변수
- `NEXT_PUBLIC_SUPABASE_URL` (필수)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (필수, RLS 적용)
- `SUPABASE_SERVICE_ROLE_KEY` 또는 `NEXT_SUPABASE_SERVICE_ROLE_KEY` (필수, RLS 우회)
- `SUPABASE_URL` (별칭, server 측 일부에서 사용)

### 클라이언트 종류
- `lib/supabase/client.ts` — browser, RLS
- `lib/supabase/server.ts` — server (cookie 세션), RLS
- `lib/supabase/admin.ts` — service-role, RLS 우회 (admin client)
- `lib/supabase/middleware.ts` — middleware 의 `updateSession`

### Realtime
- 채팅 / 알림 / 라이브 위젯에 사용
- `supabase.channel('xxx').on('postgres_changes', ...)` 패턴
- 광장 리스트 (`PlazaLiveWidget`), 채팅 (`/chat/*`)

### 실패 동작
- DB 연결 실패: `/api/health` 에서 503 반환
- Auth 만료: middleware 가 갱신 시도, 실패 시 사용자에게 다시 로그인

### 비용
- Free tier 한계: 500MB DB, 1GB 스토리지, 5GB egress / mo
- Pro: $25/mo
- 모니터: Supabase Studio > Reports

## Cloudflare R2

### 무엇을
- 매물 / 모임 / 공구 등의 이미지 / 동영상 저장 (S3-호환)
- 직접 업로드 → public URL 반환

### 환경변수
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_BASE_URL` (예: `https://pub-xxxx.r2.dev` 또는 custom domain)

### 호출 위치
- 업로드: `lib/upload-media.ts` — magic byte 검증 + R2 PUT
- 삭제 (cleanup): `lib/integrations/r2-cleanup.ts` (`deleteR2Urls(urls)`)
  - 글 삭제 / 사용자 탈퇴 시 연관 미디어 정리

### 클라이언트 SDK
- `@aws-sdk/client-s3` — R2 가 S3 호환

### 실패 동작
- 업로드 실패: 에러 토스트 + 재시도 버튼
- 삭제 실패: silently 로깅 (메인 흐름 차단 안 함, 추후 cron 으로 정리 가능)

### 비용
- Free tier: 10GB / mo
- Egress 무료 (Cloudflare 핵심 장점)
- 모니터: Cloudflare Dashboard > R2

## PortOne (구 아임포트)

### 무엇을
- 한국 PG 통합 (카드 / 계좌이체 / 카카오페이 / 토스페이 등)
- 실 결제 + 환불 + 웹훅

### 환경변수
- (광장별 채널 — `plazas` 테이블의 `portone_store_id`, `portone_channel_key`)
- `PORTONE_WEBHOOK_SECRET` (서명 검증)

### 호출 위치
- mock-pay 모드: `app/api/billing/webhook/portone/route.ts` (mock 응답), `app/api/local-food-orders/route.ts`, `app/api/group-buying-orders/route.ts`
- 실 결제 (production 적용 시): PortOne JS SDK + 웹훅

### mock-pay 모드
현재 dev 환경 기본값. `pg_provider: 'mock'`. 실제 결제 안 일어남, 흐름만 시뮬레이션.

production 에서 mock-pay 사용 차단:
```ts
if (process.env.MOCK_PAY_ENABLED !== 'true' && process.env.NODE_ENV === 'production') {
  return NextResponse.json({ error: 'mock-pay disabled in production' }, { status: 403 })
}
```

### 웹훅
PortOne → 서비스 webhook URL 호출. 서명 검증 후 결제 상태 갱신.

### 미완성 (Phase 1 연기)
- A4: 웹훅 리플레이 방지 (timestamp + nonce)

### 실패 동작
- 결제 실패: 사용자에게 안내, 주문 cancelled
- 웹훅 누락: cron 으로 PortOne API 폴링 (별도 구현 필요)

### 비용
- 월 정액 + 카드사 수수료 (~3%)
- 모니터: PortOne 콘솔

## Sentry

### 무엇을
- Next.js 에러 + 성능 모니터
- 클라이언트 / 서버 / Edge runtime 모두 캡처

### 환경변수
- `NEXT_PUBLIC_SENTRY_DSN` (client)
- `SENTRY_DSN` (server / edge)
- `SENTRY_AUTH_TOKEN` (source map 업로드, 빌드 시)
- `SENTRY_RELEASE` 또는 `VERCEL_GIT_COMMIT_SHA` (release 태그)

### 호출 위치
- `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- `next.config.mjs` 에서 `withSentryConfig` 로 wrap
- `lib/logger.ts` 에서 `logErrorWithContext` 가 자동 captureException

### 기능
- release 태깅 (어느 commit 의 에러인지)
- environment (production / preview / development)
- tracesSampleRate (production 0.05~0.1)
- 광장 tag 자동 부착 (host 분석)
- ignoreErrors (Supabase JWT 만료 등 정상 흐름 무시)

### 실패 동작
- DSN 없으면 자동 no-op (코드는 안전)
- Sentry 자체 장애 시 fail-soft

### 비용
- Free tier: 5K events/mo, 10K performance/mo
- Pro: $26/mo
- 모니터: Sentry > Stats

## 카카오 SDK

### 무엇을
- 카카오 로그인 (OAuth)
- 카카오 우편번호 popup
- 카카오 지도 일부 (메인은 네이버)

### 환경변수
- `NEXT_PUBLIC_KAKAO_APP_KEY` (또는 비슷한 클라이언트 키)
- 카카오 OAuth 시크릿 (Supabase 측 설정)

### 호출 위치
- 로그인: Supabase Auth provider
- 우편번호: 주소 입력 폼 (`<DaumPostcode />` 또는 직접)
- CSP 허용: `next.config.mjs` 의 connect-src / script-src

### 실패 동작
- 카카오 SDK 로드 실패: 일반 가입 fallback
- 팝업 차단: 사용자 안내 + 직접 입력 옵션

## 네이버 지도

### 무엇을
- 매물 지도 (목록 + 상세)
- 위경도 ↔ 주소 변환

### 환경변수
- `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`
- `NAVER_MAP_CLIENT_SECRET` (지오코딩 API 서버 호출 시)

### 호출 위치
- 매물 지도 컴포넌트 (`components/property-map-view.tsx`)
- 지오코딩: `app/api/geocode/route.ts`

### 실패 동작
- SDK 로드 실패: 지도 영역 placeholder
- 지오코딩 실패: OpenRouteService / Nominatim fallback

### 비용
- 일 호출 한도 (API 키별)
- 모니터: 네이버 클라우드 플랫폼 콘솔
- 비용 방어: `enforceRateLimit(req, 'geocode', user.id)` (분당 30)

## OpenRouteService / Nominatim

### 무엇을
- 네이버 지오코딩 fallback (한도 초과 / 장애 시)

### 환경변수
- `OPENROUTESERVICE_API_KEY` (선택)

### 호출 위치
- `app/api/geocode/route.ts` 의 fallback 분기

### 실패 동작
- 셋 다 실패하면 사용자에게 직접 입력 안내

## 한국관광공사 Tour API

### 무엇을
- 광장별 관광 이벤트 자동 동기화

### 환경변수
- `TOUR_API_KEY`

### 호출 위치
- `app/api/cron/tour-events/route.ts`
- 광장의 `tour_area_code` / `tour_sigungu_code` 를 사용해 지역별 이벤트 fetch

### 실패 동작
- API 장애 시 cron skip (다음 firing 에서 재시도)

## fal.ai

### 무엇을
- 매물 AI 비디오 생성 (사진 → 동영상 변환)

### 환경변수
- `FAL_KEY` 또는 `FAL_API_KEY`

### 호출 위치
- `app/api/ai-video/create/route.ts`
- `app/api/ai-video/webhook/route.ts` (완료 알림)

### 실패 동작
- 생성 실패: 사용자에게 환불 (포인트 / 크레딧)
- 마이그 `_ai_video_jobs_refund_flag.sql`

### 비용
- 사용량 기반. 매 비디오 생성마다 비용. 사용자 크레딧 차감.

## Toss Payments (자리만)

### 무엇을
- PortOne 외 추가 PG 옵션 (현재 미사용 / 미래 통합)

### 환경변수
- (미사용)

### CSP
- `next.config.mjs` 에 `https://js.tosspayments.com`, `https://*.toss.im` 허용 (미리 열어둠)

## Upstash Redis

### 무엇을
- Rate limit (sliding window)

### 환경변수
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

### 호출 위치
- `lib/services/ratelimit.ts`
- `enforceRateLimit(req, name, userId?)`

### 실패 동작
- env 없으면 no-op (dev/preview 안전)
- Redis 장애:
  - login/signup → fail-closed (브루트포스 방어)
  - 일반 mutation → fail-open (서비스 중단 방지)

### 비용
- Free tier: 10K commands/day
- Pay-as-you-go: 매 1K commands $0.2 정도

## Vercel Analytics

### 무엇을
- Vercel 자체 분석 (무료, 기본 페이지 뷰)

### 호출 위치
- `app/layout.tsx` 에 `<Analytics />` (production 만)

### 실패 동작
- 자동 no-op

## 통합 추가 시 체크리스트

새 외부 API / SDK 추가:

- [ ] 환경변수 명명 규칙 (`SERVICE_API_KEY` / `NEXT_PUBLIC_SERVICE_*`)
- [ ] env 누락 시 동작 (fail-soft / fail-closed)
- [ ] CSP 도메인 허용 (script-src / connect-src / frame-src)
- [ ] Rate limit (외부 API 비용 방어)
- [ ] 에러 시 fallback (대체 SDK / 안내)
- [ ] 비용 모니터 위치 명시
- [ ] `08-environment.md` 에 환경변수 추가
- [ ] 이 문서에 한 섹션 추가

## 다음 읽을 문서

- 환경변수 전수 → `08-environment.md`
- 결제 흐름 → `05-features/payments.md`
