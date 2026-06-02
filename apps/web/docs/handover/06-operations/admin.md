# 광장 어드민 (`/admin`)

> 광장(테넌트) 단위 운영 콘솔. 각 광장 운영자가 자기 광장의 회원·매물·게시판·신고·테마·결제·통계를
> 일상적으로 관리하는 곳. 본사 운영자가 전 광장을 통합 관리하는 곳은 `/super-admin` (별도 문서 참조).

---

## 1. 개요 — 운영 측면에서 왜 중요한지

광장은 멀티테넌트로 운영된다 (`chuncheon`, `gangneung`, `wonju`, …). 각 광장에는 **그 광장만 만질 수
있는** 운영자가 1명 이상 존재한다. `/admin` 은 그 운영자가 사용하는 콘솔이다.

핵심 책임:

- **회원 관리**: 가입 유형 승인(부동산/사업자), 포인트 수동 조정, 메일/알림 발송, 차단·추방
- **콘텐츠 모더레이션**: 매물 승인 대기 처리, 신고 큐 검토, 게시글 강제 hide/restore, 키워드 필터
- **테마/메뉴**: 광장별 색상·로고·미니네비 라벨·푸터·배너 관리 (`site_labels`, `site_settings`)
- **결제/포인트**: 광장 정산, 부스트 주문, 포인트 룰 관리
- **통계**: 방문자·매물·거래·검색어·지역별 KPI 모니터링

⚠️ 본 콘솔은 **자기 광장 외부 데이터를 절대 건드리면 안 된다.** 권한 체크에서 광장 ID를 매번 확인한다.

---

## 2. 핵심 파일 / 경로

| 경로 | 역할 |
|---|---|
| `app/admin/layout.tsx` | 모든 `/admin/**` 페이지 공통 레이아웃 + 클라이언트 측 권한 가드 |
| `app/admin/page.tsx` | 대시보드 (KPI 요약) |
| `app/admin/members/`, `app/admin/properties/`, `app/admin/board/`, `app/admin/moderation/`, `app/admin/theme/`, `app/admin/billing/`, `app/admin/points/`, `app/admin/statistics/`, `app/admin/settings/` | 도메인별 관리 페이지 |
| `app/admin/account-requests/page.tsx` | 가입 유형(부동산/사업자) 승인 큐 |
| `app/api/admin/**` | 관리자 전용 API 라우트 (server-side 권한 재검증 필수) |
| `lib/services/admin-auth.ts` | **권한 체크 단일 진입점** — `checkAdminAuth`, `canAccessPlaza`, `getAdminWriteClient`, `logAdminAction` |
| `lib/plaza/client.ts` / `lib/plaza/server.ts` | 현재 광장 ID 컨텍스트 (서브도메인에서 추출) |

---

## 3. 권한 모델 — 3중 레이어 통합

권한은 세 출처를 하나로 합쳐 본다 (`lib/services/admin-auth.ts::checkAdminAuth`).

```
profiles.role          plaza_admins.role            결과
─────────────────────────────────────────────────────────────────────────
'superadmin'           (any)                        isLegacySuper, isGodMode
'admin'                (none)                       isLegacyAdmin only — chuncheon 한정 폴백
(any)                  'super'                      isSuperPlaza, isGodMode
(any)                  'admin' on plaza X            그 광장 X 만 접근
(other)                (none)                       비관리자
```

`AdminAuth` 결과 객체:

```ts
{
  ok: boolean,                // 어떤 형태로든 admin 인지
  isLegacyAdmin: boolean,     // profiles.role IN (admin, superadmin)
  isLegacySuper: boolean,     // profiles.role = 'superadmin'
  isSuperPlaza: boolean,      // plaza_admins 의 super 권한 (글로벌)
  isAnyPlazaAdmin: boolean,   // plaza_admins 에 한 줄이라도 있음
  isGodMode: boolean,         // = isLegacySuper || isSuperPlaza
  plazaIds: string[],         // 이 user 가 admin 인 plaza 목록
}
```

가드 함수 `canAccessPlaza(auth, plazaId)`:

- `isGodMode` → 전 광장 통과
- 그 외 → `auth.plazaIds` 에 `plazaId` 포함돼야 함

> **주의**: `profiles.role='admin'` (legacy) 은 multi-plaza 분리 전 단일광장 운영 흔적. 현재는
> `chuncheon` 에 한해서만 접근 허용 (`app/admin/layout.tsx` line 237). 신규 광장 추가 시 이쪽 인정 안 됨.

### Legacy 와 신규의 통합 이유

플랫폼이 **단일 광장(춘천)** 으로 시작 → multi-plaza 분리 (마이그 `20260521000000_multi_plaza_foundation.sql`)
→ `plaza_admins` 테이블 도입. 이전 `profiles.role` 데이터를 버리지 않기 위해 두 출처를 모두 본다.
새 운영자는 **반드시 `plaza_admins` 에만** 등록해야 한다.

---

## 4. 진입 시퀀스 (`/admin` 접속 → 페이지 표시)

`app/admin/layout.tsx` 의 `checkAdmin()` (useEffect, 클라이언트):

1. **광장 컨텍스트 확인** — `getCurrentPlazaClient()` 가 서브도메인에서 `chuncheon` 등을 추출.
   허브 도메인(`gwangjang.app`)에서 `/admin` 접근 시 → `'/'` 로 리다이렉트.
2. **로그인 확인** — `supabase.auth.getUser()`. 미인증 시 → `/auth/login`.
3. **3중 권한 fetch (병렬)**:
   - `profiles.role`
   - `plaza_admins.role + plaza_id` (해당 user 의 모든 행)
   - `plazas.name` (현재 광장)
4. **접근 허용 판정**:
   - `hasPlazaAccess` = `super` OR 현재 광장에 admin row
   - OR `isLegacySuperAdmin`
   - OR (`isLegacyAdmin` AND `plaza === 'chuncheon'`)
5. 통과 → 사이드바 + 헤더 렌더. 실패 → `/` 리다이렉트.

⚠️ 클라이언트 측 가드는 **UX 용**. 진짜 보안은 각 API 라우트 + RLS 가 담당.

### API 라우트의 server-side 가드 패턴

```ts
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
const auth = await checkAdminAuth(supabase, user.id)
if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
if (!canAccessPlaza(auth, targetPlazaId)) return ... 403
```

mutation 시점엔 `getAdminWriteClient()` 로 **service-role 클라이언트** 를 새로 만들어 RLS 우회 후
실제 INSERT/UPDATE/DELETE 수행. 이 클라이언트는 호출 직전 `checkAdminAuth` 통과를 반드시 검증해야 함.

---

## 5. 주요 페이지별 동작

### `/admin/members`
- 광장에 가입된 회원 목록 (`profiles` + 그 광장에 매핑된 row)
- 검색/필터/엑셀 export
- 회원 상세에서 차단/추방/포인트 조정
- 호출 API: `app/api/admin/users/[id]/route.ts`

### `/admin/account-requests`
- 사용자가 일반 → 부동산/사업자/공인중개사로 신청한 큐 (`account_type_requests`)
- 승인 시 `profiles.account_type` 변경 + 알림 발송
- 변경 추적: `previous_type` 컬럼 (마이그 `20260501000000_account_type_requests_previous_type.sql`)

### `/admin/properties/pending`, `/admin/properties/reported`, `/admin/properties/highlight`
- 매물 승인/거절, 신고 처리, 추천 매물 토글

### `/admin/board/**`
- 게시판 카테고리별 어드민 뷰. **자기 광장의 게시글만** RLS 로 자동 필터.
- 강제 hide/restore 시 `admin_actions` 에 audit log 기록 (`logAdminAction`)

### `/admin/moderation/reports`, `/admin/moderation/keywords`
- 신고 큐 검토 (게시글/댓글/매물/사용자)
- 키워드 자동 필터 (`moderation` 서비스)

### `/admin/theme`, `/admin/theme/menu`, `/admin/theme/footer`, `/admin/theme/slider`, `/admin/theme/basic-info`
- 광장별 비주얼/메뉴/푸터/배너 — `site_settings`, `site_labels`, `hero_banners` 테이블
- 광장 전환 시 즉시 반영 (캐시는 `revalidate=60`)

### `/admin/settings/permissions`, `/admin/settings/multi-admin`
- 광장 운영자 추가/제거 (`plaza_admins`)
- super 가 아니면 자기 광장 admin 만 추가 가능

### `/admin/billing`, `/admin/points`
- 구독·정산·부스트 주문, 포인트 룰
- `lib/services/billing/`, `lib/services/points/` 호출
- Feature Flag (`monetization.payouts`, `monetization.points`) OFF 일 땐 데이터만 표시, 토글은 슈퍼

### `/admin/statistics/**`
- 방문자/매물/거래/검색어/지역 통계
- 대부분 server-rendered 집계 또는 RPC (`board_stats_aggregate` 등)

---

## 6. Cross-Plaza 차단

운영자가 자기 광장 데이터만 만질 수 있도록:

1. **클라이언트**: `app/admin/layout.tsx` 가 현재 서브도메인의 광장에 admin row 가 없으면 차단.
2. **API 라우트**: `canAccessPlaza(auth, targetPlazaId)` 호출.
3. **DB (RLS)**: 거의 모든 콘텐츠 테이블에 `plaza_id` 컬럼 + `is_admin_for_plaza(plaza_id)` 정책.
   - 함수 정의: `supabase/migrations/20260610000000_security_hardening_pack.sql` 의 C2.
   - 핵심: `plaza_admins.role='super'` 라고 해서 글로벌 super 로 격상되지 않음. 그 광장 한정.
   - 글로벌 super 는 오직 `profiles.role='superadmin'` 한 경로만.

> **시나리오**: 춘천 운영자가 강릉 매물을 직접 SQL 로 UPDATE 시도 → service_role 키 없으면 RLS 차단.

---

## 7. 어드민 작업 감사 로그

`admin_actions` 테이블 + `logAdminAction()` 헬퍼.

호출 시점:
- 다른 사용자의 글/매물 강제 hide/delete/restore
- 사용자 강제 차단/role 변경
- 신고 처리 (반려/승인)

기록 필드:
- `admin_id`, `action` (`update|delete|hide|restore|force_status` 등)
- `target_table`, `target_id`, `target_user_id`
- `plaza_id`
- `before_data` (JSONB — rollback 단서)
- `reason` (운영자 입력 메모)

⚠️ `logAdminAction` 은 **silent** — 실패해도 throw 안 함. 메인 액션 흐름을 절대 차단하지 않기
위해서지만, 그만큼 audit log 가 누락될 수 있다는 점을 인지할 것.

분쟁 발생 시 `admin_actions` 가 1차 증거. 백업 필수.

---

## 8. 변경/확장 시 주의점

1. **새 admin API 라우트 추가 시**:
   - 무조건 `checkAdminAuth` + `canAccessPlaza` 두 함수 모두 호출.
   - mutation 은 `getAdminWriteClient()` 사용 직전에 권한 통과 확인.
   - audit log 가 의미 있으면 `logAdminAction` 호출.

2. **새 페이지 추가 시**:
   - `app/admin/layout.tsx` 의 `menuItems` 에 등록.
   - 페이지 자체에서도 server-side 권한 재검증 (layout 가드는 UX 용).

3. **새 광장 추가 시 (예: `pohang`)**:
   - `plazas` INSERT
   - 그 광장 운영자를 `plaza_admins` 에 추가
   - legacy `profiles.role='admin'` 자동 인정 안 됨 — 명시적 등록 필요.

4. **권한 체크 변경 시**:
   - 절대 `admin-auth.ts` 만 바꾸지 말고 RLS (`is_admin_for_plaza` 함수) 도 함께 점검.
   - 4-pass 보안 감사 (마이그 `20260610` 참고) 같은 회귀 위험.

5. **service-role 키 절대 클라이언트 노출 금지**:
   - `getAdminWriteClient` 는 `app/api/admin/**` 또는 server actions 안에서만 호출.

6. **`is_admin_for_plaza` 함수 시그니처 바꾸지 말 것** — 30+ RLS 정책이 의존.
