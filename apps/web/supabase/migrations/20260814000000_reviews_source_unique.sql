-- ════════════════════════════════════════════════════════════════════════════
-- 후기 중복 방지: (reviewer, source_type, source_id) 당 1건
--   기존 UNIQUE 는 property_id 기반이라 경매/대여(property_id NULL)엔 미적용.
--   source 기반 거래(auction/rental/local_food_order 등)에 부분 유니크 인덱스 추가.
-- ════════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS reviews_reviewer_source_uniq
  ON public.reviews (reviewer_id, source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
