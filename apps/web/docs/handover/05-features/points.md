# 포인트 시스템

## 개요

광장의 활동 보상 + 결제 일부 충당 통화. 1포인트 = 1원 (기본). 적립 → 평가 (24h pending → confirmed) → 사용 → 환원의 흐름. atomic RPC 로 race-free.

## 핵심 파일

```
lib/services/billing/points.ts                # 포인트 헬퍼
app/api/points/                               # 라우트
  balance/route.ts                            # 잔액 조회
  history/route.ts                            # 거래 내역
  rules/route.ts                              # 적립 규칙 조회
app/api/cron/evaluate-points/                 # 평가 cron

supabase/migrations/
  20260525000000_points_foundation.sql        # 토대
  20260601000000_points_audit_fixes.sql       # audit fix
  20260606000001_points_rules_complete.sql    # 적립 규칙 완성
  20260606000008_atomic_rpcs.sql              # 핵심 RPC
  20260621000003_points_refund_spend_rpc.sql  # spend 환원 RPC (Phase 1)
  20260621000006_drop_invalid_point_transactions_trigger.sql  # 트리거 fix (Phase 1)
```

## 데이터 모델

### `point_transactions`
모든 포인트 거래 기록.

| 컬럼 | 의도 |
|---|---|
| id, user_id, plaza_id | |
| type | 'earn' / 'spend' / 'revert' / 'expire' / 'manual_adjust' / 'penalty' / 'event' |
| amount | 양수 (절대값). type 으로 ± 결정 |
| source | 'post.create' / 'comment.create' / 'group_buying.purchase' / ... |
| source_id | 연결 콘텐츠 ID |
| rule_id | 적용된 적립 규칙 ID (point_rules) |
| status | 'pending' / 'confirmed' / 'reverted' |
| evaluation_at | 평가 예정 시각 (보통 created_at + 24h) |
| confirmed_at, reverted_at, reverted_reason | |
| metadata | JSONB |

> ⚠️ **`updated_at` 컬럼 없음**. 트리거 잘못 붙으면 silent fail (Phase 1 fix).

### `user_points`
사용자별 잔액.

| 컬럼 | 의도 |
|---|---|
| user_id, plaza_id (PK) | |
| available | 사용 가능 잔액 |
| pending | pending earn 합계 (아직 confirmed 안 된 적립) |
| lifetime_earned, lifetime_spent, lifetime_reverted | 누적 |
| reputation_score | 평판 (신고 시 -10) |
| is_suspended | TRUE 시 적립 정지 |

### `point_rules`
적립 규칙.

| 컬럼 | 의도 |
|---|---|
| code | 'post.create', 'comment.create', ... (PK) |
| points | 적립 점수 |
| daily_limit | 일 한도 |
| enabled | on/off |
| description | 사용자에게 표시 |

### `point_redemption_settings`
사용 정책.

| 컬럼 | 의도 |
|---|---|
| category | 'local_food' / 'group_buying' / 'bump' / 'giftcard' / ... (PK) |
| display_name | UI 라벨 |
| enabled | on/off |
| max_redemption_pct | 결제액의 몇 % 까지 사용 가능 (예: 30) |
| daily_limit_pt | 일 사용 한도 |
| exchange_rate | 1포인트 = N원 (기본 1) |
| min_payment_total | 최소 결제액 (이하 사용 차단) |

## 적립 (Earn)

### 시퀀스
```
1. 사용자 활동 (글 작성 / 댓글 / 좋아요 받음 등)
   ↓
2. 라우트에서 INSERT point_transactions
   - type='earn', status='pending', evaluation_at = now() + 24h
3. evaluate-points cron (15분 등)
   - status='pending' AND evaluation_at < NOW() 인 tx 처리
   - 위반 (글 삭제 등) → points_revert_one
   - 정상 → points_confirm_one
4. confirmed → user_points.available += amount
```

### 왜 24h pending?
- 글 작성 직후 적립 잔액 즉시 반영 시 spam 후 삭제로 어뷰즈 가능
- 24h 후 정상이면 확정

### `points_confirm_one(tx_id)` RPC
```sql
UPDATE point_transactions SET status='confirmed', confirmed_at=NOW()
WHERE id=p_tx_id AND status='pending'
RETURNING user_id, plaza_id, type, amount;

-- earn 만 잔액 반영
UPDATE user_points SET
  available = available + amount,
  pending = GREATEST(0, pending - amount),
  lifetime_earned = lifetime_earned + amount
WHERE user_id=... AND plaza_id=...;
```

### 일 한도 (daily_limit)
글 작성 / 댓글 / 좋아요 받기 등 자주 발생하는 활동은 일 한도 적용. 라우트에서 카운트 후 limit 도달 시 적립 skip.

### 적립 안 하는 케이스
- 본인이 본인 글 좋아요
- 어드민 / 봇 계정
- is_suspended=true 사용자

## 사용 (Spend)

### 시퀀스
```
1. 결제 페이지에서 사용자가 포인트 입력
2. 서버: 정책 검증 (max_redemption_pct, daily_limit_pt, min_payment_total)
3. RPC points_spend_atomic(...)
4. 성공 시 tx_id 받음 → 주문 row 에 points_tx_id 저장
5. user_points.available -= amount
```

### `points_spend_atomic(user_id, plaza_id, category, amount, payment_total, source_id)` RPC

```sql
-- 정책 조회
SELECT enabled, max_redemption_pct, daily_limit_pt, min_payment_total
FROM point_redemption_settings WHERE category=p_category;

-- 검증
- enabled = true
- payment_total >= min_payment_total
- amount <= floor(payment_total * max_redemption_pct / 100)
- 일 한도 (daily_limit_pt) 검증
- user_points.available >= amount
- is_suspended = false

-- 처리
INSERT INTO point_transactions (type='spend', status='confirmed', amount, ...)
RETURNING id INTO tx_id;

UPDATE user_points SET
  available = available - amount,
  lifetime_spent = lifetime_spent + amount;

RETURN { ok: true, tx_id }
```

### 환원 (Cancel / Refund)

`points_refund_spend(tx_id, reason)` RPC (Phase 1 신설):

```sql
UPDATE point_transactions SET
  status='reverted',
  reverted_at=NOW(),
  reverted_reason=p_reason
WHERE id=p_tx_id
  AND status IN ('pending', 'confirmed')
  AND type='spend'
RETURNING user_id, plaza_id, amount;

-- 멱등: 이미 reverted 면 v_tx IS NULL, no-op

UPDATE user_points SET
  available = available + ABS(amount)  -- 양수 양수 보호
WHERE ...;

RETURN { ok: true, refunded: amount }
```

### 호출 위치
- 주문 cancel: `app/api/local-food-orders/[id]/cancel/route.ts`, `app/api/group-buying-orders/[id]/cancel/route.ts`
- 주문 INSERT 실패 롤백: 라우트 안 catch 블록
- idempotency 동시 요청: 23505 분기

## 회수 (Revert)

`points_revert_one(tx_id, reason)` — 신고 / 글 삭제 시 earn 회수.

```sql
UPDATE point_transactions SET status='reverted', ...
WHERE id=p_tx_id AND status IN ('pending', 'confirmed');

-- earn 만 잔액 회수 (spend 는 이미 다른 곳에 쓴 돈, 환원 X)
UPDATE user_points SET
  available = GREATEST(0, available - amount),
  lifetime_reverted = lifetime_reverted + amount,
  reputation_score = GREATEST(0, reputation_score - 10);

RETURN ...
```

### `points_revert_one` vs `points_refund_spend` 차이

| | `points_revert_one` | `points_refund_spend` |
|---|---|---|
| 대상 type | earn / 모두 | spend 만 |
| 잔액 처리 | available -= amount (회수) | available += amount (환원) |
| 의도 | 위반 시 적립 빼앗기 | 결제 취소 시 사용 포인트 돌려주기 |
| reputation | -10 | 영향 없음 |

## bump (글 올리기)

`bump_purchase_ticket_atomic(...)` RPC:
- 사용자가 보유한 bump 티켓 차감
- 또는 포인트 사용 (`points_spend_atomic` category='bump')
- 글의 `bumped_at = NOW()` → 목록 상단 노출

## 평판 (`reputation_score`)

| 이벤트 | 변화 |
|---|---|
| 가입 시 | +100 |
| 위반 신고 누적 (revert) | -10 per |
| 일정 기간 활동 없음 | (없음 — decay 미구현) |
| 0 이하 | 활동 제한 / is_suspended 검토 |

## 카테고리별 정책 (`point_redemption_settings`)

| category | 의도 | 권장 정책 |
|---|---|---|
| local_food | 로컬푸드 결제 | 30% / 일 5000P |
| group_buying | 공구 결제 | 30% / 일 5000P |
| bump | 글 올리기 | 100% (포인트로만 사용) |
| giftcard | 기프티콘 교환 | 100% / 최소 10000P |

운영자가 `/super-admin/site-settings` 또는 SQL 로 조정.

## 평가 cron — `evaluate-points`

`app/api/cron/evaluate-points/route.ts`:

```ts
1. SELECT id FROM point_transactions
   WHERE status='pending' AND evaluation_at < NOW()
2. 각 tx 에 대해:
   - 위반 검증 (글 삭제 / 신고 누적 등)
   - 위반 → points_revert_one
   - 정상 → points_confirm_one
```

## 잔액 조회 — `/api/points/balance`

```ts
GET /api/points/balance
→ {
  available: number
  pending: number
  lifetime_earned: number
  lifetime_spent: number
  reputation_score: number
  is_suspended: boolean
}
```

## 거래 내역 — `/api/points/history`

```ts
GET /api/points/history?type=earn&limit=50
→ {
  transactions: [
    { id, type, amount, source, status, created_at, ... }
  ]
}
```

## 보안 / 무결성

### 1. atomic RPC 만 사용
직접 SQL 로 user_points UPDATE 금지. 일관성 깨짐.

### 2. status 머신
pending → confirmed | reverted (단방향)
confirmed → reverted (한 번)
reverted → 변경 불가

### 3. amount 양수
- `point_transactions.amount` 항상 양수 (절대값)
- type 으로 ± 결정
- `ABS()` 방어

### 4. 일 한도
- daily_limit (적립): 적립 시 검증
- daily_limit_pt (사용): 사용 시 검증

### 5. is_suspended
- 적립 / 사용 모두 차단
- 어드민이 신고 누적 시 수동 토글 또는 자동 (reputation_score 0)

## 흔한 미스 / 함정

### 1. earn / spend / revert / refund 혼동
- earn: 적립 (+available)
- spend: 사용 (-available)
- revert: earn 회수 (-available, reputation -10)
- refund (refund_spend): spend 환원 (+available, 멱등)

### 2. status 변경 트리거 silent 실패
- point_transactions 에 `updated_at` 트리거 잘못 붙으면 모든 UPDATE 실패
- 결과: cancel 했는데 환원 안 됨 (Phase 1 발견)
- 해결: 잘못된 트리거 제거 (`20260621000006`)

### 3. tx_id 누락
- 주문 row 의 `points_tx_id` 저장 안 하면 환원 못 함
- INSERT 흐름에서 명시 필수

### 4. 멱등성 가정 깨짐
- 같은 tx 두 번 환원 시도 → 첫 번째만 처리, 두 번째는 no-op
- 코드가 "환원 됐으니 잔액 + amount" 로 가정하면 잔액 중복 증가
- RPC 결과 (`ok: true, refunded: N`) 로 실제 환원 확인

### 5. 환율 (exchange_rate)
- 현재 1포인트 = 1원 가정
- exchange_rate ≠ 1 일 때 코드가 적용 안 함 (마이그 코멘트에 "향후 환전율 적용 자리")
- 다국가 / 다통화 시 보강 필요

## 모니터

### Daily
- pending tx 누적 (cron 미동작 시그널)
- reverted 비율 (어뷰즈 감지)

### Weekly
- 광장별 / 사용자별 적립 / 사용 통계
- reputation_score 분포

### Monthly
- 운영 비용 (적립 - 사용 - 환원)

## 다음 읽을 문서

- 적립 cron → `06-operations/cron-jobs.md`
- bump 시스템 → `05-features/property.md` (bump 사용처)
- 결제 통합 → `05-features/payments.md`
- 마이그 / RPC → `09-migrations.md`
