# 06/cron-jobs — Cron Jobs

## 개요

광장은 6개의 자동화 작업을 cron 으로 운영. Vercel cron 또는 외부 cron 으로 호출 가능. 모두 `app/api/cron/` 하위 라우트.

## 인증

`lib/security/cron-auth.ts:verifyCronAuth(authHeader)` 로 통일.

```ts
import { verifyCronAuth } from '@/lib/security/cron-auth'

export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request.headers.get('authorization'))) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }
  // cron 작업
}
```

- timing-safe 비교 (`crypto.timingSafeEqual`)
- `Authorization: Bearer $CRON_SECRET` 헤더
- Vercel cron 도 자동으로 이 헤더 추가
- 외부 cron (GitHub Actions, Render scheduler 등) 도 동일하게 호출

## 6개 cron

### 1. `group-buying-auto-process` (`app/api/cron/group-buying-auto-process/`)

**주기**: 매시간 또는 일 1회 (정해진 schedule 은 vercel.json)

**의도**:
- 마감일(`group_buying_posts.deadline`) 지난 공구 글 자동 처리
- 결제 완료(`paid`) 주문 수가 `min_participants` 이상 → `confirmed` (성사)
- 미달 → `cancelled` + 주문 환불 (`refunded`)

**호출**:
- RPC `group_buying_auto_process()` (DB 안에서 일괄 처리)

**메서드**:
- GET: cron 또는 외부 호출 (CRON_SECRET 헤더)
- POST: 슈퍼관리자 수동 트리거 (UI 버튼)

**실패 동작**:
- `logErrorWithContext` 로 Sentry 전송
- 다음 firing 에서 재시도

### 2. `evaluate-points` (`app/api/cron/evaluate-points/`)

**주기**: 자주 (15분 등)

**의도**:
- `point_transactions.status='pending'` + `evaluation_at < NOW()` 인 tx 평가
- 통과 → `points_confirm_one(tx_id)` RPC → `confirmed` + 잔액 반영
- 위반 (예: 글 삭제됨, 신고 누적) → `points_revert_one` 호출

**왜 24h 평가?**
- 글 작성하자마자 적립 잔액 반영 시 spam 후 삭제로 어뷰즈 가능
- 24h pending 후 confirmed 정책

### 3. `billing-monthly-payout` (`app/api/cron/billing-monthly-payout/`)

**주기**: 월 1회 (1일 새벽)

**의도**:
- 광장별 / 생산자별 정산 합계 계산
- `payouts` 테이블에 row 생성
- 정산 메일 발송 (선택)

**대상**:
- 매물 boost 결제 수익 → 광장 운영자 정산
- 로컬푸드 / 공구 주문 → 판매자 정산

### 4. `billing-expire-free-period` (`app/api/cron/billing-expire-free-period/`)

**주기**: 일 1회

**의도**:
- 무료 기간 종료된 사용자 / 광장 자동 plan 변경
- subscriptions 의 trial 만료 처리

### 5. `detect-business-operators` (`app/api/cron/detect-business-operators/`)

**주기**: 일 1회 또는 매주

**의도**:
- 일반 계정인데 사업자처럼 활동(매물 N건 이상 / 광고성 게시글 등)하는 사용자 탐지
- 어드민에게 알림 → 수동 검토 → account-requests 자동 발송

### 6. `tour-events` (`app/api/cron/tour-events/`)

**주기**: 일 1회 (아침)

**의도**:
- 한국관광공사 Tour API 에서 광장별 지역 이벤트 fetch
- DB 에 캐싱 → 광장 홈에서 표시

**의존**:
- `plazas.tour_area_code`, `plazas.tour_sigungu_code`
- `TOUR_API_KEY` env

## Vercel cron 설정

`vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/group-buying-auto-process", "schedule": "0 * * * *" },
    { "path": "/api/cron/evaluate-points", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/billing-expire-free-period", "schedule": "0 2 * * *" },
    { "path": "/api/cron/billing-monthly-payout", "schedule": "0 3 1 * *" },
    { "path": "/api/cron/detect-business-operators", "schedule": "0 4 * * *" },
    { "path": "/api/cron/tour-events", "schedule": "0 6 * * *" }
  ]
}
```

(실제 스케줄은 vercel.json 참조)

### Cron 모니터
- Vercel Dashboard > Cron Jobs > 마지막 실행 / 응답 / 에러
- Sentry 에서 cron tag 로 필터링 가능

## 외부 cron 옵션

### GitHub Actions
```yaml
on:
  schedule:
    - cron: '0 * * * *'
jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -X GET "https://gwangjang.app/api/cron/group-buying-auto-process" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

### 외부 스케줄러 (Render / Railway / cron-job.org)
같은 패턴. URL + Authorization 헤더만 설정.

## 새 cron 추가 절차

### 1. 라우트 만들기
```ts
// app/api/cron/my-new-cron/route.ts
import { NextResponse, type NextRequest } from "next/server"
import { verifyCronAuth } from "@/lib/security/cron-auth"
import { logErrorWithContext } from "@/lib/logger"

export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 })
  }
  try {
    // 작업 수행
    return NextResponse.json({ ok: true, ... })
  } catch (err) {
    logErrorWithContext("[cron] my-new-cron failed", err, {
      cron: "my-new-cron",
    })
    return NextResponse.json({ error: "처리 실패" }, { status: 500 })
  }
}
```

### 2. vercel.json 에 schedule 추가

### 3. 슈퍼관리자 수동 트리거 (선택)
POST 핸들러 추가 + 슈퍼 어드민 토큰 검증.

### 4. 모니터
Sentry 알림 룰 + Vercel cron logs 확인.

## 흔한 cron 미스

### 1. CRON_SECRET 환경변수 빠뜨림
`verifyCronAuth` 가 항상 false 반환 → 403. Vercel cron 이 정상 호출해도 막힘.

### 2. cron 안에서 throw
catch 안 하면 Vercel logs 에 stack trace 만 보이고 재시도 X. `try/catch + logErrorWithContext + 200/500` 응답.

### 3. RPC 호출 실패 silent
Supabase RPC 가 에러 반환해도 코드가 무시하면 다음 cron 까지 누적. `error` 검증 의무.

### 4. 시간대 불일치
- Vercel cron 은 UTC
- DB `NOW()` 는 UTC (TIMESTAMPTZ)
- 사용자 표시는 KST (Asia/Seoul)
- cron 이 KST 새벽 3시 의도면 UTC 18시(전날) 로 적어야

### 5. cron 동시 firing 중복 처리
- 같은 cron 이 두 번 동시 호출되면 (희박하지만)
- atomic RPC 또는 advisory lock 또는 idempotent 패턴 필수
- 예: `group_buying_auto_process()` 는 status='recruiting' 만 변경 (이미 'cancelled' 면 no-op)

### 6. 실패 알림 부재
- Sentry 알림 룰 설정 필수
- error rate > 0 또는 특정 cron tag → 즉시 알림

## 운영 체크

### Daily
- Vercel cron logs (모든 cron 정상 firing)
- Sentry cron tag 에러 0

### Weekly
- 각 cron 의 처리량 추이 (예: group_buying_auto_process 가 몇 건 처리)
- 비정상 spike 감지

## 다음 읽을 문서

- maintenance mode (cron 영향 없음 / health 만 통과) → `06-operations/maintenance.md`
- Sentry 알림 → `07-integrations.md`
