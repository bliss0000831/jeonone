# 03 — 인증 / 권한 / RLS

## 개요

광장은 **3-계층 권한 모델**과 **3-종 클라이언트**를 사용한다.

- 권한: 일반 사용자 / 광장 어드민 / 슈퍼 어드민
- 클라이언트: browser (RLS) / server (RLS) / admin (service-role, RLS 우회)

이 문서는 각 라우트가 어떤 검증을 어떤 순서로 해야 하는지의 표준 패턴을 정리한다.

## 인증 (Authentication)

### Supabase Auth
- 이메일 + 비밀번호 (가입 / 로그인)
- 카카오 OAuth (소셜 로그인)
- magic link (옵션)

### 세션 관리
- middleware 의 `updateSession` 이 매 요청마다 cookie 갱신.
- 클라이언트는 `lib/supabase/client.ts`, 서버는 `lib/supabase/server.ts`.

### 로그인 라우트
- `app/(auth)/auth/sign-in/page.tsx` — UI
- `app/(auth)/auth/sign-up/page.tsx` — 가입 시 plaza_profiles 자동 생성
- `app/auth/callback/route.ts` — OAuth 콜백

### 로그인 시도 보호
`enforceRateLimit(req, 'login', email)` — 분당 5회. **fail-closed** (Redis 장애 시 거부).

## 권한 계층

### 일반 사용자
`profiles.role = 'user'` (디폴트). 기능별 검증:
- 본인 콘텐츠만 수정/삭제 (`post.user_id === user.id`)
- 광장 가입 (`plaza_profiles`)
- 본인 신고 / 좋아요 / 댓글

### 광장 어드민
- `profiles.role = 'admin'` (legacy) **또는** `plaza_admins.role IN ('admin', 'moderator')`
- 자기 광장 안의 회원 / 매물 / 게시판 관리
- 다른 광장은 차단 (cross-plaza)

### 슈퍼 어드민 (`isGodMode`)
- `profiles.role = 'superadmin'` (legacy super) **또는** `plaza_admins.role = 'super'`
- 모든 광장 어드민 가능
- 광장 추가/삭제 / PortOne 결제 채널 / site_settings 글로벌

### 슈퍼 어드민 콘솔 (`/super-admin`)
별도 인증 layer. Supabase 로그인 + **2nd factor**:
- `SUPER_ADMIN_PASSWORD_HASH` (PBKDF2)
- `SUPER_ADMIN_HMAC_SECRET` (쿠키 서명)
- `SUPER_ADMIN_TOTP_SECRET` (Google Authenticator)

## 통합 헬퍼: `checkAdminAuth`

`lib/services/admin-auth.ts:23` 의 `checkAdminAuth(supabase, userId)` 가 권한 종합 체크.

### 반환 타입 `AdminAuth`
```ts
{
  ok: boolean              // 어떤 admin 권한이라도 있나
  isLegacyAdmin: boolean   // profiles.role IN (admin, superadmin)
  isLegacySuper: boolean   // profiles.role = superadmin
  isSuperPlaza: boolean    // plaza_admins 에 super 권한 있음
  isAnyPlazaAdmin: boolean // plaza_admins 에 row 가 있음 (어떤 role 이든)
  isGodMode: boolean       // legacy super OR plaza super
  plazaIds: string[]       // admin 인 광장 list (plaza_admins)
}
```

### 표준 사용
```ts
const auth = await checkAdminAuth(supabase, user.id)
if (!auth.ok) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

// cross-plaza 차단
if (!auth.isLegacySuper && !canAccessPlaza(auth, post.plaza_id)) {
  return NextResponse.json({ error: '다른 광장 접근 불가' }, { status: 403 })
}

// 슈퍼만 가능한 액션
if (role !== undefined && !auth.isGodMode) {
  return NextResponse.json({ error: '슈퍼관리자만' }, { status: 403 })
}
```

### `canAccessPlaza(auth, plazaId)`
- `isGodMode` → 모든 광장 통과
- 그 외 → `auth.plazaIds.includes(plazaId)` 일 때만 통과

## RLS (Row Level Security)

### 패턴 1: 본인 데이터만
```sql
CREATE POLICY xxx_select_own ON public.xxx
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY xxx_modify_own ON public.xxx
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

### 패턴 2: 누구나 SELECT, 본인만 INSERT/UPDATE/DELETE
- 게시판 / 매물 / 모임 등 공개 콘텐츠

### 패턴 3: 광장 일치 강제
```sql
USING (plaza_id = current_setting('request.jwt.claims', true)::jsonb->>'plaza_id')
```
일부 테이블에 적용. JWT 의 plaza_id claim 활용.

### 패턴 4: column-level GRANT (plazas 민감 컬럼)
```sql
REVOKE SELECT ON plazas FROM anon, authenticated;
GRANT SELECT (id, name, is_active, ...) ON plazas TO anon, authenticated;
-- portone_channel_key 같은 민감 컬럼은 service_role 만
```

### 패턴 5: 거래 검증은 라우트 + RLS 보조
거래 상태/소유권 같은 다단계 검증은 RLS 만으론 표현 어려움. 라우트에서 검증 후 service-role 사용 또는 RPC 호출.

## 클라이언트 종류

### Browser Client (`lib/supabase/client.ts`)
- 클라이언트 컴포넌트에서 사용
- RLS 적용
- 세션 자동 관리 (cookie)

```ts
import { createClient } from '@/lib/supabase/client'
const supabase = createClient()
```

### Server Client (`lib/supabase/server.ts`)
- RSC / API 라우트
- cookie 기반 세션
- RLS 적용

```ts
import { createClient } from '@/lib/supabase/server'
const supabase = await createClient()
```

### Admin Client (`lib/supabase/admin.ts`)
- service-role 키 사용
- **RLS 우회**
- 호출 전 명시적 권한 검증 필수

```ts
import { createAdminClient } from '@/lib/supabase/admin'
const admin = createAdminClient()
// 위에서 auth 검증 + canAccessPlaza 통과 후만 사용
```

## API 라우트 표준 권한 체크 패턴

```ts
export async function PATCH(request: NextRequest, { params }) {
  // 1. 인증
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  // 2. Rate limit
  const limited = await enforceRateLimit(request, 'mutate', user.id)
  if (limited) return limited

  // 3. 권한 체크
  const auth = await checkAdminAuth(supabase, user.id)

  // 4. 자원 조회 + 광장 검증
  const { id } = await params
  const plaza = await getCurrentPlaza()
  let q: any = supabase.from('xxx').select('*').eq('id', id)
  if (plaza) q = q.eq('plaza_id', plaza)
  const { data: target } = await q.maybeSingle()
  if (!target) return NextResponse.json({ error: '대상 없음' }, { status: 404 })

  // 5. 소유권 / cross-plaza 체크
  const isOwner = target.user_id === user.id
  const isAdminInPlaza = canAccessPlaza(auth, target.plaza_id)
  if (!isOwner && !isAdminInPlaza) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  // 6. 입력 검증
  const body = await request.json()
  // ...

  // 7. 비즈니스 로직 (admin 이면 service-role, 일반 사용자면 RLS)
  // ...
}
```

## 슈퍼 어드민 인증 (`/super-admin`)

### Login flow
1. 사용자가 `/super-admin/login` 진입
2. 비밀번호 입력 → `lib/services/super-admin.ts:verifyPassword` (PBKDF2 비교)
3. TOTP 코드 입력 → `verifyTOTP`
4. 통과 시 `SUPER_ADMIN_COOKIE` 발급 (HMAC 서명)
5. 이후 `/super-admin/*` 진입 시 `verifySuperAdminToken(cookie)` 통과해야 진입

### `verifySuperAdminToken`
- HMAC 서명 검증 (timing-safe)
- 만료 시간 검증
- 통과 시 true

### 라우트 패턴
```ts
import { cookies } from 'next/headers'
import { verifySuperAdminToken, SUPER_ADMIN_COOKIE } from '@/lib/services/super-admin'

export async function GET() {
  const c = await cookies()
  const token = c.get(SUPER_ADMIN_COOKIE)?.value
  const ok = await verifySuperAdminToken(token)
  if (!ok) return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  // 슈퍼 어드민만 가능한 작업
}
```

## Cron / Webhook 인증

### Vercel cron
`Authorization: Bearer $CRON_SECRET` 헤더. `verifyCronAuth(authHeader)` (timing-safe).

```ts
import { verifyCronAuth } from '@/lib/security/cron-auth'

export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request.headers.get('authorization'))) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }
  // cron 작업
}
```

### PortOne webhook
서명 검증 (HMAC SHA-256) 으로 PortOne 발신 검증.

## 보안 체크리스트 (PR 리뷰)

라우트 PR 자체 점검:

- [ ] 인증 (`auth.getUser`) 호출
- [ ] Rate limit 적용 (mutation 라우트)
- [ ] 광장 필터 (`getCurrentPlaza` + `eq('plaza_id', plaza)`)
- [ ] 소유권 / role 체크
- [ ] cross-plaza 차단 (`canAccessPlaza`)
- [ ] service-role 사용 시 검증 후만
- [ ] 입력 길이 / 범위 / 화이트리스트
- [ ] 에러 메시지에 `error.message` 노출 X
- [ ] 자기 자신 권한 변경 차단 (lockout 방지)
- [ ] 마지막 super 강등/삭제 차단

## 흔한 보안 미스 (Phase 1 검증 중 발견)

### `profiles.plaza_id` 참조 (없는 컬럼)
```ts
// ❌ 깨짐 — profiles 에 plaza_id 컬럼 없음
.from('profiles').select('role, plaza_id').eq('id', id)
```
PostgREST 가 silent NULL 반환 → target=null → "대상 없음" 잘못된 메시지. 광장 가입은 `plaza_profiles` 별도.

### service-role 사용 후 plaza 검증 누락
admin client 는 RLS 우회. `canAccessPlaza` 호출 안 하면 광장 어드민이 다른 광장 데이터 수정 가능.

### enforceRateLimit 누락
일부 mutation 라우트에 빠짐 → 도배 가능. Phase 4 E2/E3 에서 7개 라우트 보강.

### error.message 노출
DB 컬럼명 / 서버 path 누출. `{ error: '처리에 실패했습니다' }` 같은 일반 메시지로 응답.

## 다음 읽을 문서

- 어드민 콘솔 → `06-operations/admin.md`
- 슈퍼 어드민 → `06-operations/super-admin.md`
- 마이그 + RLS 정책 전체 → `04-data-model.md`
