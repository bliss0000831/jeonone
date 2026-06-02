-- ============================================================================
-- Phase 2 — 통합 주문 상태 머신
--
-- 공동구매·로컬푸드 주문 상태를 통일하고, 7일 자동 completed 처리를 위한
-- received_at 컬럼과 status enum 확장을 적용한다.
--
-- 통일 enum: pending_payment | paid | shipped | completed | cancelled | refunded
-- (기존 도메인 별 'confirmed'·'delivered'·'settled' 등은 backward-compat 으로 남김)
--
-- received_at: 구매자가 "수령 완료" 클릭한 시각.
--   completed_at 으로 승격하는 7일 카운트다운의 기준점.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) local_food_orders — completed 상태 + received_at 추가
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.local_food_orders
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE public.local_food_orders
  DROP CONSTRAINT IF EXISTS local_food_orders_status_check;

ALTER TABLE public.local_food_orders
  ADD CONSTRAINT local_food_orders_status_check
  CHECK (status IN (
    'pending', 'pending_payment',
    'paid', 'shipped', 'delivered',
    'confirmed', 'completed',
    'refund_requested', 'refunded',
    'cancelled', 'settled'
  ));

-- ────────────────────────────────────────────────────────────────────────────
-- 2) group_buying_orders — completed 상태 추가
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.group_buying_orders
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE public.group_buying_orders
  DROP CONSTRAINT IF EXISTS group_buying_orders_status_check;

ALTER TABLE public.group_buying_orders
  ADD CONSTRAINT group_buying_orders_status_check
  CHECK (status IN (
    'pending', 'pending_payment',
    'paid', 'group_confirmed', 'shipped',
    'confirmed', 'completed',
    'refunded', 'cancelled', 'settled'
  ));

-- ────────────────────────────────────────────────────────────────────────────
-- 3) group_buying_participants — payment_status 확장 + 타임스탬프
--    profile/api.confirmOrderReceived 가 이 테이블에 'completed' 쓰는 중.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.group_buying_participants
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tracking_company TEXT,
  ADD COLUMN IF NOT EXISTS tracking_number TEXT;

ALTER TABLE public.group_buying_participants
  DROP CONSTRAINT IF EXISTS group_buying_participants_payment_status_check;

ALTER TABLE public.group_buying_participants
  ADD CONSTRAINT group_buying_participants_payment_status_check
  CHECK (payment_status IN (
    'reserved', 'pending_payment',
    'paid', 'confirmed', 'shipped', 'received',
    'completed', 'refunded', 'cancelled'
  ));

-- ────────────────────────────────────────────────────────────────────────────
-- 4) 인덱스 — 7일 cron 이 shipped + received_at 으로 후보 추출
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lf_orders_status_received
  ON public.local_food_orders(status, received_at)
  WHERE status = 'shipped' AND received_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gb_orders_status_received
  ON public.group_buying_orders(status, received_at)
  WHERE status = 'shipped' AND received_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gb_participants_status_received
  ON public.group_buying_participants(payment_status, received_at)
  WHERE payment_status = 'shipped' AND received_at IS NOT NULL;

-- 발송 후 N일 자동 수령 처리도 후일 가능하도록 shipped_at 인덱스
CREATE INDEX IF NOT EXISTS idx_lf_orders_shipped_at
  ON public.local_food_orders(shipped_at)
  WHERE status = 'shipped';

CREATE INDEX IF NOT EXISTS idx_gb_orders_shipped_at
  ON public.group_buying_orders(shipped_at)
  WHERE status = 'shipped';

CREATE INDEX IF NOT EXISTS idx_gb_participants_shipped_at
  ON public.group_buying_participants(shipped_at)
  WHERE payment_status = 'shipped';

-- ────────────────────────────────────────────────────────────────────────────
-- 5) 자동 completed 처리 함수 — Vercel cron 또는 pg_cron 에서 호출
--    규칙: status='shipped' 이고 received_at + 7일 < NOW() → completed
--          또는 received_at 이 NULL 이라도 shipped_at + 14일 < NOW() → completed
--          (구매자가 수령 후 미클릭한 경우 자동 확정 — 정산 진행)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_complete_orders()
RETURNS TABLE(domain TEXT, order_id UUID, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  r RECORD;
BEGIN
  -- local_food_orders
  FOR r IN
    UPDATE public.local_food_orders
    SET status = 'completed',
        completed_at = v_now
    WHERE status = 'shipped'
      AND (
        (received_at IS NOT NULL AND received_at + INTERVAL '7 days' < v_now)
        OR
        (received_at IS NULL AND shipped_at IS NOT NULL AND shipped_at + INTERVAL '14 days' < v_now)
      )
    RETURNING id, CASE WHEN received_at IS NOT NULL THEN '수령 후 7일' ELSE '발송 후 14일' END AS reason
  LOOP
    domain := 'local_food';
    order_id := r.id;
    reason := r.reason;
    RETURN NEXT;
  END LOOP;

  -- group_buying_orders (orders 테이블 사용 경로)
  FOR r IN
    UPDATE public.group_buying_orders
    SET status = 'completed',
        completed_at = v_now
    WHERE status = 'shipped'
      AND (
        (received_at IS NOT NULL AND received_at + INTERVAL '7 days' < v_now)
        OR
        (received_at IS NULL AND shipped_at IS NOT NULL AND shipped_at + INTERVAL '14 days' < v_now)
      )
    RETURNING id, CASE WHEN received_at IS NOT NULL THEN '수령 후 7일' ELSE '발송 후 14일' END AS reason
  LOOP
    domain := 'group_buying';
    order_id := r.id;
    reason := r.reason;
    RETURN NEXT;
  END LOOP;

  -- group_buying_participants (참가자 테이블 경로 — profile API 가 이걸 갱신함)
  FOR r IN
    UPDATE public.group_buying_participants
    SET payment_status = 'completed',
        completed_at = v_now
    WHERE payment_status = 'shipped'
      AND (
        (received_at IS NOT NULL AND received_at + INTERVAL '7 days' < v_now)
        OR
        (received_at IS NULL AND shipped_at IS NOT NULL AND shipped_at + INTERVAL '14 days' < v_now)
      )
    RETURNING id, CASE WHEN received_at IS NOT NULL THEN '수령 후 7일' ELSE '발송 후 14일' END AS reason
  LOOP
    domain := 'group_buying_participant';
    order_id := r.id;
    reason := r.reason;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_complete_orders() TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
