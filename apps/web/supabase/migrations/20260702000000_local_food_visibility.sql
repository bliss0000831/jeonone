-- ============================================================================
-- local_food — visibility 컬럼 (공동구매와 동일 패턴)
--    'plaza'    : 본인 광장만 (기본)
--    'national' : 전체 광장 공개 (춘천/강릉 등 모든 광장에서 노출)
-- ============================================================================

BEGIN;

ALTER TABLE public.local_food
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'plaza'
    CHECK (visibility IN ('plaza', 'national'));

CREATE INDEX IF NOT EXISTS idx_local_food_visibility
  ON public.local_food(visibility, status, created_at DESC);

NOTIFY pgrst, 'reload schema';

COMMIT;
