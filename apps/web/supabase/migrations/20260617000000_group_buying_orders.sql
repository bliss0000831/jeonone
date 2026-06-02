-- ============================================================================
-- 공동구매 결제·주문 시스템
--
-- 모델: 위메프 + 올웨이즈 하이브리드
--   1. 참여자가 선결제 (PortOne 에스크로) — 현재는 mock
--   2. 모집 마감 시 min_participants 미달이면 자동 환불 (cancelled)
--   3. 충족 시 confirmed → 주최자가 발송 → 구매확정 → 정산
--
-- 호환성: payment_required=false 인 기존 글은 직거래 모드 유지.
--         새 글은 default false 로 켜고, 등록 폼에서 토글로 활성화.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) group_buying_posts — 결제 모드 플래그 + 자동 처리 메타
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.group_buying_posts
  ADD COLUMN IF NOT EXISTS payment_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_processed_at TIMESTAMPTZ;
  -- auto_processed_at: cron 이 마감 후 처리한 시각 (중복 처리 방지)

-- ────────────────────────────────────────────────────────────────────────────
-- 2) group_buying_orders — 참여 주문
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.group_buying_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.group_buying_posts(id) ON DELETE RESTRICT,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  plaza_id TEXT NOT NULL,
  -- 상태 머신 (local_food_orders 와 비슷하지만 'paid' 가 모집 단계에 있음)
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',         -- 결제 대기
      'paid',            -- 결제 완료, 모집 진행 중
      'group_confirmed', -- 모집 성공 (모두 발송 대기)
      'shipped',         -- 발송됨
      'confirmed',       -- 구매확정
      'refunded',        -- 환불 (모집 실패 또는 취소)
      'cancelled',       -- 취소
      'settled'          -- 정산 완료
    )),
  -- 금액 (원 단위)
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  amount INTEGER NOT NULL CHECK (amount >= 0),                  -- = unit_price * quantity
  fee_amount INTEGER NOT NULL DEFAULT 0,                        -- 플랫폼 수수료
  settlement_amount INTEGER GENERATED ALWAYS AS (amount - fee_amount) STORED,
  points_used INTEGER NOT NULL DEFAULT 0 CHECK (points_used >= 0),
  points_tx_id UUID,
  -- 수령
  receive_method TEXT NOT NULL CHECK (receive_method IN ('pickup', 'delivery')),
  delivery_addr JSONB,                                          -- delivery 시 필수
  buyer_memo TEXT,
  tracking_company TEXT,
  tracking_number TEXT,
  -- 결제 PG
  pg_provider TEXT NOT NULL DEFAULT 'mock',
  pg_payment_id TEXT,
  pg_merchant_uid TEXT NOT NULL UNIQUE,
  pg_raw JSONB,
  -- 타임스탬프
  paid_at TIMESTAMPTZ,
  group_confirmed_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  refund_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gb_orders_post_status ON public.group_buying_orders(post_id, status);
CREATE INDEX IF NOT EXISTS idx_gb_orders_buyer ON public.group_buying_orders(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gb_orders_seller ON public.group_buying_orders(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gb_orders_plaza_status ON public.group_buying_orders(plaza_id, status);

-- updated_at 트리거
DROP TRIGGER IF EXISTS group_buying_orders_updated ON public.group_buying_orders;
CREATE TRIGGER group_buying_orders_updated
  BEFORE UPDATE ON public.group_buying_orders
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
  -- (trg_set_updated_at 은 local_food_orders 마이그레이션에서 이미 정의됨)

-- ────────────────────────────────────────────────────────────────────────────
-- 3) RLS — 본인 주문만 (구매자/판매자)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.group_buying_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gb_orders_select_party ON public.group_buying_orders;
CREATE POLICY gb_orders_select_party ON public.group_buying_orders
  FOR SELECT USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

DROP POLICY IF EXISTS gb_orders_insert_buyer ON public.group_buying_orders;
CREATE POLICY gb_orders_insert_buyer ON public.group_buying_orders
  FOR INSERT WITH CHECK (auth.uid() = buyer_id);

DROP POLICY IF EXISTS gb_orders_update_party ON public.group_buying_orders;
CREATE POLICY gb_orders_update_party ON public.group_buying_orders
  FOR UPDATE USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 4) 자동 처리 함수 — cron 또는 수동 호출
--    마감일 지난 글 처리:
--      - paid 주문 수가 min_participants 이상 → status='confirmed', 주문들 status='group_confirmed'
--      - 미달 → status='cancelled', 주문들 status='refunded' (실 환불은 PortOne 도입 후)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION group_buying_auto_process()
RETURNS TABLE(processed_post_id UUID, action TEXT, paid_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_paid_count INT;
BEGIN
  -- 마감일 지났고 아직 처리 안 된 모집중 글
  FOR r IN
    SELECT id, min_participants, deadline
    FROM group_buying_posts
    WHERE status = 'recruiting'
      AND deadline IS NOT NULL
      AND deadline < NOW()
      AND auto_processed_at IS NULL
      AND payment_required = TRUE
  LOOP
    SELECT COUNT(*) INTO v_paid_count
    FROM group_buying_orders
    WHERE post_id = r.id AND status = 'paid';

    IF v_paid_count >= COALESCE(r.min_participants, 1) THEN
      -- 성사
      UPDATE group_buying_posts
        SET status = 'confirmed',
            auto_processed_at = NOW()
        WHERE id = r.id;
      UPDATE group_buying_orders
        SET status = 'group_confirmed',
            group_confirmed_at = NOW()
        WHERE post_id = r.id AND status = 'paid';
      RETURN QUERY SELECT r.id, 'confirmed'::TEXT, v_paid_count;
    ELSE
      -- 미달 → 환불
      UPDATE group_buying_posts
        SET status = 'cancelled',
            auto_processed_at = NOW()
        WHERE id = r.id;
      UPDATE group_buying_orders
        SET status = 'refunded',
            refunded_at = NOW(),
            refund_reason = '모집 인원 미달로 자동 환불'
        WHERE post_id = r.id AND status = 'paid';
      RETURN QUERY SELECT r.id, 'cancelled'::TEXT, v_paid_count;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION group_buying_auto_process() TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5) 주최자 신뢰 점수 뷰 — past 공구 성공률
--    (주최자 user_id 별로 confirmed/(confirmed+cancelled) 비율)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW group_buying_host_stats AS
SELECT
  user_id,
  COUNT(*) FILTER (WHERE status IN ('confirmed', 'completed')) AS success_count,
  COUNT(*) FILTER (WHERE status = 'cancelled') AS cancel_count,
  COUNT(*) AS total_count,
  CASE
    WHEN COUNT(*) FILTER (WHERE status IN ('confirmed', 'completed', 'cancelled')) = 0 THEN NULL
    ELSE ROUND(
      100.0 * COUNT(*) FILTER (WHERE status IN ('confirmed', 'completed'))
      / NULLIF(COUNT(*) FILTER (WHERE status IN ('confirmed', 'completed', 'cancelled')), 0),
      0
    )
  END AS success_pct
FROM group_buying_posts
GROUP BY user_id;

GRANT SELECT ON group_buying_host_stats TO authenticated, anon;

NOTIFY pgrst, 'reload schema';

COMMIT;
