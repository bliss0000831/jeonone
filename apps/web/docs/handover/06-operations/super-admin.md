# 06/super-admin — 슈퍼 어드민 콘솔

## 개요

플랫폼 최상위 관리자 콘솔. 광장 추가 / 삭제 / 결제 채널 관리 / 글로벌 설정 등 광장 어드민이 못 하는 작업을 담당한다. 권한이 큰 만큼 별도의 2-factor 인증 layer 가 있다.

## 진입

`/super-admin` 라우트 (`app/super-admin/`).

### 인증 흐름
1. 일반 Supabase 로그인 (auth)
2. `/super-admin/login` 진입
3. 비밀번호 입력 → `verifyPassword(plain, hash)` (PBKDF2)
4. TOTP 6자리 입력 → `verifyTOTP(code)` (Google Authenticator)
5. 통과 시 `SUPER_ADMIN_COOKIE` 발급 (HMAC 서명, expiration 포함)
6. 이후 모든 `/super-admin/*` 라우트가 `verifySuperAdminToken(cookie)` 통과해야 진입

### 환경변수
- `SUPER_ADMIN_PASSWORD_HASH` (PBKDF2 해시)
- `SUPER_ADMIN_HMAC_SECRET` (쿠키 서명 키)
- `SUPER_ADMIN_TOTP_SECRET` (TOTP base32 시크릿)

### 핵심 헬퍼
`lib/services/super-admin.ts`:
- `verifyPassword(plainPassword, hash)` — PBKDF2 비교
- `verifyTOTP(code)` — TOTP 검증 (현재 시간 ± 30초)
- `signSuperAdminToken(payload)` — HMAC 서명 생성
- `verifySuperAdminToken(cookieValue)` — 서명 + 만료 검증 (timing-safe)
- `SUPER_ADMIN_COOKIE` — 쿠키 이름 상수

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

## 페이지

### `/super-admin/page.tsx`
대시보드. 광장 list (모두 SELECT) + 통계 (가입자 / 매물 / 결제) 요약.

### `/super-admin/login`
2-factor 인증 화면.

### `/super-admin/plaza-associations`
광장-사용자 연결 관리. 광장 어드민 임명 / 해제. `plaza_admins` INSERT/UPDATE/DELETE.

### `/super-admin/plaza-payments`
광장별 PortOne 결제 채널 + 사업자 정보 관리. `plazas` 테이블의 민감 컬럼 (`portone_store_id`, `portone_channel_key`, `business_number`, `business_name`, `business_holder`, `settlement_email`) UPDATE.

### `/super-admin/site-settings`
글로벌 site_settings 편집. 운영 메일 / 점검 메시지 / SEO 메타 / hero 배너 등.

### 기타
- `/super-admin/announcements`, `/super-admin/popups` — 공지/팝업 관리
- `/super-admin/feature-flags` — 기능 토글
- `/super-admin/users` — 전 사용자 검색 / 강제 권한 변경

## 동작 시퀀스 — 새 광장 활성화

```
[운영자]
1. 가입 (Supabase auth) + admin 권한 자기 부여 (DB 직접 또는 기존 super 가)
2. /super-admin/login → password + TOTP
3. /super-admin/plaza-associations → 새 광장 row 만들기
   ↓
4. plazas INSERT (id, name, parent_region, center_lat/lng, is_active=false, is_open_soon=true)
   ↓
5. DNS 와일드카드 (이미 *.gwangjang.app 설정되어 있으면 자동)
   ↓
6. 광장 어드민 임명
   - plaza_admins INSERT (user_id, plaza_id, role='admin')
   ↓
7. PortOne 채널 등록 (결제 사용 시)
   - /super-admin/plaza-payments
   - portone_store_id, portone_channel_key 입력
   - business_number, business_name 등 사업자 정보
   - payments_enabled = true
   ↓
8. 활성화
   - plazas.is_active = true, is_open_soon = false
   ↓
9. 사용자 가입 시작 (광장 진입 가능)
```

## API 라우트 (`app/api/super-admin/`)

| 라우트 | 동사 | 동작 |
|---|---|---|
| `/login` | POST | password + TOTP 검증 후 쿠키 발급 |
| `/logout` | POST | 쿠키 무효화 |
| `/plaza-payments` | GET / PATCH | 광장 결제 정보 조회 / 갱신 |
| `/plaza-associations` | GET / POST / DELETE | plaza_admins 관리 |
| `/users/[id]` | PATCH | 사용자 role 변경 |
| `/site-settings` | GET / PATCH | 글로벌 설정 |
| ... | | |

모든 라우트 첫 줄에 `verifySuperAdminToken` 호출.

## Service-role 클라이언트 사용

대부분의 슈퍼 어드민 작업은 RLS 우회 필요 (모든 광장 / 모든 사용자 접근). `lib/supabase/admin.ts` 의 `createAdminClient()` 사용.

```ts
const admin = createAdminClient()
const { data } = await admin
  .from('plazas')
  .select('id, name, portone_store_id, portone_channel_key, ...')
  .order('sort_order')
```

## 보안 패턴

### 1. 인증 layer 2개
- Supabase auth (이메일 / 카카오)
- `SUPER_ADMIN_COOKIE` (별도 password + TOTP)

이 둘 모두 통과해야 슈퍼 어드민 권한 행사 가능. 한쪽 누출돼도 다른 쪽이 보호.

### 2. timing-safe 비교
`verifyPassword` / `verifySuperAdminToken` 모두 `crypto.timingSafeEqual` 사용. 비밀번호 / 쿠키 길이로 추측 공격 방어.

### 3. TOTP 30초 윈도우
- 코드 입력 시점이 시간 동기화 잘 안 맞을 수도
- 현재 시간 ± 30초 (총 60초) 윈도우에서 검증

### 4. 쿠키 만료
- 쿠키 자체에 만료 시간 인코딩 + HMAC 서명
- 서버 측 세션 저장 없음 (stateless)
- 만료된 쿠키는 검증 실패

### 5. 자기 자신 권한 변경 차단
- 슈퍼관리자가 자기 role 을 'user' 로 바꾸면 lockout
- API 라우트에서 `if (id === user.id) return 400` 가드

### 6. 마지막 super 강등 / 삭제 차단
- 모든 superadmin 사라지면 시스템 잠김
- 강등/삭제 시 `count(role='superadmin') <= 1` 체크

## 비밀번호 / TOTP 회전

### 비밀번호 변경
1. PBKDF2 해시 생성 스크립트 실행 (별도 유틸)
2. `SUPER_ADMIN_PASSWORD_HASH` env 업데이트
3. Vercel 재배포
4. 새 비밀번호로 로그인 테스트
5. 이전 활성 쿠키들 무효화 (HMAC_SECRET 도 같이 회전 권장)

### HMAC 시크릿 회전
1. 새 random 32+ chars 생성
2. `SUPER_ADMIN_HMAC_SECRET` 업데이트
3. 재배포 → 모든 기존 쿠키 자동 무효 (서명 불일치)
4. 운영자들 다시 로그인

### TOTP 시크릿 회전
1. 새 base32 시크릿 생성 (`speakeasy.generateSecret()`)
2. `SUPER_ADMIN_TOTP_SECRET` 업데이트
3. 재배포
4. 운영자가 Google Authenticator 에 새 시크릿 등록 (QR 코드 또는 manual)

## 흔한 미스

### 슈퍼관리자 페이지를 광장 어드민이 진입 시도
- 의도된 차단 — `verifySuperAdminToken` 가 false 반환 → 403
- legacy `profiles.role='admin'` 으로는 부족 (super 또는 cookie 필요)

### service-role 클라이언트 사용 후 검증 누락
- super 라고 무조건 모든 작업 OK 가 아님
- 자기 자신 변경 / 마지막 super 강등 등 별도 가드 필요

### 쿠키 누출
- 브라우저 dev tools 에서 쿠키 보임 (httpOnly 가드 외)
- HTTPS 필수 (`Secure` flag)
- localhost dev 에선 secure 비활성 가능

### TOTP 시크릿 backup
- 시크릿 누출 방지하면서도 기록 필요 (vault / 1Password)
- QR 코드만 갖고 있으면 운영자 다 죽었을 때 진입 불가

## 운영 권장

- **2명 이상 슈퍼관리자** 유지 (한 명 회사 떠나도 lockout 방지)
- 분기마다 비밀번호 + HMAC 시크릿 회전
- 의심 시 즉시 회전 (이메일 phishing 같은 케이스)
- `admin_actions` 테이블 (audit log) 정기 검토

## 다음 읽을 문서

- 광장 추가 / 어드민 임명 → `02-multi-plaza.md`
- 환경변수 회전 → `08-environment.md`
- 어드민 권한 통합 헬퍼 → `03-auth-permissions.md`
