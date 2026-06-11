-- ============================================================================
-- 공지사항 시군별 노출 — notices 에 region(시군) + 출처 컬럼 추가
--   region NULL  = 전체(도 전체/전국) 공지 → 모든 시군에 노출
--   region '춘천시' = 해당 시군 사용자에게만 노출 (+ 전체 공지)
--   source/source_id = 추후 지자체 공지 자동수집(중복 방지)용
-- 멱등 (IF NOT EXISTS) — 재실행 안전
-- ============================================================================

ALTER TABLE public.notices ADD COLUMN IF NOT EXISTS region    TEXT;
ALTER TABLE public.notices ADD COLUMN IF NOT EXISTS source    TEXT;
ALTER TABLE public.notices ADD COLUMN IF NOT EXISTS source_id TEXT;

CREATE INDEX IF NOT EXISTS idx_notices_plaza_region
  ON public.notices (plaza_id, region);

-- 자동수집 중복 방지 — (source, source_id) 가 둘 다 있을 때만 유니크
CREATE UNIQUE INDEX IF NOT EXISTS uq_notices_source
  ON public.notices (source, source_id)
  WHERE source_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
