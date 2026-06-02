-- ============================================================================
-- 주문 idempotency_key — 결제 중복 방지 스키마
--
-- 배경: 클라이언트가 결제 시도를 재시도(타임아웃, 재방문 등)하면 같은 주문이
--       두 번 만들어질 수 있음. PortOne 도입 후 본격 사용 예정이지만 스키마는
--       지금 미리 만들어두고 INSERT RPC 에서 활용.
--
-- 사용 패턴:
--   - 클라이언트가 결제 시작 시 UUID 발급 (또는 cart_id 해시)
--   - 같은 idempotency_key 로 재시도되면 기존 주문 row 반환
--   - UNIQUE 인덱스로 DB 레벨 중복 차단 (race-free)
--
-- Rollback:
--   ALTER TABLE public.local_food_orders   DROP COLUMN IF EXISTS idempotency_key;
--   ALTER TABLE public.group_buying_orders DROP COLUMN IF EXISTS idempotency_key;
-- ============================================================================

BEGIN;

ALTER TABLE public.local_food_orders
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE public.group_buying_orders
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- (buyer_id, idempotency_key) UNIQUE — 같은 사용자가 같은 키로 재요청 시 차단
-- partial index 로 NULL 은 제외 (legacy 주문 다수가 NULL 인 상태 OK)
CREATE UNIQUE INDEX IF NOT EXISTS local_food_orders_idem_uniq
  ON public.local_food_orders (buyer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS group_buying_orders_idem_uniq
  ON public.group_buying_orders (buyer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.local_food_orders.idempotency_key IS
  '클라이언트 발급 UUID. 같은 buyer + 같은 key → 중복 결제 차단';
COMMENT ON COLUMN public.group_buying_orders.idempotency_key IS
  '클라이언트 발급 UUID. 같은 buyer + 같은 key → 중복 결제 차단';

NOTIFY pgrst, 'reload schema';

COMMIT;
