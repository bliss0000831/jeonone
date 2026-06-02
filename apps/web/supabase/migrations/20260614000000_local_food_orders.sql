-- ============================================================================
-- 로컬푸드 결제·주문 시스템
--
-- 직거래 → 온라인 결제(에스크로) + 택배 단일화 모델로 전환.
-- PortOne(아임포트) 연동 자리만 만들어두고 현재는 mock-pay 로 흐름 검증.
--
-- 상태 머신:
--   pending  ─결제─▶ paid ─운송장입력─▶ shipped ─구매확정─▶ confirmed ─정산─▶ settled
--                          │                  │
--                          └─환불요청─▶ refund_requested ─▶ refunded
--   pending ─취소─▶ cancelled (결제 전만)
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) 주문 (1주문 = 1구매자 + 1생산자)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.local_food_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  plaza_id TEXT NOT NULL,
  -- 상태 머신
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'paid', 'shipped', 'delivered',
      'confirmed', 'refund_requested', 'refunded',
      'cancelled', 'settled'
    )),
  -- 금액 (모두 원 단위)
  amount INTEGER NOT NULL CHECK (amount >= 0),
  fee_amount INTEGER NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),     -- 플랫폼 수수료 (생산자 부담분)
  settlement_amount INTEGER GENERATED ALWAYS AS (amount - fee_amount) STORED,
  -- 배송 (택배 단일)
  delivery_addr JSONB NOT NULL,                                       -- { recipient_name, phone, postcode, addr1, addr2 }
  buyer_memo TEXT,
  seller_memo TEXT,
  tracking_company TEXT,
  tracking_number TEXT,
  -- 결제 (PG)
  pg_provider TEXT NOT NULL DEFAULT 'mock',                           -- 'portone' | 'mock' (개발 단계)
  pg_payment_id TEXT,                                                 -- 결제 PG 의 결제 식별자 (paymentId, imp_uid 등)
  pg_merchant_uid TEXT NOT NULL UNIQUE,                               -- 가맹점 주문번호 (서비스 측 발급)
  pg_raw JSONB,                                                       -- 원본 응답/웹훅 페이로드 (디버깅·감사용)
  -- 타임스탬프
  paid_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  refund_requested_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_local_food_orders_buyer ON public.local_food_orders(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_food_orders_seller ON public.local_food_orders(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_food_orders_plaza_status ON public.local_food_orders(plaza_id, status);
CREATE INDEX IF NOT EXISTS idx_local_food_orders_pg_payment ON public.local_food_orders(pg_payment_id) WHERE pg_payment_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) 주문 아이템 (1주문에 N개 — 카트 도입 대비)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.local_food_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.local_food_orders(id) ON DELETE CASCADE,
  local_food_id UUID NOT NULL REFERENCES public.local_food(id) ON DELETE RESTRICT,
  -- 주문 시점 스냅샷 (글이 수정/삭제돼도 주문 영향 X)
  title TEXT NOT NULL,
  unit TEXT,
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  subtotal INTEGER GENERATED ALWAYS AS (unit_price * quantity) STORED,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_local_food_order_items_order ON public.local_food_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_local_food_order_items_food ON public.local_food_order_items(local_food_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 3) 생산자 정산 계좌 (KYC) — 출금 받을 계좌
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.producer_settlements (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_code TEXT,                                                     -- '004' (KB), '088' (신한) 등
  bank_name TEXT,
  bank_account TEXT,                                                  -- 마지막 4자리 외 마스킹 권장 (조회 시)
  account_holder TEXT,
  business_number TEXT,                                               -- 사업자등록번호 (선택 — 미등록 시 연 매출 1만원 제한 등 정책 적용)
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 4) PG 웹훅 멱등성 (PortOne 연동 후 사용)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pg_provider TEXT NOT NULL,
  pg_payment_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  raw_body JSONB,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pg_provider, pg_payment_id, event_type)
);

-- ────────────────────────────────────────────────────────────────────────────
-- 5) updated_at 자동 갱신 트리거
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS local_food_orders_updated ON public.local_food_orders;
CREATE TRIGGER local_food_orders_updated
  BEFORE UPDATE ON public.local_food_orders
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS producer_settlements_updated ON public.producer_settlements;
CREATE TRIGGER producer_settlements_updated
  BEFORE UPDATE ON public.producer_settlements
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 6) RLS — 본인 주문(구매자/판매자)만 조회/수정 가능
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.local_food_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_food_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producer_settlements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhooks       ENABLE ROW LEVEL SECURITY;

-- 주문: 본인이 구매자 또는 판매자인 경우만 SELECT
DROP POLICY IF EXISTS local_food_orders_select_party ON public.local_food_orders;
CREATE POLICY local_food_orders_select_party ON public.local_food_orders
  FOR SELECT USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- 주문 INSERT: 본인이 구매자로 들어가는 경우만
DROP POLICY IF EXISTS local_food_orders_insert_buyer ON public.local_food_orders;
CREATE POLICY local_food_orders_insert_buyer ON public.local_food_orders
  FOR INSERT WITH CHECK (auth.uid() = buyer_id);

-- 주문 UPDATE: 구매자는 자기 주문 일부 필드만, 판매자도 일부 — 라우트에서 세분화
-- (RLS 는 "본인 주문" 까지만 검증, 필드별 권한은 API 에서 검증)
DROP POLICY IF EXISTS local_food_orders_update_party ON public.local_food_orders;
CREATE POLICY local_food_orders_update_party ON public.local_food_orders
  FOR UPDATE USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- 주문 아이템: 부모 주문 권한과 동일 — 부모 SELECT 가능하면 아이템 SELECT 가능
DROP POLICY IF EXISTS local_food_order_items_select ON public.local_food_order_items;
CREATE POLICY local_food_order_items_select ON public.local_food_order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.local_food_orders o
      WHERE o.id = local_food_order_items.order_id
        AND (auth.uid() = o.buyer_id OR auth.uid() = o.seller_id)
    )
  );

DROP POLICY IF EXISTS local_food_order_items_insert ON public.local_food_order_items;
CREATE POLICY local_food_order_items_insert ON public.local_food_order_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.local_food_orders o
      WHERE o.id = local_food_order_items.order_id
        AND auth.uid() = o.buyer_id
    )
  );

-- 정산 계좌: 본인 것만 SELECT/INSERT/UPDATE
DROP POLICY IF EXISTS producer_settlements_self ON public.producer_settlements;
CREATE POLICY producer_settlements_self ON public.producer_settlements
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 웹훅: 일반 사용자 접근 차단 — service role 만 (RLS 정책 없으면 기본 deny)

NOTIFY pgrst, 'reload schema';

COMMIT;
