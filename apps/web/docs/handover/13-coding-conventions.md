# 13 — 코딩 컨벤션 / 패턴 가이드

> 이 코드베이스에서 반복적으로 적용된 패턴을 정리. 신규 PR 작성 시 같은 패턴을 따르면 리뷰 통과 빠르고 다른 사람이 읽기 쉽다.

## 언어 / 네이밍

### 한국어 vs 영어
- **주석**: 한국어 OK (한국 팀 / 한국 사용자 대상). 외국인 협업 시작하면 영어 전환 검토.
- **변수 / 함수**: 영어. camelCase (TS/JS), snake_case (DB).
- **commit 메시지**: 한국어 OK. `phase-1 day1-2: RLS 강화 5건` 같은 prefix 컨벤션 사용 중.
- **PR 제목**: 한국어 OK. 짧게 (70자 이내).
- **에러 메시지 (사용자 노출)**: 한국어 (예: `"잘못된 요청"`, `"권한이 없습니다"`).
- **로그 / Sentry 태그**: 영어.

### 파일 네이밍
- 컴포넌트: kebab-case `property-card.tsx`. PascalCase 파일명도 허용되나 신규는 kebab-case 통일.
- 유틸 / lib: kebab-case `cron-auth.ts`.
- 타입: 단일 어휘면 `types/app.ts`. 도메인별 분리 시 `types/property.ts` 등.
- 마이그레이션: `YYYYMMDDhhmmss_snake_case_description.sql`.

### Export
- 컴포넌트는 **named export** 우선 (`export function PropertyCard`). default export 는 페이지 컴포넌트 / Next 요구 위치 (`page.tsx`, `layout.tsx`, `error.tsx`, `loading.tsx`)만.
- 헬퍼 함수도 named export.

## API 라우트 구조

### 표준 순서
모든 mutation 라우트(POST/PATCH/DELETE)는 다음 순서 준수:

```ts
export async function POST(request: NextRequest) {
  // 1. 라우트 매개변수 추출 (있으면)
  const { id } = await params

  // 2. 인증
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })

  // 3. Rate limit (도배 방어)
  const limited = await enforceRateLimit(request, 'mutate', user.id)
  if (limited) return limited

  // 4. 권한 검증 (광장 격리 / role 체크)
  const plaza = await getCurrentPlaza()
  // ...

  // 5. 입력 검증 (body parse + 길이/범위/타입)
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 })
  // ...

  // 6. 비즈니스 로직
  // ...

  // 7. 응답
  return NextResponse.json({ ok: true, ... })
}
```

### Rate Limit
- `lib/services/ratelimit.ts` 의 `enforceRateLimit(req, name, userId?)` 사용.
- LimitName: `comment` (분당 10) / `mutate` (분당 30) / `post` (10분당 10) / `login` (분당 5, fail-closed) 등.
- 새 라우트 추가 시 적절한 limit 선택. 모를 땐 `mutate`.
- 익명 허용 라우트는 userId 생략 → IP 기반 식별.

### 에러 응답
- **Status code**: 401 (인증) / 403 (권한) / 400 (입력) / 404 (없음) / 409 (충돌) / 429 (rate limit) / 500 (서버).
- **에러 메시지**: 한국어 사용자 친화 메시지. **`error.message` 직접 노출 금지** (DB schema / 서버 path 누출 위험).
- 패턴:
  ```ts
  if (error) {
    logErrorWithContext("[route name]", error, { userId: user.id })
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }
  ```

### 광장 격리
- **모든** 콘텐츠 조회/수정 시 `plaza_id` 필터 의무.
- 패턴:
  ```ts
  const plaza = await getCurrentPlaza()
  let q: any = supabase.from("properties").select("*").eq("id", id)
  if (plaza) q = q.eq("plaza_id", plaza)
  ```
- 슈퍼관리자/legacy super 만 cross-plaza 허용. `canAccessPlaza(auth, postPlaza)` 헬퍼 사용.

## Supabase 쿼리 패턴

### 클라이언트 종류
- **Browser**: `lib/supabase/client.ts` 의 `createClient()` — RLS 적용. 클라이언트 컴포넌트 / 첫 페이지 fetch 후속.
- **Server**: `lib/supabase/server.ts` 의 `createClient()` — cookie 세션 인지. 서버 컴포넌트 / API 라우트.
- **Admin (service-role)**: `lib/supabase/admin.ts` 의 `createAdminClient()` — RLS 우회. **명시적 권한 검증 후에만** 사용.

### Select 컬럼 명시
- 가급적 `select('*')` 회피. 필요한 컬럼만 명시 → 네트워크 / JSON 비용 절감.
- 예외: `properties` 라우트는 `DbProperty` 타입 매핑 때문에 `*` 사용 (의도적, 코멘트 명시).
- 새 라우트는 명시 권장.

### maybeSingle vs single
- **single**: 0건이면 에러. 정확히 1건만 기대할 때.
- **maybeSingle**: 0건 = null 반환. 권장 (검증 실수 방지).

### 멀티 select 패턴
- `Promise.all([sb1, sb2, sb3])` 으로 병렬화. 페이지 로드 시간 큰 영향.

### RPC 호출
- 동시성 / 트랜잭션 필요 시 RPC 사용 (`club_join_atomic`, `points_spend_atomic` 등).
- 응답: `{ ok: boolean, error?, ... }` 패턴 통일.
- service-role 또는 authenticated 권한 필요. `GRANT EXECUTE` 명시.

## 마이그레이션 작성

### 파일 구조
```sql
-- ============================================================================
-- 제목 (무엇을 변경)
--
-- 배경: 왜 이 마이그가 필요한가
-- 동작: 어떤 변경 (테이블 / 컬럼 / 트리거 / RLS)
-- Rollback:
--   <SQL 명령>
-- ============================================================================

BEGIN;

-- 변경 SQL ...

NOTIFY pgrst, 'reload schema';

COMMIT;
```

### 안전한 변경
- `ADD COLUMN IF NOT EXISTS` (재실행 안전).
- `CREATE TABLE IF NOT EXISTS`.
- `CREATE INDEX IF NOT EXISTS`.
- `CREATE OR REPLACE FUNCTION`.
- `DROP TRIGGER IF EXISTS … BEFORE CREATE`.

### 위험한 변경
- `DROP COLUMN` / `DROP TABLE` — 데이터 손실. 별도 PR + production 전 backup 권장.
- `ALTER COLUMN ... NOT NULL` — 기존 NULL 행 있으면 실패. 먼저 default + UPDATE.
- `ALTER COLUMN TYPE` — 캐스팅 가능한지 확인.
- 결제 관련 컬럼 추가 / 변경 — 컬럼 동결 트리거(local_food_orders) 검토.

### NOTIFY pgrst
PostgREST (Supabase) 가 schema 캐시를 다시 로드하게. 컬럼/타입/RPC 변경 시 필수.

### 시점 (filename)
- 새 마이그는 현재 가장 큰 timestamp + 1. Conflict 방지.
- 같은 PR 안 여러 마이그면 `20260621000001`, `20260621000002` 식으로 sequential.

## TypeScript

### Type vs Interface
- 둘 다 OK. interface 가 확장(extends) 자연스러우니 객체 모양은 interface 선호.
- Union / mapped 타입은 type.

### any 사용
- 가급적 회피. `unknown` + type narrowing 우선.
- Supabase 쿼리 결과는 종종 `any` 사용 (RLS 변환 등 런타임 변동) — 의도적 OK.
- DB row 변환 후엔 명시적 타입 (`DbProperty`).

### type assertion
- `as` 사용 시 한 번 더 검증. 무차별 `as any` 금지.
- `(post as any).plaza_id` 같은 패턴은 Supabase 결과 typing 우회용 — 짧게 유지.

### 비동기
- Top-level await 가능 (Next 16 RSC). 페이지 컴포넌트는 `async function Page()`.
- `Promise<{ id: string }>` 같은 promise params (Next 15+ 변화).

## React 컴포넌트

### Client / Server 경계
- 기본 = Server Component (RSC). `useState` / `useEffect` / 이벤트 핸들러 필요 시 `"use client"`.
- Server → Client props 는 직렬화 가능해야 (함수 / Date 객체 X, primitives / plain objects 만).
- 두 컴포넌트로 분리하는 게 깔끔: `XxxServer.tsx` (fetch) → `XxxClient.tsx` (인터랙션).

### useEffect 의존성
- 빈 배열은 mount 1회. 외부 변수 사용 시 dependency 명시.
- ESLint react-hooks/exhaustive-deps 규칙 켜져있는지 확인.

### 폼
- 단순 form은 useState. 복잡하면 react-hook-form 도입 고려.
- 제출 시 disabled 처리 + sending state 표시.
- toast 사용 (sonner) — alert() 가급적 회피 (요즘 표준 X).

### 라우팅
- `useRouter().push()` 보다 `<Link>` prefer (prefetch).
- 페이지 진입 시 `router.push(...)` 대신 `redirect(...)` (서버) 권장.
- `router.refresh()` — 서버 컴포넌트 다시 fetch (RSC 캐시 갱신). `window.location.reload()` 대신 사용.

## 보안 패턴

### 권한 체크 순서
1. 인증 (auth.getUser)
2. Rate limit
3. 역할/권한 (role / plaza_admins)
4. 자원 소유권 (post.user_id === user.id)
5. cross-plaza 차단

### 검증할 입력
- 길이 (`.slice(0, 500)` 같은 cap).
- 범위 (number range).
- 화이트리스트 (enum-like 값들 — `account_type` / `status` 등).
- 컨트롤 문자 / HTML 위험 문자 sanitize (regex).
- 파일 업로드: magic byte + 확장자 + 크기.

### 비밀 정보
- `console.log(user)` 금지 (토큰/이메일 누출).
- `error.message` 사용자 노출 금지.
- DB error 의 `code` 만 분기 (예: `23505` UNIQUE).

## 로깅

### 단계별 로거
- `devLog(...)` — dev 환경에서만 출력. console.log 대체.
- `devWarn(...)` — dev 환경 warn.
- `logError(err)` — production 도 출력 + Error 인스턴스면 Sentry 자동 캡처.
- `logErrorWithContext(msg, err, ctx)` — Sentry 에 명시적 tag/extra. 라우트 / cron / 백그라운드 작업에서 권장.

### 패턴
```ts
import { logErrorWithContext } from "@/lib/logger"

try {
  // ...
} catch (err) {
  logErrorWithContext("[route name] action", err, {
    userId: user.id,
    route: "/api/foo",
  })
  return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
}
```

## Git / Commit

### Commit 메시지 형식
- prefix 사용 (phase-1 / phase-2 / fix / ux 등).
- 한국어 본문 OK.
- 다단계 변경은 bullet list 로.
- 마지막 줄에 `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` (AI 협업 표기).

예:
```
phase-1 day1-2: RLS/권한 강화 5건 (A5/A8/A3/A6/A7)

- A5 expert-invitations DELETE: rate limit (mutate) 추가
- A8 jobs DELETE: PATCH 와 권한 패턴 일관화
- ...

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

### 작업 분기
- main 직접 push 금지 (보호된 브랜치).
- feature branch — `claude/<scope>` 또는 `feat/<feature>` 등.
- PR 통해 머지.

### 마이그 + 코드 같은 PR
- 마이그가 코드 변경 의존성이면 같은 PR 묶기.
- 마이그만 단독 PR 도 OK (스키마 선반영).

## React Query / 데이터 fetching

- 외부 라이브러리 (TanStack Query) 미사용. 대부분 `useEffect` + `fetch`.
- 신규 도입 검토 가능 (캐싱 / 자동 refetch). 현재는 도입 안 됨.

## 스타일 / UI

### TailwindCSS
- 기본 디자인 시스템. 클래스 직접 사용.
- shadcn/ui 컴포넌트 (`components/ui/`) 활용.
- `cn()` 헬퍼로 conditional class 병합.

### 다크 모드
- next-themes 사용. `dark:` 변형 클래스 적용.

### 반응형
- mobile-first. `sm:` / `md:` / `lg:` 활용.
- container max-width 제한 자주 사용.

### 아이콘
- lucide-react. 트리쉐이킹 잘 됨. 한 컴포넌트에서 많이 import 해도 OK (`optimizePackageImports`로 추가 최적화).

## 테스트

- 현재 자동화된 테스트 거의 없음. 도입 권장 (Vitest 또는 Playwright).
- 수동 검증: dev 에서 핵심 플로우 + Supabase Studio 직접 SQL.

## 코드 리뷰 체크리스트 (PR 올릴 때 self-check)

- [ ] typecheck 통과 (`npx tsc --noEmit`)
- [ ] 광장 필터 누락 없음
- [ ] 인증 → rate limit → 권한 → 검증 순서
- [ ] 에러 메시지 한국어 + `error.message` 직접 노출 X
- [ ] Supabase 쿼리에 `single` 대신 `maybeSingle` 권장
- [ ] 마이그가 있으면 rollback SQL 주석 첨부
- [ ] commit 메시지 prefix + 본문
- [ ] 새 컴포넌트 / 함수에 한 줄 주석 (의도)
- [ ] 변경 영향 범위가 큰 PR이면 docs/handover 업데이트도 같이

## 자주 빠뜨리는 것 (Gotchas)

1. **광장 필터 누락** — 다른 광장 데이터 노출 / 수정 위험.
2. **`profiles.plaza_id` 같은 존재하지 않는 컬럼 SELECT** — PostgREST 에러로 NULL 반환되어 silent fail.
3. **service-role 클라이언트 무분별 사용** — RLS 우회되니 수동 권한 검증 필수.
4. **`router.refresh()` 빠뜨리고 setState 만** — 서버 데이터 stale.
5. **마이그 NOTIFY pgrst 빠뜨림** — schema 변경 후 PostgREST 가 모름.
6. **Promise params 까먹고 `params.id` 직접 접근** — Next 15+ 에선 await 필수.
