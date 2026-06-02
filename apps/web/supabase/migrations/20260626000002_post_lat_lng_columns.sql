-- ============================================================================
-- 지도 표시 도메인에 lat / lng 컬럼 추가 — geocode 즉시화 (등록·수정 시 저장).
--
-- properties 는 이미 lat/lng 가짐 (20260428).
-- 추가 대상:
--   clubs, jobs_posts, new_store_posts, secondhand_posts, sharing_posts,
--   interior_posts, cleaning_posts, moving_posts, repair_posts
-- ============================================================================

BEGIN;

ALTER TABLE IF EXISTS public.clubs
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

ALTER TABLE IF EXISTS public.jobs_posts
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

ALTER TABLE IF EXISTS public.new_store_posts
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

ALTER TABLE IF EXISTS public.secondhand_posts
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

ALTER TABLE IF EXISTS public.sharing_posts
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

ALTER TABLE IF EXISTS public.interior_posts
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

ALTER TABLE IF EXISTS public.cleaning_posts
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

ALTER TABLE IF EXISTS public.moving_posts
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

ALTER TABLE IF EXISTS public.repair_posts
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

NOTIFY pgrst, 'reload schema';

COMMIT;
