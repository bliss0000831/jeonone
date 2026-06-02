-- ============================================================================
-- group_buying_orders / local_food_orders 에 buyer_plaza_id 컬럼 추가
-- (cross-plaza 거래 통계 + 향후 정산 추적)
-- plaza_id = 판매자 광장 (정산·수수료 광장), buyer_plaza_id = 구매자 광장
-- ============================================================================

BEGIN;

ALTER TABLE public.group_buying_orders
  ADD COLUMN IF NOT EXISTS buyer_plaza_id TEXT REFERENCES public.plazas(id);

ALTER TABLE public.local_food_orders
  ADD COLUMN IF NOT EXISTS buyer_plaza_id TEXT REFERENCES public.plazas(id);

CREATE INDEX IF NOT EXISTS idx_gb_orders_buyer_plaza  ON public.group_buying_orders(buyer_plaza_id);
CREATE INDEX IF NOT EXISTS idx_lf_orders_buyer_plaza  ON public.local_food_orders(buyer_plaza_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
