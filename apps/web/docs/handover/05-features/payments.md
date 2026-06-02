# 결제 시스템

## 개요

광장의 결제는 **PortOne (구 아임포트)** 통합 자리에 현재는 **mock-pay** 모드로 동작. 두 도메인:

- **로컬푸드 주문** (`local_food_orders`)
- **공동구매 주문** (`group_buying_orders`)

두 주문 모두 같은 결제 추상화: pg_provider / pg_merchant_uid / amount / fee / settlement / 환불.

## 핵심 파일

```
app/api/local-food-orders/                    # 로컬푸드
app/api/group-buying-orders/                  # 공구
app/api/billing/                              # 결제 인프라
  webhook/portone/route.ts                    # PortOne 웹훅 (서명 검증)
  payouts/route.ts                            # 정산 조회
  payouts/generate/route.ts                   # 정산 생성 (운영자)
  transactions/route.ts                       # 거래 내역
  subscriptions/route.ts                      # 구독 (boost / 멤버십)
  feature-flags/route.ts                      # 기능 토글

lib/local-food-orders.ts                      # 헬퍼 (calculateFee, generateMerchantUid)
```

## 데이터 모델

### `local_food_orders` / `group_buying_orders`
공통 필드:

| 컬럼 | 의도 |
|---|---|
| pg_provider | 'portone' / 'mock' |
| pg_payment_id | PortOne 의 결제 식별자 (`paymentId` / `imp_uid`) |
| pg_merchant_uid | 우리 측 발급 주문번호 (UUID, UNIQUE) |
| pg_raw | PG 원본 응답 / 웹훅 페이로드 (JSONB, 디버깅 / 감사) |
| amount | 결제 총액 (원) |
| fee_amount | 플랫폼 수수료 (생산자 / 판매자 부담) |
| settlement_amount | GENERATED = amount - fee_amount |
| **idempotency_key** | UNIQUE `(buyer_id, idempotency_key)` (Phase 1) |
| paid_at, refunded_at, settled_at, cancelled_at | |
| status | pending / paid / shipped / delivered / confirmed / refund_requested / refunded / cancelled / settled (또는 group_confirmed for group-buying) |

### `payment_webhooks`
PG 웹훅 멱등성 보장.

| 컬럼 | 의도 |
|---|---|
| pg_provider, pg_payment_id, event_type | UNIQUE `(pg_provider, pg_payment_id, event_type)` |
| raw_body | JSONB |
| processed_at | NULL = 미처리 / TIMESTAMPTZ = 처리 완료 |

## 결제 흐름

### 1. 주문 생성 (서버 측 도출)
```ts
const merchant_uid = generateMerchantUid()  // 'lfo-xxxx-yyyy' UUID
const fee_amount = calculateFee(amount)
const order = await supabase.from('local_food_orders').insert({
  buyer_id: user.id,
  seller_id: foods[0].user_id,  // server-side
  amount,                       // server-side (sum unit_price * quantity)
  fee_amount,
  pg_provider: 'mock',          // production: 'portone'
  pg_merchant_uid: merchant_uid,
  status: 'pending',
  idempotency_key,
}).select().single()
```

### 2. 결제 호출 (클라이언트)
- mock 모드: 즉시 status='paid' 갱신 (별도 mock-pay 라우트)
- production: PortOne JS SDK 호출
  ```ts
  PortOne.requestPayment({
    storeId: plaza.portone_store_id,
    channelKey: plaza.portone_channel_key,
    paymentId: merchant_uid,  // 우리 주문번호
    orderName: '...',
    totalAmount: amount,
    currency: 'KRW',
    payMethod: 'CARD',
  })
  ```

### 3. 결제 완료 → 웹훅
PortOne → POST /api/billing/webhook/portone

- 서명 검증 (`X-Portone-Signature` 헤더, `PORTONE_WEBHOOK_SECRET` 으로 HMAC 검증)
- payment_webhooks INSERT (UNIQUE 위반 시 멱등 처리, no-op)
- 주문 status 갱신 (pending → paid, paid_at = NOW)
- 알림 발송 (구매자 / 판매자)

### 4. 운송 / 구매 확정
- 판매자: tracking_number 입력 → status='shipped'
- 구매자: 수령 확인 → status='confirmed'

### 5. 정산
- billing-monthly-payout cron 또는 수동
- payouts 테이블 INSERT
- 판매자 계좌로 송금 (외부)
- status='settled'

### 6. 환불 (필요 시)
- 구매자 환불 요청 → status='refund_requested'
- 판매자 / 운영자 승인 → status='refunded'
- PortOne cancel API 호출 (실 결제 시)
- 포인트 환원 (`points_refund_spend` RPC)

## mock-pay 모드

### 활성 조건
- `pg_provider = 'mock'`
- 주문 INSERT 시 status='pending', 별도 mock-pay 라우트가 즉시 paid 처리

### Production fail-closed
production 환경에서 mock-pay 사용 차단:
```ts
if (process.env.MOCK_PAY_ENABLED !== 'true' && process.env.NODE_ENV === 'production') {
  return NextResponse.json({ error: 'mock-pay disabled in production' }, { status: 403 })
}
```

`MOCK_PAY_ENABLED=true` 환경변수가 의도적으로 켜져있어야 production 에서도 mock 동작 (테스트 시기에만, 그 외엔 비워둠).

### 한계
- 실제 결제 안 일어남
- PortOne 웹훅 시뮬레이션 안 됨
- 카드 / 계좌 / 카카오페이 흐름 검증 불가

## idempotency_key

### 클라이언트 발급
프론트가 결제 시도 시 UUID 발급:
```ts
const idempotencyKey = crypto.randomUUID()
const order = await fetch('/api/local-food-orders', {
  method: 'POST',
  body: JSON.stringify({ items, delivery_addr, idempotency_key: idempotencyKey }),
})
```

### 서버 처리
1. `body.idempotency_key` 있으면 기존 주문 조회 → 있으면 `{ order, idempotent: true }` 반환
2. INSERT 시도 → 23505 (UNIQUE 위반) 시:
   - 기존 row 다시 조회
   - 차감했던 포인트 환원 (rollback)
   - 기존 주문 반환

### DB 보장
```sql
CREATE UNIQUE INDEX local_food_orders_idem_uniq
  ON local_food_orders (buyer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

partial index — NULL 은 제외 (legacy 주문 다수 NULL OK).

### 효과
- 사용자 재클릭 / 네트워크 재시도 → 같은 주문 1개만 생성
- 결제 중복 차감 방지

## 컬럼 동결 트리거 (Phase 1)

`local_food_orders` 의 결제 핵심 컬럼은 `BEFORE UPDATE` 트리거로 동결.

`local_food_orders_freeze_critical()`:
- service_role (admin client) 만 통과
- 일반 사용자가 RLS 우회로 amount / pg_payment_id / paid_at 등 변경 시도 시 RAISE EXCEPTION

`group_buying_orders` 도 동일 트리거 적용 권장 (현재는 한쪽만).

## 수수료 계산

`lib/local-food-orders.ts:calculateFee(amount)`:
- 비율 (예: 5%) 또는 정액 (예: 1000원)
- 광장 / 카테고리별 차등 가능

## 가맹점 주문번호 (`pg_merchant_uid`)

`generateMerchantUid()`:
- UUID 기반 (`lfo-xxxxxxxx` 또는 `gbo-xxxxxxxx` prefix)
- 광장별 / 도메인별 prefix 가능
- UNIQUE 제약 (DB 레벨 + 앱 레벨)

## 포인트 통합

자세한 건 `05-features/points.md` 참조. 요약:
- 결제 시 일부 포인트 사용 가능 (`max_redemption_pct` 정책)
- `points_spend_atomic` RPC 호출
- 주문 cancel/refund 시 `points_refund_spend` RPC 환원

## PortOne 웹훅 처리

### 서명 검증 (위치)
`app/api/billing/webhook/portone/route.ts`:
```ts
const signature = req.headers.get('x-portone-signature')
const body = await req.text()
const expected = crypto.createHmac('sha256', WEBHOOK_SECRET)
  .update(body).digest('hex')
if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
  return 401
}
```

### 멱등성
```ts
await supabase.from('payment_webhooks').insert({
  pg_provider: 'portone',
  pg_payment_id: payload.paymentId,
  event_type: payload.eventType,
  raw_body: payload,
})
// UNIQUE 위반 시 23505 → 이미 처리, no-op
```

### 리플레이 방지 (Phase 1 연기)
A4: timestamp + nonce 검증 미구현. PortOne 정식 발급 후 추가.

## 정산 (`payouts`)

### 자동 정산 cron
`billing-monthly-payout`: 월 1회
- 광장별 / 판매자별 합계 (status='confirmed' 후 N일 경과)
- payouts 테이블 INSERT
- 송금 (외부) 또는 정산 메일

### 수동 정산
운영자: `/super-admin/payouts/generate` (또는 비슷)

## 알림

### 구매자 알림
- 결제 완료 → 'order_paid'
- 발송 → 'order_shipped'
- 환불 처리 → 'order_refunded'

### 판매자 알림
- 주문 받음 → 'order_received'
- 정산 완료 → 'payout_completed'

## 주의점

### 1. server-side 도출 의무
amount / seller_id 를 클라이언트가 보내면 위변조 가능. 반드시 라우트에서 DB 조회 → 도출.

### 2. 컬럼 동결
결제 핵심 컬럼은 `service_role` 외 변경 차단. 트리거 + RLS 둘 다 layer.

### 3. 환불 후 재시도 차단
환불된 주문은 다시 'paid' 로 못 돌아옴. status 머신 단방향.

### 4. PortOne 채널키 광장별
한 PortOne 계정에 여러 채널 등록. 광장별 `plazas.portone_channel_key` 로 분리.

### 5. 통화 단위
- amount 는 INTEGER (원). 소수점 없음.
- 기프티콘 / 외화 거래 시 별도 컬럼 필요

### 6. 결제 시도 vs 결제 완료
- 주문 INSERT = 시도 (status=pending)
- 웹훅 paid = 완료
- 시도만 있고 완료 못 한 주문은 cancel cron 으로 정리

## 운영 체크

### Daily
- payment_webhooks 처리 누락 (`processed_at IS NULL` AND created_at < now() - '1 hour')
- 환불 신청 누적 처리

### Weekly
- 정산 주기 지연 없는지
- PortOne 콘솔 거래 vs 우리 DB 일치성

### Monthly
- 정산 합계 vs 실 송금 일치 확인
- 미정산 잔액

## 확장 시

### 다중 PG (Toss / Naver Pay)
- `pg_provider` enum 확장
- 각 PG SDK / 웹훅 별도 라우트

### 부분 환불
- 현재 전체 환불만
- 부분 환불 → `refunded_amount` 컬럼 + status 머신 보강

### 정기 결제 (Subscription)
- `subscriptions` 테이블 (이미 billing 에 있음) 활용
- 매월 자동 결제 cron

### 포인트 환원 비율
- 환불 시 포인트만 100% 환원
- 부분 환불 비율 계산 필요

## 다음 읽을 문서

- 포인트 → `05-features/points.md`
- 정산 cron → `06-operations/cron-jobs.md`
- 외부 통합 (PortOne) → `07-integrations.md`
- 환경변수 → `08-environment.md`
