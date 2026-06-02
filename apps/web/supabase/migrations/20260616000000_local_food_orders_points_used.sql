-- ============================================================================
-- local_food_orders.points_used — 주문에 사용된 포인트
--
-- 회계:
--   amount             = 상품 합계 (스냅샷, 변하지 않음)
--   points_used        = 사용한 포인트 (1포인트 = 1원)
--   pg_charged         = amount - points_used  (PG 청구 금액 — 가상 컬럼)
--   fee_amount         = 플랫폼 수수료 (생산자 부담)
--   settlement_amount  = amount - fee_amount   (생산자에게 정산할 금액)
--
-- 포인트 할인은 플랫폼이 부담 (사용자 마케팅 비용) — 생산자는 정상가 정산.
-- ============================================================================

BEGIN;

ALTER TABLE public.local_food_orders
  ADD COLUMN IF NOT EXISTS points_used INTEGER NOT NULL DEFAULT 0
    CHECK (points_used >= 0);

ALTER TABLE public.local_food_orders
  ADD COLUMN IF NOT EXISTS points_tx_id UUID;
  -- 포인트 차감 트랜잭션 ID (point_transactions.id) — 환불 시 회수용

COMMENT ON COLUMN public.local_food_orders.points_used IS
  '주문에 사용한 포인트 (1pt = 1원, 결제액 차감)';
COMMENT ON COLUMN public.local_food_orders.points_tx_id IS
  'points_spend_atomic 의 transaction id — 환불·취소 시 회수에 사용';

NOTIFY pgrst, 'reload schema';

COMMIT;
