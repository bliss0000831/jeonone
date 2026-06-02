-- ============================================================================
-- 배송비 컬럼 — 공동구매·로컬푸드 통일.
--
-- group_buying_posts: delivery_fee, delivery_fee_mode 이미 존재. 'free' 모드 허용.
-- local_food: shipping_fee, free_shipping 신규 추가.
-- ============================================================================

BEGIN;

-- local_food: 신규
ALTER TABLE IF EXISTS public.local_food
  ADD COLUMN IF NOT EXISTS shipping_fee INTEGER NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0),
  ADD COLUMN IF NOT EXISTS free_shipping BOOLEAN NOT NULL DEFAULT FALSE;

-- group_buying_posts: 'free' 모드 추가 (기존 CHECK 가 있다면 갱신)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'group_buying_posts'
      AND constraint_name = 'group_buying_posts_delivery_fee_mode_check'
  ) THEN
    ALTER TABLE public.group_buying_posts
      DROP CONSTRAINT group_buying_posts_delivery_fee_mode_check;
  END IF;
END$$;

ALTER TABLE IF EXISTS public.group_buying_posts
  ADD CONSTRAINT group_buying_posts_delivery_fee_mode_check
  CHECK (delivery_fee_mode IN ('included', 'separate', 'free'));

NOTIFY pgrst, 'reload schema';

COMMIT;
