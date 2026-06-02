# 08 — 환경변수 전수

## 개요

광장 운영에 필요한 모든 환경변수 + 의도 + 필수/선택 + 어디서 쓰는지. Vercel 환경변수 / `.env.local` (dev) / Supabase 콘솔 (DB 측 설정) 으로 분산되어 있음.

## 표

### Supabase (필수)

| 키 | 클라/서버 | 필수 | 의도 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 둘 다 | ✓ | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 클라이언트 | ✓ | RLS 적용 anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 | ✓ | RLS 우회 admin key |
| `NEXT_SUPABASE_SERVICE_ROLE_KEY` | 서버 | (별칭) | 위와 동일 (호환성) |
| `SUPABASE_URL` | 서버 | (별칭) | URL 별칭 |

### Cloudflare R2 (필수)

| 키 | 의도 |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare 계정 |
| `R2_ACCESS_KEY_ID` | API 키 |
| `R2_SECRET_ACCESS_KEY` | API 시크릿 |
| `R2_BUCKET_NAME` | 버킷 이름 |
| `R2_PUBLIC_BASE_URL` | public URL prefix (예: `https://pub-xxx.r2.dev`) |

### Sentry (선택, 권장)

| 키 | 클라/서버 | 의도 |
|---|---|---|
| `SENTRY_DSN` | 서버 | server / edge |
| `NEXT_PUBLIC_SENTRY_DSN` | 클라이언트 | browser |
| `SENTRY_AUTH_TOKEN` | 빌드 | source map 업로드 |
| `SENTRY_RELEASE` | 둘 다 | release 태그 (Vercel 자동 SHA 우선) |

없으면 자동 no-op.

### 카카오 / 네이버

| 키 | 의도 |
|---|---|
| `NEXT_PUBLIC_KAKAO_APP_KEY` | 카카오 SDK |
| `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID` | 네이버 지도 |
| `NAVER_MAP_CLIENT_SECRET` | 네이버 서버 API (지오코딩) |

### PortOne (production 결제 시)

| 키 | 의도 |
|---|---|
| `PORTONE_WEBHOOK_SECRET` | 웹훅 서명 검증 |

> 광장별 채널키 (`portone_store_id`, `portone_channel_key`) 는 환경변수가 아니라 **`plazas` 테이블** 에 저장. 슈퍼관리자가 `/super-admin/plaza-payments` 에서 등록.

### Cron / 보안

| 키 | 의도 |
|---|---|
| `CRON_SECRET` | Vercel cron 인증 (Bearer) |
| `SUPER_ADMIN_PASSWORD_HASH` | 슈퍼관리자 비밀번호 (PBKDF2 해시) |
| `SUPER_ADMIN_HMAC_SECRET` | 슈퍼관리자 쿠키 서명 |
| `SUPER_ADMIN_TOTP_SECRET` | 슈퍼관리자 TOTP 시크릿 (2FA) |

### Upstash Redis (선택, 권장)

| 키 | 의도 |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Redis URL |
| `UPSTASH_REDIS_REST_TOKEN` | API 토큰 |

없으면 rate limit 자동 no-op (dev 안전, production 권장).

### 운영 / 점검

| 키 | 의도 | 값 |
|---|---|---|
| `MAINTENANCE_MODE` | 점검 모드 토글 | `true` / 비어있음 |
| `MAINTENANCE_BYPASS_TOKEN` | 점검 중 운영자 우회 쿠키 토큰 | 임의 string |
| `MOCK_PAY_ENABLED` | production 에서도 mock-pay 허용 (위험) | `true` (권장 X) |

### Vercel 자동 주입

빌드 시 Vercel 이 자동으로 넣어줌:

| 키 | 의도 |
|---|---|
| `VERCEL_ENV` | `production` / `preview` / `development` |
| `VERCEL_GIT_COMMIT_SHA` | 현재 커밋 SHA |
| `VERCEL_GIT_COMMIT_REF` | 브랜치 |
| `VERCEL_URL` | 배포 URL |
| `NEXT_PUBLIC_VERCEL_ENV` | 클라이언트 노출용 |
| `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` | 클라이언트 노출용 |

### 기타 외부 API

| 키 | 의도 |
|---|---|
| `OPENROUTESERVICE_API_KEY` | 지오코딩 fallback (선택) |
| `TOUR_API_KEY` | 한국관광공사 API |
| `FAL_KEY` 또는 `FAL_API_KEY` | fal.ai (AI 비디오) |

### Site

| 키 | 의도 |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | metadataBase URL (sitemap, OG 등) |

## 환경별 권장 값

### Production
- 모든 필수 키 채움
- `MOCK_PAY_ENABLED` 비워둠 (mock 차단)
- `MAINTENANCE_MODE` 비워둠 (정상 운영)
- Sentry DSN 활성

### Preview (Vercel branch)
- production 과 동일하되 `VERCEL_ENV=preview`
- robots: noindex (자동, `app/layout.tsx` 의 robots metadata)

### Development (`.env.local`)
- Supabase URL/key (dev 프로젝트)
- R2 (선택, 미디어 업로드 테스트 시)
- Sentry, Upstash 비워둠 (no-op)
- `MOCK_PAY_ENABLED` 안 씀 (코드가 NODE_ENV 로 dev 자동 mock)

## env 누락 시 동작

### Fail-soft (없어도 OK)
- Sentry (no-op)
- Upstash (rate limit 통과)
- OpenRouteService (Nominatim fallback)
- Tour API (cron skip)
- fal.ai (AI 비디오 비활성)

### Fail-closed (없으면 깨짐)
- Supabase URL / anon key (앱 자체 안 뜸)
- Service role key (서버 액션 / admin / cron 안 됨)
- R2 (이미지 업로드 안 됨, 일부 페이지 깨짐)
- CRON_SECRET (cron 인증 통과 못 함)

### 부분 깨짐
- 카카오/네이버 키: 로그인/지도 안 됨 (다른 기능은 OK)
- PortOne: 결제만 안 됨 (mock-pay 라면 OK)

## env 회전 절차

### Supabase service role key 회전
1. Supabase Dashboard > Settings > API > Reset service_role
2. Vercel 환경변수 업데이트
3. 재배포 트리거 (Vercel 콘솔 또는 빈 commit push)

### R2 access key 회전
1. Cloudflare R2 > Manage R2 API Tokens > 새 토큰 생성
2. Vercel env 업데이트
3. 재배포
4. 이전 토큰 revoke (확인 후)

### PortOne 웹훅 시크릿
1. PortOne 콘솔 > 웹훅 > 시크릿 재발급
2. Vercel env 업데이트
3. 재배포

### Super admin password
1. PBKDF2 해시 생성 (별도 스크립트)
2. `SUPER_ADMIN_PASSWORD_HASH` 업데이트
3. 재배포
4. 새 비밀번호로 로그인 테스트

### CRON_SECRET 회전
1. 임의 문자열 생성 (32+ chars)
2. Vercel env 업데이트
3. 재배포 (cron 다음 firing 부터 새 secret)

## 보안 주의

### 절대 git 에 commit 금지
- `.env.local` 은 `.gitignore` 에 있음
- 새 env 파일 만들 때 무조건 `.gitignore` 확인

### `NEXT_PUBLIC_*` 는 클라이언트 노출됨
- 빌드 시 JS 번들에 포함 → 누구나 볼 수 있음
- 시크릿은 `NEXT_PUBLIC_` prefix 절대 X
- 공개 가능한 값만 사용 (Supabase anon key, 카카오 클라이언트 키 등)

### 슈퍼 어드민 키
- `SUPER_ADMIN_*` 는 가장 민감
- 회전 자주 (분기마다 권장)
- 누출 의심 시 즉시 회전 + 모든 super_admin cookie 무효화

### 로그 / 에러 메시지
- env 값 직접 로깅 금지
- `console.log(process.env)` 류 절대 X

## 배포 후 검증

env 변경 후:

1. `/api/health` 200 (Supabase 연결성)
2. 이미지 업로드 테스트 (R2)
3. 결제 (production 활성 시 PortOne)
4. 의도된 에러 발생 → Sentry 캡처 확인
5. 채팅 도배 시도 → rate limit 동작 (Upstash)

## 다음 읽을 문서

- 외부 SDK 별 자세한 내용 → `07-integrations.md`
- 배포 절차 → `11-deployment.md`
