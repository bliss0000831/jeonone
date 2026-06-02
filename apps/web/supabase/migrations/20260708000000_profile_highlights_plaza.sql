-- ============================================================================
-- profile_highlights 에 plaza_id 추가 — 광장별 격리
--
-- 사용자가 광장마다 다른 하이라이트(스토리)를 가질 수 있도록.
-- 기존 데이터는 chuncheon 으로 백필.
-- ============================================================================

BEGIN;

ALTER TABLE public.profile_highlights
  ADD COLUMN IF NOT EXISTS plaza_id TEXT REFERENCES public.plazas(id);

-- 기존 행은 chuncheon 으로 백필
UPDATE public.profile_highlights
SET plaza_id = 'chuncheon'
WHERE plaza_id IS NULL;

-- 이후 신규 행은 NOT NULL 강제 (실수로 plaza_id 누락 방지)
ALTER TABLE public.profile_highlights
  ALTER COLUMN plaza_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS profile_highlights_user_plaza_idx
  ON public.profile_highlights(user_id, plaza_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
