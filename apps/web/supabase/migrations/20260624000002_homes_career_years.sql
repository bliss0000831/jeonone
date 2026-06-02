-- 홈즈 서비스 4종 (인테리어/이사/청소/수리) 에 경력(career_years) 컬럼 추가.
-- 카드/리스트에 "경력 N년" 으로 노출 → 신뢰 시그널.

ALTER TABLE public.interior_posts
  ADD COLUMN IF NOT EXISTS career_years INTEGER;

ALTER TABLE public.moving_posts
  ADD COLUMN IF NOT EXISTS career_years INTEGER;

ALTER TABLE public.cleaning_posts
  ADD COLUMN IF NOT EXISTS career_years INTEGER;

ALTER TABLE public.repair_posts
  ADD COLUMN IF NOT EXISTS career_years INTEGER;

COMMENT ON COLUMN public.interior_posts.career_years IS '시공 경력(년). NULL 허용.';
COMMENT ON COLUMN public.moving_posts.career_years IS '이사 경력(년). NULL 허용.';
COMMENT ON COLUMN public.cleaning_posts.career_years IS '청소 경력(년). NULL 허용.';
COMMENT ON COLUMN public.repair_posts.career_years IS '수리 경력(년). NULL 허용.';
