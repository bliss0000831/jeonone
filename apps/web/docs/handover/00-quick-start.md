# 00 — Quick Start (신규 개발자 30분 가이드)

## 개요

이 문서는 **광장(Gwangjang)** 프로젝트에 처음 합류한 개발자가 30분 안에 로컬에서 dev 서버를 띄우고 첫 PR 까지 보낼 수 있도록 만든 손에 잡히는 가이드다. 광장은 한국형 멀티테넌트 부동산 + 동네 커뮤니티 플랫폼이고, 멀티-광장(서브도메인) / 슈퍼어드민 콘솔 / Supabase RLS / Cloudflare R2 업로드 / Upstash Rate limit / Sentry 같은 외부 의존이 한꺼번에 물려 있어서, 환경변수 누락 한 줄로 절반의 기능이 조용히 죽는 경우가 많다. 무엇이 필수이고 무엇이 옵션인지부터 짚는다.

`docs/handover/01-architecture.md` 와 짝으로 읽으면 전체 그림이 잡힌다.

---

## 1. 저장소 클론 + 의존성 설치

```bash
# 1) 클론
git clone <repo-url> gwangjang
cd gwangjang

# 2) Node 22 권장 (package.json 의 @types/node ^22)
node -v   # v22.x 이상

# 3) pnpm 사용 — pnpm-lock.yaml 이 source of truth
corepack enable
corepack prepare pnpm@latest --activate
pnpm install
```

**주의**:

- npm / yarn 으로 install 하지 말 것 — lockfile 충돌 + Next.js 16 + React 19 의존성 트리가 깨진다.
- 처음 install 시 `sharp` 네이티브 빌드가 1~2분 걸린다 (이미지 변환용, R2 업로드 시 사용).

---

## 2. 환경변수 (`.env.local`)

루트에 `.env.local` 을 만든다. **굵게 표시된 변수는 없으면 앱이 제대로 안 돈다.**

### 필수 (없으면 깨짐)

```bash
# Supabase — 모든 데이터/인증의 출발점
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # admin/cron/업로드 등 RLS 우회용

# 사이트 URL (광장 헤더, 메타데이터, OAuth callback)
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`SUPABASE_SERVICE_ROLE_KEY` 는 RLS 를 우회하므로 **절대 클라이언트로 흘러서는 안 된다** (`NEXT_PUBLIC_` 접두사 금지). `lib/supabase/admin.ts` 의 `createAdminClient()` 만 이 키를 사용한다.

### 선택 (없으면 해당 기능만 죽음)

```bash
# Cloudflare R2 (이미지/동영상 업로드) — 없으면 업로드 API 가 500
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=gwangjang
R2_PUBLIC_URL=https://pub-xxxx.r2.dev

# Upstash Redis (rate limit) — 없으면 lib/services/ratelimit.ts 가 항상 통과 (no-op)
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

# Sentry (에러 모니터링) — DSN 없으면 lib/logger.ts 자동 no-op
NEXT_PUBLIC_SENTRY_DSN=...
SENTRY_AUTH_TOKEN=...     # 빌드 타임 source map 업로드용

# 슈퍼어드민 콘솔 (gwangjang.app/admin) — 없으면 dev 폴백 활성, prod 에선 로그인 차단
SUPER_ADMIN_ID=...
SUPER_ADMIN_PASSWORD_HASH=pbkdf2$100000$<saltHex>$<hashHex>
SUPER_ADMIN_SECRET=<랜덤 64자>
SUPER_ADMIN_TOTP_SECRET=...   # (선택) 2FA 활성화

# 카카오 OAuth + 네이버 지도/지오코딩
NEXT_PUBLIC_KAKAO_JS_KEY=...
NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=...
NAVER_GEOCODE_CLIENT_ID=...
NAVER_GEOCODE_CLIENT_SECRET=...

# 토스페이먼츠
TOSS_SECRET_KEY=...
NEXT_PUBLIC_TOSS_CLIENT_KEY=...

# 점검 모드
MAINTENANCE_MODE=false             # true 로 바꾸면 모든 요청이 503/maintenance
MAINTENANCE_BYPASS_TOKEN=...       # 슈퍼관리자 우회 쿠키 검증용
```

자세한 변수표는 `01-architecture.md` 의 "환경변수 카탈로그" 섹션 참고.

### 처음 띄울 때 환경변수 최소 셋

```bash
# 가장 빨리 뭔가 뜨는 걸 보고 싶다면 — Supabase URL / anon / service-role 만 있어도 됨.
# 업로드/결제/SMS 같은 기능은 죽지만 홈 + 게시판 + 매물 보기는 동작.
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

---

## 3. dev 서버 실행

```bash
pnpm dev
# → http://localhost:3000 (Turbopack, Next.js 16)
```

처음 실행 시 Turbopack 이 워밍업 하느라 30~60초 걸린다. 이후엔 HMR 빠름.

### VSCode debug

`.claude/launch.json` 에 두 가지 구성이 박혀 있다.

- `Next.js Dev` — 일반
- `Next.js Dev (maintenance)` — `MAINTENANCE_MODE=true` 로 띄워 점검 페이지 동작 확인

### 광장 도메인 테스트 (개발용)

`localhost:3000` 은 기본적으로 **허브** (전국 광장 지도) 로 진입한다. 특정 광장으로 들어가려면 두 가지 방법:

1. **쿼리 스트링**: `http://localhost:3000/?plaza=chuncheon` — `dev-plaza` 쿠키가 자동 세팅 → 다음 페이지부터 그 광장으로 인식.
2. **쿠키 클리어**: `?plaza=` 또는 `?plaza=hub` 로 다시 방문 → 허브로 돌아감.

코드 위치: `lib/supabase/middleware.ts:24-42` 의 `setDevPlazaCookie` 블록.

또는 hosts 파일에 `127.0.0.1 chuncheon.localhost` 추가 후 `http://chuncheon.localhost:3000` 으로 접근해도 된다 (`lib/plaza/config.ts:107` 의 `cleanHost.split('.')[0]` 로직 참고).

---

## 4. 첫 PR 까지 워크플로

```bash
# 1) 최신 main 동기화
git checkout main
git pull --rebase

# 2) 기능 브랜치 생성 — Claude 가 만든 worktree 가 아니라면 자유 네이밍
git checkout -b feat/<짧은-이름>

# 3) 변경 후 lint 만 확인 (typecheck 는 next build 에 포함됨)
pnpm lint

# 4) 커밋 — 한국어 OK, 기능 페이즈 prefix 권장 (feat/fix/security/polish/docs)
git commit -m "feat(board): 게시판 핫글 슬라이드 추가"

# 5) push + PR
git push -u origin HEAD
gh pr create --fill   # 또는 GitHub 웹에서
```

### PR 머지 → 자동 배포

`main` 브랜치 머지 시 Vercel 이 자동 빌드/배포한다. preview deploy 는 PR 단위로 별도 URL 생성.

### 코드 리뷰 체크리스트 (PR 전 자가검증)

- [ ] `app/api/**/route.ts` 추가/변경했다면: auth → rate limit → 검증 → 비즈니스 순서 (`13-coding-conventions.md` §"API 라우트 표준" 참고).
- [ ] Supabase `from('xxx').select()` 에 광장 필터 `.eq('plaza_id', plaza)` 가 들어갔는지 (`02-multi-plaza.md` §"격리 의무").
- [ ] error handling 이 Supabase raw error 를 클라로 흘리지 않는지 (`lib/services/api-error.ts` 의 `apiError()` 사용).
- [ ] 마이그레이션 파일은 `BEGIN/COMMIT` 으로 감싸고 `IF NOT EXISTS` + 끝에 `NOTIFY pgrst, 'reload schema'` (`13-coding-conventions.md` §"마이그레이션").

---

## 5. IDE 추천 설정 (VSCode)

`.vscode/extensions.json` 이 따로 없으니 다음을 직접 설치 권장:

| 확장 | 이유 |
|---|---|
| **ESLint** (dbaeumer.vscode-eslint) | `pnpm lint` 와 동일 룰을 IDE 인라인으로 표시. |
| **Tailwind CSS IntelliSense** | Tailwind v4 + 사용자 정의 `globals.css` 토큰 자동완성. |
| **Prisma** / **PostgreSQL** | `supabase/migrations/*.sql` syntax highlight. |
| **TypeScript Nightly** | Next.js 16 + React 19 의 새 타입(use, RSC 등) 지원. |
| **Error Lens** | inline error 강조 — 보안 누락 코드 한눈에. |
| **GitLens** | RLS / 권한 코드의 변경 이력 추적 (보안 코드는 blame 자주 봄). |

`tsconfig.json` 의 path alias `@/*` 가 모든 import 의 기준이다. relative path (`../../lib/...`) 보다 `@/lib/...` 으로 쓰는 게 컨벤션.

---

## 6. 코드 수정 시 어떤 파일을 먼저 보면 되나

### 데이터/인증의 입구

| 파일 | 역할 |
|---|---|
| `middleware.ts` | 모든 요청의 1차 관문. 점검 모드 차단, 슈퍼어드민 rewrite. |
| `lib/supabase/middleware.ts` | host → `x-plaza` 헤더 주입, dev-plaza 쿠키, /admin 인증 강제, 점검 모드. |
| `lib/supabase/server.ts` | 서버 컴포넌트/라우트핸들러용 supabase 클라이언트 (`createClient()`). |
| `lib/supabase/client.ts` | 브라우저용 supabase 클라이언트 (싱글톤). |
| `lib/supabase/admin.ts` | service-role 키 — RLS 우회 (`createAdminClient()`). |
| `lib/plaza/server.ts` | `getCurrentPlaza()`, `requirePlaza()` — 서버에서 광장 ID 읽기. |
| `lib/plaza/client.ts` | `getCurrentPlazaClient()`, `buildPlazaUrl()` — 클라에서 광장 처리. |
| `lib/plaza/config.ts` | `KNOWN_PLAZAS`, `HUB_HOSTNAMES`, `plazaFromHost()`. |
| `lib/services/admin-auth.ts` | `checkAdminAuth()`, `canAccessPlaza()` — 어드민 권한 통합 체크. |
| `lib/services/super-admin.ts` | 슈퍼어드민 PBKDF2 + HMAC + TOTP. |
| `lib/services/ratelimit.ts` | Upstash 기반 sliding-window rate limit. |
| `lib/services/api-error.ts` | `apiError()`, `apiAuthRequired()`, `apiForbidden()` — 표준 에러 응답. |
| `lib/logger.ts` | `devLog`, `logErrorWithContext` — Sentry 자동 연동. |

### 페이지/라우트 입구

| 경로 | 역할 |
|---|---|
| `app/layout.tsx` | 모든 페이지의 RootLayout. metadata, theme provider, footer. |
| `app/page.tsx` | "/" — 허브면 `<HubLanding />`, 광장이면 `<HomePage />`. |
| `app/(plaza)/...` | 광장(서브도메인) 전용 라우트 그룹. board / properties / chat / clubs ... |
| `app/(auth)/auth/...` | 로그인 / 가입 / 콜백 / 비번 변경. |
| `app/admin/...` | 광장 어드민 콘솔 (광장 서브도메인의 /admin). |
| `app/super-admin/...` | 허브의 슈퍼어드민 콘솔 (gwangjang.app/admin → rewrite). |
| `app/plaza-admin/page.tsx` | 광장 어드민 진입 분기 페이지. |
| `app/api/...` | REST API. 도메인별 폴더 (board, properties, payments, ...). |

### 빌드/배포 설정

| 파일 | 역할 |
|---|---|
| `next.config.mjs` | CSP / HSTS / Sentry / image remotePatterns / bundle analyzer. |
| `vercel.json` | Vercel 빌드/cron 설정. |
| `instrumentation.ts` | Next.js 16 instrumentation hook (Sentry init). |
| `sentry.{client,server,edge}.config.ts` | Sentry init 분기. |

---

## 주의점 (첫날 흔한 함정)

1. **`pnpm install` 후 `pnpm dev` 가 hang 함** — Windows 라면 antivirus 실시간 감시가 `.next` 캐시 충돌 일으킬 때 있음. `.next` 폴더를 antivirus exclusion 에 추가.
2. **Supabase 로그인 안 됨** — `NEXT_PUBLIC_SUPABASE_URL` 이 `https://` 로 시작하는지 확인. 끝에 `/` 붙이면 안 됨.
3. **광장 진입했는데 데이터가 안 보임** — 그 광장에 `plaza_profiles` row 가 없으면 본인 계정이 그 광장 미가입 상태. SQL 로 가입 추가 (`MULTI_PLAZA_HANDOFF.md` §4 참고) 또는 다른 계정으로 로그인.
4. **`/admin` 진입 시 무조건 로그인 페이지로 튕김** — 광장 어드민 권한이 본인 계정에 없음. `plaza_admins` 테이블에 본인 user_id + plaza_id + role 등록 필요.
5. **`pnpm dev` 켜놓고 마이그레이션 실행** — 스키마 캐시 stale. SQL 끝에 `NOTIFY pgrst, 'reload schema';` 가 있는지 확인하거나 dev 재시작.
6. **Sentry source map 업로드 실패로 빌드가 느림** — `SENTRY_AUTH_TOKEN` 없을 땐 `next.config.mjs:106` 의 `silent: !process.env.SENTRY_AUTH_TOKEN` 이 켜져 자동으로 조용해짐. 그래도 느리면 `SENTRY_DSN` 도 빼고 빌드 (then sentry wrapper 자체 skip — `next.config.mjs:120-122`).

---

## 확장 시 — "어디부터 봐야 하나"

| 추가하려는 것 | 출발 파일 |
|---|---|
| 새 페이지 (광장 라우트) | `app/(plaza)/<도메인>/page.tsx` 생성. `getCurrentPlaza()` + `.eq('plaza_id', plaza)` 필수. |
| 새 API 라우트 | `app/api/<도메인>/route.ts` — 표준 패턴은 `13-coding-conventions.md` §"API 라우트". |
| 새 광장 활성화 | `lib/plaza/config.ts` 의 `ACTIVE_PLAZAS` 에 추가 + DB `plazas` 테이블 `is_active=true`. |
| 새 어드민 권한 | `lib/services/admin-auth.ts` 에 헬퍼 추가, `plaza_admins.role` 값 정의. |
| 새 외부 통합 | `lib/integrations/<provider>.ts` (kakao.ts, naver-maps.ts, r2.ts 처럼). |
| 새 마이그레이션 | `supabase/migrations/<YYYYMMDDHHMMSS>_<설명>.sql` — `13-coding-conventions.md` §"마이그레이션". |
