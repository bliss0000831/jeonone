# 06/maintenance — 점검 모드 (Maintenance Mode)

## 개요

DB 마이그 / R2 키 회전 / 결제 PG 변경 같은 위험 작업 중 사용자 트래픽 차단용. 환경변수 토글만으로 즉시 활성화 가능. middleware 가 모든 요청을 503 + `/maintenance` 페이지로 rewrite.

## 동작

### 트리거
`MAINTENANCE_MODE=true` Vercel env + 재배포 (또는 빈 commit push).

### middleware 분기 (`middleware.ts`)
```ts
if (process.env.MAINTENANCE_MODE === 'true') {
  const path = request.nextUrl.pathname
  const allow =
    path === '/maintenance' ||
    path.startsWith('/api/health') ||
    path.startsWith('/_next/') ||
    path.startsWith('/monitoring')
  const bypassToken = process.env.MAINTENANCE_BYPASS_TOKEN
  const cookieToken = request.cookies.get('maintenance-bypass')?.value
  const bypass = bypassToken && cookieToken && cookieToken === bypassToken

  if (!allow && !bypass) {
    if (path.startsWith('/api/')) {
      return NextResponse.json(
        { error: '점검 중입니다. 잠시 후 다시 시도해주세요.' },
        { status: 503, headers: { 'Retry-After': '300' } },
      )
    }
    const url = request.nextUrl.clone()
    url.pathname = '/maintenance'
    return NextResponse.rewrite(url, { status: 503 })
  }
}
```

### 통과 라우트
- `/maintenance` (안내 페이지)
- `/api/health` (헬스체크)
- `/_next/*` (정적 자원)
- `/monitoring` (Sentry tunnel)

### 운영자 우회
- `MAINTENANCE_BYPASS_TOKEN` env 설정
- 운영자 브라우저에 `maintenance-bypass=<token>` 쿠키 박음
- middleware 가 쿠키 일치하면 정상 동작 (점검 화면 안 보임)

## `/maintenance` 페이지

`app/(legal)/maintenance/page.tsx`.

`force-dynamic` + `site_settings.maintenance_settings` 에서 동적 메시지:
- 제목 (기본: "사이트 점검 중")
- 메시지 (운영자가 site_settings 에서 편집 가능)
- 시작/종료 시간 (선택)
- 문의 메일

DB 의존이라 Supabase 자체가 죽으면 페이지도 깨질 수 있음 → 그럴 땐 fallback 정적 페이지로 가기 권장.

## 사용 시점

### DB 마이그 위험
- DROP COLUMN / ALTER NOT NULL / 결제 컬럼 변경 등
- 절차:
  1. `MAINTENANCE_MODE=true` env + 재배포
  2. 모든 사용자 차단됨 확인
  3. DB backup
  4. `supabase db push`
  5. 검증
  6. `MAINTENANCE_MODE=` 비워서 재배포

### R2 / Supabase / PortOne 키 회전
- 키 변경 → 잠시 동안 일부 요청 실패 가능
- 점검 중 회전 → env 갱신 → 재배포 → 검증 후 해제

### 결제 PG 전환
- mock-pay → PortOne production 전환
- 진행 중 결제 시도 차단

### 큰 코드 배포 (신중)
- 보통 하지 않음. blue-green / 무중단 배포 권장.
- 특수 케이스: 데이터 모델 호환 안 되는 큰 리팩터

## 절차 템플릿

### 표준 점검 시작 → 종료
```
[운영자]
T-30분: 사용자 공지 (사이트 배너 / 푸시 / 이메일)
T-5분:  운영자 본인은 maintenance-bypass 쿠키 박기

T+0:
  1. Vercel env: MAINTENANCE_MODE=true
  2. Vercel: Redeploy
  3. 일반 사용자 → 503 + /maintenance 페이지 확인
  4. 본인 (bypass) → 정상 진입 확인

작업 진행 (마이그 / 키 회전 / etc)
검증 SQL / smoke test

T+N:
  1. Vercel env: MAINTENANCE_MODE 삭제
  2. Vercel: Redeploy
  3. 일반 사용자 → 정상 진입 확인
  4. /api/health 200
  5. 사용자 공지 (점검 종료)
```

## 점검 페이지 메시지 편집

### site_settings 에 maintenance_settings 키
```sql
UPDATE site_settings
SET value = jsonb_build_object(
  'title', '사이트 점검 중',
  'message', '6/22 03:00~04:00 시스템 점검을 진행합니다.\n불편을 드려 죄송합니다.',
  'start_at', '2026-06-22T03:00:00+09:00',
  'end_at', '2026-06-22T04:00:00+09:00',
  'contact_email', 'admin@gwangjang.app'
)
WHERE key = 'maintenance_settings';
```

또는 `/super-admin/site-settings` UI 에서 편집.

## 검증 (점검 모드 동작 확인)

dev 에서 한 번 검증:
```bash
$env:MAINTENANCE_MODE='true'; pnpm dev   # PowerShell
# 또는
MAINTENANCE_MODE=true pnpm dev            # bash
```

브라우저:
- `http://localhost:3000/` → 503 + /maintenance 페이지
- `http://localhost:3000/api/health` → 200 (정상)
- `http://localhost:3000/api/properties` → 503 JSON

bypass 쿠키 박고 재진입:
```js
document.cookie = 'maintenance-bypass=<token>; path=/'
```

## 주의

### `MAINTENANCE_MODE` env 이름 정확히
오타 (`MAINTENACE_MODE` 등) 시 점검 모드 활성 안 됨. 사용자에게 사이트 정상으로 보이지만 작업 중 데이터 충돌 가능.

### bypass 토큰 누출
URL 에 노출 X (쿠키만), 운영자 사이에서 1Password / 사내 노트로 공유.

### 점검 모드인 채 깜빡 잊고 잠
다음 사용자 접속 시 503 만 보고 사이트 죽었다고 인식. **점검 시작 시 알람 / 종료 체크리스트 필수**.

### Vercel preview deployment 도 영향
preview URL 도 같은 env 적용. PR 검증 시 헷갈림.
- 환경변수를 production 에만 한정 (Vercel 콘솔 환경별 설정)
- 또는 preview 별도 env 키 사용

### /maintenance 페이지 자체가 DB 의존
Supabase 자체 점검 시 페이지도 못 뜸. fallback 정적 HTML 도 검토 가능.

## 다음 읽을 문서

- 환경변수 변경 절차 → `08-environment.md`
- 배포 / 롤백 → `11-deployment.md`
- 마이그 적용 → `09-migrations.md`
