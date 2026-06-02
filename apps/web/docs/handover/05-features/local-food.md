# 로컬푸드 직거래

## 개요

지역 생산자 ↔ 소비자 직거래. PG 결제 + 택배 단일 배송 + 정산. PortOne 통합 자리 + dev 는 mock-pay.

## 핵심 파일

```
app/(plaza)/local-food/                       # UI
  page.tsx                                    # 상품 목록
  new/page.tsx                                # 상품 등록 (생산자만)
  [id]/page.tsx                               # 상품 상세 + 구매 모달

app/api/local-food/                           # 상품 라우트
  route.ts                                    # GET / POST
  [id]/route.ts                               # GET / PATCH / DELETE

app/api/local-food-orders/                    # 주문 라우트
  route.ts                                    # POST 주문 생성
  [id]/cancel/route.ts                        # 취소 (pending 만)
  [id]/refund/route.ts                        # 환불 신청 (paid/shipped 후)
  [id]/confirm/route.ts                       # 구매 확정
```

## 데이터 모델

### `local_food`
| 컬럼 | 의도 |
|---|---|
| id, user_id (생산자), plaza_id | |
| title, content, description, category | |
| original_price, price, unit | 정가 / 판매가 / 단위 (kg, 박스 등) |
| images, status | available / sold_out / hidden |
| location, district | 산지 |

### `local_food_orders`
| 컬럼 | 의도 |
|---|---|
| id, buyer_id, seller_id (생산자), plaza_id | |
| status | pending / paid / shipped / delivered / confirmed / refund_requested / refunded / cancelled / settled |
| amount, fee_amount, settlement_amount (GENERATED = amount - fee) | |
| points_used, points_tx_id | |
| delivery_addr (JSONB) | 받는사람 / 연락처 / 주소 / 상세 / 우편번호 |
| buyer_memo, seller_memo | |
| tracking_company, tracking_number | 운송장 |
| pg_provider, pg_payment_id, pg_merchant_uid (UNIQUE), pg_raw | |
| **idempotency_key** | UNIQUE (Phase 1) |
| 각종 `*_at` | paid_at, shipped_at, delivered_at, confirmed_at, refunded_at, cancelled_at, settled_at |

### `local_food_order_items`
한 주문 N개 상품 (카트 도입 대비). 가격 스냅샷 — 글 수정 후에도 주문은 가격 안 바뀜.

| 컬럼 | 의도 |
|---|---|
| order_id (FK CASCADE), local_food_id (FK RESTRICT) | |
| title, unit, unit_price, quantity, subtotal (GENERATED) | 스냅샷 |
| thumbnail_url | |

### `producer_settlements`
정산 계좌 (KYC). PK `user_id`.

| 컬럼 | 의도 |
|---|---|
| bank_code, bank_name, bank_account, account_holder | 계좌 |
| business_number | 사업자등록번호 (선택, 미등록 시 연 매출 1만원 제한 등 정책) |
| is_verified, verified_at | KYC 검증 |

### `payment_webhooks`
PG 웹훅 멱등성. UNIQUE `(pg_provider, pg_payment_id, event_type)`.

## 시퀀스 — 주문 → 구매확정

```
1. 생산자: /local-food/new → POST /api/local-food
   - 상품 등록 (가격 / 이미지 / 단위)
   ↓
2. 구매자: 상품 페이지 → "구매하기" → 모달 (수량 / 배송지 / 메모)
   ↓
3. POST /api/local-food-orders
   - body: { items, delivery_addr, buyer_memo, points_used?, idempotency_key? }
   - server-side 도출:
     * sellerId = foods[0].user_id (모든 아이템 동일 생산자 검증)
     * amount = sum(unit_price * quantity)
     * fee_amount = calculateFee(amount)
     * pg_merchant_uid = generateMerchantUid()
   - idempotency_key 처리 (있으면 기존 주문 반환)
   - 검증: 본인 X / 동일 생산자 / status / plaza_id 일치
   - 포인트 사용 (있으면)
     * points_redemption_settings.local_food.max_redemption_pct (예: 30%)
     * RPC points_spend_atomic
   - INSERT local_food_orders (pending, mock pay)
     * 23505 (UNIQUE 위반) 시 idempotency 처리
   - INSERT local_food_order_items (가격 스냅샷)
   - 실패 시 포인트 환원 + 주문 삭제
   ↓
4. 결제 (mock 또는 PortOne)
   - PG 콜백 또는 mock 즉시 → status='paid', paid_at
   ↓
5. 생산자: 발송 → tracking 입력 → status='shipped', shipped_at
   ↓
6. 구매자: 배송 완료 (택배 API 자동 또는 수동) → status='delivered'
   ↓
7. 구매자: 구매 확정 → status='confirmed', confirmed_at
   - POST /api/local-food-orders/[id]/confirm
   - 적립: paidCash = amount - points_used → points earn (생산자에게도?)
   ↓
8. 정산 → status='settled', settled_at
   - cron billing-monthly-payout 또는 수동
```

## 컬럼 동결 트리거 (Phase 1)

`supabase/migrations/20260621000002_local_food_orders_column_guard.sql`.

`BEFORE UPDATE` 트리거가 결제 핵심 컬럼은 service_role 외 변경 차단:

- `buyer_id`, `seller_id`, `plaza_id` (불변)
- `amount`, `fee_amount` (불변)
- `pg_provider`, `pg_payment_id` (set 후 불변), `pg_merchant_uid`, `pg_raw`
- `paid_at`, `refunded_at`, `settled_at`, `created_at`

사용자 (RLS) 가 변경 가능: status, buyer_memo, seller_memo, tracking_*, delivery_addr, shipped_at, delivered_at, confirmed_at, refund_requested_at, cancelled_at.

→ raw Supabase client 로 amount 위변조 시도 차단.

## 환불 흐름

### 1. 환불 신청 (구매자)
- POST `/api/local-food-orders/[id]/refund`
- body: { reason }
- 조건: status IN (paid, shipped, delivered)
- status='refund_requested', refund_requested_at, buyer_memo 에 사유

### 2. 환불 승인 (생산자 또는 운영자)
- 별도 라우트 (운영 정책)
- status='refunded', refunded_at
- PortOne cancel API 호출 (실 결제 시)
- 포인트 환원 (`points_refund_spend` RPC)

### 3. 자동 환불 (구매자 취소 — pending 만)
- POST `/api/local-food-orders/[id]/cancel`
- status='cancelled', cancelled_at
- 포인트 환원 (Phase 1 보강)

## 포인트 사용

### 정책
- `point_redemption_settings.local_food.max_redemption_pct` (예: 30%)
- 사용자가 `points_used` 요청 → `min(requested, amount, maxByPct)` 적용

### RPC 호출
- `points_spend_atomic(user_id, plaza_id, 'local_food', amount, payment_total, source_id)`
- 성공 시 `tx_id` 받음 → `local_food_orders.points_tx_id` 저장

### 환원 (취소 / 환불)
- `points_refund_spend(tx_id, reason)` RPC
- 멱등 (이미 reverted 면 no-op)

## 적립 (구매 확정 시)

`POST /api/local-food-orders/[id]/confirm` 에서:
- 적립 기준 = `amount - points_used` (포인트로만 결제한 부분 적립 제외)
- earn tx INSERT (24h pending → confirmed)

생산자에게도 적립? (정책에 따라 다름)

## idempotency

### 클라이언트 발급
프론트가 결제 시도 시 UUID 발급 → body 에 `idempotency_key` 포함.

### 서버 처리 (`app/api/local-food-orders/route.ts`)
1. 들어온 키로 기존 주문 조회 → 있으면 그 주문 반환 (`idempotent: true`)
2. INSERT 시도 → `oErr.code === '23505'` (UNIQUE 위반) 시:
   - 기존 row 다시 조회
   - 차감했던 포인트 환원 (rollback)
   - 기존 주문 반환

### DB 보장
`local_food_orders_idem_uniq` partial UNIQUE index `(buyer_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.

## 주의점

### 1. 동일 생산자 검증
한 주문에 여러 상품 가능하지만 모두 같은 `user_id` (생산자)여야:
```ts
const sellerIds = new Set(foods.map(f => f.user_id))
if (sellerIds.size > 1) return error("동일 생산자만")
```

다른 생산자 상품은 별도 주문 (장바구니 분리).

### 2. 생산자 본인 구매 차단
```ts
if (sellerId === user.id) return error("본인 상품")
```

### 3. status='hidden' / 'sold_out' 상품 차단
- 상품 등록자가 숨김 / 품절 처리한 상품은 신규 주문 불가
- 이미 주문된 건 영향 없음

### 4. 광장 일치
구매자 광장 = 상품 광장. cross-plaza 주문 차단:
```ts
if (foods.some(f => f.plaza_id !== plaza)) return error("다른 광장 상품")
```

### 5. 가격 스냅샷
order_items 에 가격 / 단위 스냅샷 저장. 글 수정 / 삭제돼도 주문 영향 X.

## 운영 — 생산자 KYC

### `producer_settlements` 등록 강제 시점
- 정책: 첫 주문 받기 전 / 첫 정산 시
- 어드민이 `is_verified = true` 수동 토글 (`/admin/producers` 또는 비슷한 UI)

### 미등록 시 한도
- 마이그 코멘트: "사업자 미등록 시 연 매출 1만원 제한"
- 정책 강제 위치: 주문 INSERT 전 또는 cron 으로 누적 매출 체크

## 확장 시

### 카트 / 다중 생산자
- 현재 1주문 1생산자
- 카트 → 생산자별 분할 주문 (별도 PR)

### 정기 배송 (subscription)
- 우유 / 야채 박스 정기
- `subscriptions` 테이블 (이미 billing 에 있음) 확장

### 옵션 (사이즈 / 종류)
- `local_food_options` 새 테이블

### 산지 직송 vs 광장 픽업
- 현재 택배 단일
- 픽업 옵션 추가 시 `delivery_mode` 컬럼

## 다음 읽을 문서

- 결제 / mock-pay → `05-features/payments.md`
- 포인트 환원 → `05-features/points.md`
- 정산 cron → `06-operations/cron-jobs.md`
