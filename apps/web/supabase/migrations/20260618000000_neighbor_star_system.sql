-- ============================================================================
-- 신뢰지수 36.5 시스템 → 이웃 별 (별점 5.0) 시스템 전환
--
-- 변경 사항:
--  1. profiles.trust_score = 평균 별점 (0.0 ~ 5.0). NULL = 후기 없음.
--     ← 기존 36.5 디폴트 값들 일괄 NULL 로 정리 (실제 후기 데이터는 없으므로 안전)
--  2. reviews 테이블 — response_speed/accuracy/kindness 1~5 별점 그대로 활용,
--     total_score 는 평균이 아닌 합계(3~15)로 저장돼있다면 평균(1~5)으로 통일.
--  3. update_neighbor_star(uuid) RPC — 후기 변경 시 평균/카운트 재계산
--  4. AFTER INSERT/UPDATE/DELETE on reviews → 자동 재계산 트리거
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) 기존 36.5 값 정리 — 실제 후기 없는 사용자는 NULL 로
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.profiles
   SET trust_score = NULL, review_count = 0
 WHERE NOT EXISTS (
   SELECT 1 FROM public.reviews r WHERE r.reviewed_user_id = profiles.id
 );

-- ────────────────────────────────────────────────────────────────────────────
-- 2) 평균/카운트 재계산 RPC
--    base_score: response_speed/accuracy/kindness 평균 (3개 항목 평균)
--    또는 total_score 가 1~5 범위로 저장된 단일 점수면 그것 사용
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_neighbor_star(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avg NUMERIC;
  v_count INT;
BEGIN
  -- 3-항목 평균 → 단일 별점
  SELECT
    ROUND(AVG((response_speed + accuracy + kindness) / 3.0)::numeric, 1),
    COUNT(*)
  INTO v_avg, v_count
  FROM public.reviews
  WHERE reviewed_user_id = p_user_id;

  -- 0~5 범위 클램핑 (방어)
  IF v_avg IS NOT NULL THEN
    v_avg := GREATEST(0, LEAST(5, v_avg));
  END IF;

  UPDATE public.profiles
     SET trust_score = v_avg,
         review_count = COALESCE(v_count, 0)
   WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION update_neighbor_star(UUID) TO authenticated, service_role;

-- 기존 update_trust_score(uuid) — 새 함수 부르도록 alias 유지 (혹시 코드 참조 남아있으면)
CREATE OR REPLACE FUNCTION update_trust_score(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM update_neighbor_star(p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION update_trust_score(UUID) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) reviews 변경 시 자동 재계산 트리거
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_reviews_after_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM update_neighbor_star(OLD.reviewed_user_id);
    RETURN OLD;
  ELSE
    PERFORM update_neighbor_star(NEW.reviewed_user_id);
    -- UPDATE 시 reviewed_user_id 가 바뀌면 옛 유저도 재계산
    IF TG_OP = 'UPDATE' AND NEW.reviewed_user_id <> OLD.reviewed_user_id THEN
      PERFORM update_neighbor_star(OLD.reviewed_user_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS reviews_after_change ON public.reviews;
CREATE TRIGGER reviews_after_change
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION trg_reviews_after_change();

-- ────────────────────────────────────────────────────────────────────────────
-- 4) 안전 가드 — 별점 1~5 CHECK
--    (이미 같은 제약 있으면 IF NOT EXISTS 패턴으로 안전하게)
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'reviews_response_speed_check'
  ) THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_response_speed_check CHECK (response_speed BETWEEN 1 AND 5),
      ADD CONSTRAINT reviews_accuracy_check       CHECK (accuracy BETWEEN 1 AND 5),
      ADD CONSTRAINT reviews_kindness_check       CHECK (kindness BETWEEN 1 AND 5);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  -- 이미 있으면 무시
  NULL;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5) 한 거래당 1번만 후기 가능 — partial unique index
--    reviews 에 source_type / source_id 가 있어야 정확하게 가드 가능.
--    현재 컬럼이 없으면 추가.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS source_type TEXT,                   -- 'local_food_order' | 'group_buying_order' | 'property' | …
  ADD COLUMN IF NOT EXISTS source_id   UUID;

CREATE UNIQUE INDEX IF NOT EXISTS reviews_unique_per_source
  ON public.reviews (reviewer_id, source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
