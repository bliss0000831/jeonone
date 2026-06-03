-- ============================================================================
-- 전원일기 Phase 4 — secondhand_posts 농기구 전용 필드 추가 (additive, nullable)
--   brand        제조사 (대동/국제/LS/얀마/구보다 등)
--   model_name   모델명
--   model_year   연식 (정수)
--   usage_hours  사용시간(h)
--   horsepower   마력(hp)
--   listing_type 거래방식 (sale | rental | auction) — 대여/경매 확장 대비
-- ============================================================================

ALTER TABLE public.secondhand_posts ADD COLUMN IF NOT EXISTS brand        TEXT;
ALTER TABLE public.secondhand_posts ADD COLUMN IF NOT EXISTS model_name   TEXT;
ALTER TABLE public.secondhand_posts ADD COLUMN IF NOT EXISTS model_year   INTEGER;
ALTER TABLE public.secondhand_posts ADD COLUMN IF NOT EXISTS usage_hours  INTEGER;
ALTER TABLE public.secondhand_posts ADD COLUMN IF NOT EXISTS horsepower   INTEGER;
ALTER TABLE public.secondhand_posts ADD COLUMN IF NOT EXISTS listing_type TEXT NOT NULL DEFAULT 'sale';

CREATE INDEX IF NOT EXISTS idx_secondhand_posts_listing_type ON public.secondhand_posts(listing_type);
CREATE INDEX IF NOT EXISTS idx_secondhand_posts_brand        ON public.secondhand_posts(brand);
