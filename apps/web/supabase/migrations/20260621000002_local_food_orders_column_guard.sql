-- ============================================================================
-- local_food_orders 결제 핵심 컬럼 동결 (column-level UPDATE 가드)
--
-- 배경: RLS UPDATE 정책이 buyer/seller 면 통과시킴. 라우트에서 필드를
--       제한하지만, raw Supabase client 로 직접 amount/pg_payment_id 등을
--       UPDATE 하면 결제 사기 가능.
--
-- 해결: BEFORE UPDATE 트리거로 결제·정산 핵심 컬럼은 service_role 외
--       변경 금지. (service_role 은 라우트가 admin client 로 처리)
--
-- 동결 대상:
--   buyer_id, seller_id, plaza_id, amount, fee_amount,
--   pg_provider, pg_payment_id, pg_merchant_uid, pg_raw,
--   paid_at, refunded_at, settled_at, created_at
--   (settlement_amount 는 GENERATED 컬럼이라 자동 보호)
--
-- 사용자가 변경 가능 (라우트 위에서 추가 검증):
--   status, buyer_memo, seller_memo, tracking_company, tracking_number,
--   delivery_addr, shipped_at, delivered_at, confirmed_at,
--   refund_requested_at, cancelled_at, updated_at
--
-- Rollback:
--   DROP TRIGGER IF EXISTS local_food_orders_freeze_critical ON public.local_food_orders;
--   DROP FUNCTION IF EXISTS trg_local_food_orders_freeze_critical();
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION trg_local_food_orders_freeze_critical()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- service_role 은 무제한 (라우트의 admin client)
  v_role := COALESCE(
    current_setting('request.jwt.claims', true)::jsonb->>'role',
    ''
  );
  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- 결제·정산 핵심 컬럼은 OLD 와 동일해야 함
  IF NEW.buyer_id IS DISTINCT FROM OLD.buyer_id THEN
    RAISE EXCEPTION 'buyer_id is immutable';
  END IF;
  IF NEW.seller_id IS DISTINCT FROM OLD.seller_id THEN
    RAISE EXCEPTION 'seller_id is immutable';
  END IF;
  IF NEW.plaza_id IS DISTINCT FROM OLD.plaza_id THEN
    RAISE EXCEPTION 'plaza_id is immutable';
  END IF;
  IF NEW.amount IS DISTINCT FROM OLD.amount THEN
    RAISE EXCEPTION 'amount is immutable';
  END IF;
  IF NEW.fee_amount IS DISTINCT FROM OLD.fee_amount THEN
    RAISE EXCEPTION 'fee_amount is immutable';
  END IF;
  IF NEW.pg_provider IS DISTINCT FROM OLD.pg_provider THEN
    RAISE EXCEPTION 'pg_provider is immutable';
  END IF;
  IF NEW.pg_payment_id IS DISTINCT FROM OLD.pg_payment_id
     AND OLD.pg_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'pg_payment_id is immutable once set';
  END IF;
  IF NEW.pg_merchant_uid IS DISTINCT FROM OLD.pg_merchant_uid THEN
    RAISE EXCEPTION 'pg_merchant_uid is immutable';
  END IF;
  IF NEW.pg_raw IS DISTINCT FROM OLD.pg_raw THEN
    RAISE EXCEPTION 'pg_raw is immutable for non-service-role';
  END IF;
  IF NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
    RAISE EXCEPTION 'paid_at is immutable';
  END IF;
  IF NEW.refunded_at IS DISTINCT FROM OLD.refunded_at THEN
    RAISE EXCEPTION 'refunded_at is immutable';
  END IF;
  IF NEW.settled_at IS DISTINCT FROM OLD.settled_at THEN
    RAISE EXCEPTION 'settled_at is immutable';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'created_at is immutable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS local_food_orders_freeze_critical ON public.local_food_orders;
CREATE TRIGGER local_food_orders_freeze_critical
  BEFORE UPDATE ON public.local_food_orders
  FOR EACH ROW EXECUTE FUNCTION trg_local_food_orders_freeze_critical();

COMMIT;
