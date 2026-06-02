-- ============================================================================
-- 🅲 광장 완전 격리 — follows / reviews / notifications 광장별 분리
--
-- 1) follows.plaza_id — 광장별 팔로우 관계
-- 2) reviews.plaza_id — 광장별 리뷰 (trust_score, review_count 도 광장별)
-- 3) plaza_profiles.trust_score / review_count — 광장별 신뢰 점수 컬럼
-- 4) notifications.plaza_id — 알림 광장 필터 (있으면 보강)
--
-- 모든 기존 데이터는 chuncheon 으로 백필 (가장 오래된 광장).
-- ============================================================================

BEGIN;

-- ─── 1) follows ─────────────────────────────────────────────────────────────
ALTER TABLE public.follows
  ADD COLUMN IF NOT EXISTS plaza_id TEXT REFERENCES public.plazas(id);

UPDATE public.follows SET plaza_id = 'chuncheon' WHERE plaza_id IS NULL;
ALTER TABLE public.follows ALTER COLUMN plaza_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS follows_plaza_idx ON public.follows(plaza_id, following_id);
CREATE INDEX IF NOT EXISTS follows_plaza_follower_idx ON public.follows(plaza_id, follower_id);

-- ─── 2) reviews ─────────────────────────────────────────────────────────────
-- reviews 테이블의 reviewee 컬럼명이 환경마다 다를 수 있어 동적으로 확인
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reviews') THEN
    EXECUTE 'ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS plaza_id TEXT REFERENCES public.plazas(id)';
    EXECUTE 'UPDATE public.reviews SET plaza_id = ''chuncheon'' WHERE plaza_id IS NULL';
    BEGIN
      EXECUTE 'ALTER TABLE public.reviews ALTER COLUMN plaza_id SET NOT NULL';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    -- 인덱스 — 환경에 따라 컬럼명이 reviewee_id / target_user_id / user_id 중 하나
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reviews' AND column_name='reviewee_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS reviews_plaza_idx ON public.reviews(plaza_id, reviewee_id)';
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reviews' AND column_name='target_user_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS reviews_plaza_idx ON public.reviews(plaza_id, target_user_id)';
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reviews' AND column_name='user_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS reviews_plaza_idx ON public.reviews(plaza_id, user_id)';
    ELSE
      EXECUTE 'CREATE INDEX IF NOT EXISTS reviews_plaza_idx ON public.reviews(plaza_id)';
    END IF;
  END IF;
END $$;

-- ─── 3) plaza_profiles trust_score / review_count ───────────────────────────
ALTER TABLE public.plaza_profiles
  ADD COLUMN IF NOT EXISTS trust_score NUMERIC,
  ADD COLUMN IF NOT EXISTS review_count INT NOT NULL DEFAULT 0;

-- 백필: 기존 chuncheon plaza_profiles 에 profiles 의 값 복사
UPDATE public.plaza_profiles pp
SET
  trust_score  = COALESCE(pp.trust_score, p.trust_score),
  review_count = COALESCE(NULLIF(pp.review_count, 0), p.review_count, 0)
FROM public.profiles p
WHERE pp.user_id = p.id
  AND pp.plaza_id = 'chuncheon';

-- ─── 4) notifications ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
    -- plaza_id 컬럼이 이미 있을 수 있음 — 없으면 추가
    EXECUTE 'ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS plaza_id TEXT REFERENCES public.plazas(id)';
    -- 기존 행 백필 (있을 때)
    EXECUTE 'UPDATE public.notifications SET plaza_id = ''chuncheon'' WHERE plaza_id IS NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS notifications_plaza_user_idx ON public.notifications(plaza_id, user_id)';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
