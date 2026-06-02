# 02 — 멀티 광장 (멀티테넌시)

## 개요

광장은 **지역별 서브도메인**으로 분리된 멀티테넌트 시스템이다. 한 코드베이스가 N개의 광장(춘천 / 강릉 / 원주 / ...)을 서비스하고, 각 광장은 자체 회원 / 매물 / 게시판 / 어드민을 가진다. 사용자 인증은 전역 1개(`auth.users`)이지만 광장 가입은 별도(`plaza_profiles`).

이 문서는 광장 식별 / 데이터 격리 / cross-plaza 보호의 코드 위치와 함정을 정리한다.

## 광장 vs 허브

| 구분 | URL | 역할 |
|---|---|---|
| 허브 (Hub) | `https://gwangjang.app/` | 광장 선택 / 안내 |
| 광장 | `https://chuncheon.gwangjang.app/` | 실제 서비스 (매물/게시판/모임 등) |

middleware 가 host 를 분석해 어떤 광장인지(또는 허브인지) 결정. 광장이면 `plaza_id` 가 모든 쿼리에 자동 적용되도록 헬퍼가 동작.

## 핵심 헬퍼

### `lib/plaza/config.ts`
- `plazaFromHost(host)` — `chuncheon.gwangjang.app` → `'chuncheon'`. localhost / preview URL 처리.
- `PlazaId` 타입 — DB 의 `plazas.id` 와 동기화.
- `isActivePlaza(id)` — `plazas.is_active = TRUE` 인지.

### `lib/plaza/server.ts`
- `getCurrentPlaza()` — 서버 컴포넌트 / API 라우트에서 호출. `headers()` 로 host 추출 + `plazaFromHost`.
- 반환: `PlazaId | null` (허브이면 null).

### `lib/plaza/client.ts`
- `getCurrentPlazaClient()` — 클라이언트 컴포넌트.
- dev 환경의 `localhost` 에서 `?plaza=` 쿼리 또는 `dev-plaza` 쿠키 fallback.
- production 에선 `window.location.host` 분석.

### `lib/plaza/city-name.ts`
- `plazaCityName('춘천광장')` → `'춘천'`. UI 표시용.

## 데이터 모델

### `plazas` 테이블
광장 정의. `id` (TEXT PK), `name`, `parent_region`, `center_lat/lng`, `bounds`, `theme` (JSONB), `is_active`, `is_open_soon` 등. PortOne 채널키 / 사업자등록번호 같은 민감 컬럼도 여기 (column-level GRANT 로 격리).

### `plaza_profiles` 테이블
광장별 회원 가입. `(user_id, plaza_id)` PK. 한 사용자가 여러 광장에 가입 가능. `nickname`, `is_active` 광장별로 다를 수 있음.

### `plaza_admins` 테이블
광장별 관리자. `(user_id, plaza_id)` PK + `role` ('admin' / 'moderator' / 'super'). super 는 모든 광장 어드민 가능.

### 콘텐츠 테이블의 `plaza_id` 컬럼
거의 모든 콘텐츠 테이블이 `plaza_id TEXT NOT NULL` 가짐:
- properties, group_buying_posts, clubs, local_food, board_posts, jobs_posts, interior_posts, moving_posts, cleaning_posts, repair_posts, new_store_posts, sharing_posts, secondhand_posts, reviews, chat_rooms, ...

마이그레이션 `20260521000001`–`20260521000003` 등이 기존 데이터에 `plaza_id = 'chuncheon'` 백필 후 NOT NULL 적용.

## 광장 격리 패턴

### 라우트에서 의무
```ts
const plaza = await getCurrentPlaza()
let q: any = supabase.from('properties').select('*').eq('id', id)
if (plaza) q = q.eq('plaza_id', plaza)
const { data } = await q.maybeSingle()
```

`if (plaza)` 가드는 허브에서도 동작하라는 의도. 광장 페이지에서 빠뜨리면 cross-plaza 노출 위험.

### RLS 정책으로 추가 방어
일부 테이블의 RLS 가 plaza 일치 강제. 코드 누락 시 fallback.

```sql
CREATE POLICY ... USING (plaza_id = current_setting('request.jwt.claims', true)::jsonb->>'plaza_id')
```

### 어드민 cross-plaza 차단
광장 어드민이 다른 광장 데이터 수정 시도 차단. `lib/services/admin-auth.ts` 의 `canAccessPlaza(auth, postPlaza)`.

```ts
const auth = await checkAdminAuth(supabase, user.id)
if (!auth.isLegacySuper && !canAccessPlaza(auth, post.plaza_id)) {
  return NextResponse.json({ error: '다른 광장의 데이터' }, { status: 403 })
}
```

## middleware 의 광장 식별

`middleware.ts` 는 모든 요청에 대해:
1. host 분석 → 광장 ID 또는 null
2. MAINTENANCE_MODE 체크
3. Supabase session refresh
4. 광장 정보를 request headers 에 부착 (RSC 가 읽음)

middleware matcher 는 `/api/categories`, `/api/regions` 같은 일부 광장 무관 라우트는 제외.

## Dev 환경 광장 진입

production 은 서브도메인이라 자연스럽지만 dev 는 `localhost:3000` 만 있어 광장 구분 어려움.

해결책 두 개 (`getCurrentPlazaClient` 가 우선순위로 처리):

### 1. `?plaza=chuncheon` 쿼리
`http://localhost:3000/?plaza=chuncheon` 으로 진입.

### 2. `dev-plaza` 쿠키
한 번 광장 진입 페이지(허브의 광장 선택 UI)에서 클릭하면 쿠키 박힘. 이후 그냥 localhost 만으로도 그 광장 진입 상태 유지.

### 3. local subdomain hosts 파일
선택. `127.0.0.1 chuncheon.localhost` 추가. `http://chuncheon.localhost:3000/` 으로 진입.

## cross-plaza 위험 패턴 / 회피

### 위험: 컬럼 누락
```ts
// ❌ plaza_id 빠짐
supabase.from('properties').select('*').eq('id', id)
```

### 위험: profiles.plaza_id (없는 컬럼)
profiles 테이블에는 `plaza_id` 가 없음. 광장 가입은 `plaza_profiles` 별도 테이블. 잘못 SELECT 하면 PostgREST 에러로 silent NULL.

올바른 패턴:
```ts
const { data: plazas } = await supabase
  .from('plaza_profiles')
  .select('plaza_id')
  .eq('user_id', userId)
const userPlazas = (plazas || []).map(r => r.plaza_id)
```

### 위험: 어드민이 다른 광장 회원 수정
`/api/admin/users/[id]` PATCH 에서 cross-plaza 검증 필수. 검증 누락 시 super 가 아닌 광장 어드민이 다른 광장 회원의 role 변경 가능 (실제로 Phase 1 검증 중 발견된 버그).

### 회피: helper 일관 사용
- `getCurrentPlaza()` 는 매 라우트 첫 줄에 호출.
- service-role 클라이언트 사용 시 plaza 필터 더 신경 쓸 것.

## 광장 추가 절차 (운영자)

새 광장 (예: `daejeon`) 추가:

1. **plazas INSERT** — 슈퍼관리자가 `/super-admin/plaza-associations` UI 또는 직접 SQL.
   ```sql
   INSERT INTO plazas (id, name, parent_region, center_lat, center_lng, is_active)
   VALUES ('daejeon', '대전광장', '충청권', 36.350, 127.385, false);
   ```
2. **DNS 설정** — `daejeon.gwangjang.app` A/CNAME 레코드.
3. **Vercel 도메인 추가** — Vercel 프로젝트 > Domains.
4. **광장 어드민 임명** — `plaza_admins` INSERT.
5. **PortOne 채널 (결제 사용 시)** — `/super-admin/plaza-payments` 에서 채널키 등록.
6. **광장 활성화** — `is_active = TRUE`.

## 광장 삭제 절차

권장: soft delete (`is_active = FALSE`) 만. hard delete 는 콘텐츠 cascade 위험.

## visibility 옵션

일부 콘텐츠는 광장을 넘어 전국 노출 가능:

### group_buying_posts.visibility
- `'plaza'` (기본): 본인 광장만 보임
- `'national'`: 모든 광장에서 보임. 검색 / 메인 위젯에 노출.

마이그레이션: `20260615000000_plaza_payments_and_gb_visibility.sql`.

## Multi-plaza 테스트

여러 광장 동시 테스트할 때 시크릿 창 활용:
- 시크릿 1: `?plaza=chuncheon`
- 시크릿 2: `?plaza=gangneung`

각각 별도 세션이라 한 사용자가 여러 광장에 동시 가입한 시나리오도 검증 가능.

## 흔한 실수

| 실수 | 결과 | 회피 |
|---|---|---|
| 광장 필터 누락 | cross-plaza 데이터 노출 | 라우트에 `getCurrentPlaza` + `eq('plaza_id', plaza)` 의무 |
| `profiles.plaza_id` SELECT | silent NULL | `plaza_profiles` 사용 |
| dev 에서 host 직접 split | localhost 가 plaza_id 됨 | `getCurrentPlazaClient()` 사용 |
| service-role 사용 후 plaza 검증 X | 어드민이 다른 광장 데이터 수정 | `canAccessPlaza(auth, postPlaza)` 호출 |
| 마이그에서 새 콘텐츠 테이블 만들 때 plaza_id 빠뜨림 | 다른 광장에서 보이는 데이터 | 새 콘텐츠 테이블엔 항상 plaza_id NOT NULL |

## 다음 읽을 문서

- 권한 계층 / 어드민 → `03-auth-permissions.md`
- 어드민 라우트 / cross-plaza 패턴 → `06-operations/admin.md`
- 슈퍼 어드민 / 광장 관리 → `06-operations/super-admin.md`
