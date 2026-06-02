-- ============================================================================
-- plazas 에 한국관광공사 TourAPI 지역 코드 컬럼 추가 — cron/tour-events 광장별 분리
--
-- areaCode/sigunguCode 가 NULL 이면 해당 광장은 tour-events 자동수집 SKIP.
-- 추후 광장 오픈 시 SQL 한 줄로 활성화 가능.
-- ============================================================================

BEGIN;

ALTER TABLE plazas ADD COLUMN IF NOT EXISTS tour_area_code TEXT;
ALTER TABLE plazas ADD COLUMN IF NOT EXISTS tour_sigungu_code TEXT;

-- 강원도(32) 시군구
UPDATE plazas SET tour_area_code = '32', tour_sigungu_code = '13' WHERE id = 'chuncheon';
UPDATE plazas SET tour_area_code = '32', tour_sigungu_code = '1'  WHERE id = 'gangneung';
UPDATE plazas SET tour_area_code = '32', tour_sigungu_code = '17' WHERE id = 'wonju';
UPDATE plazas SET tour_area_code = '32', tour_sigungu_code = '8'  WHERE id = 'sokcho';
UPDATE plazas SET tour_area_code = '32', tour_sigungu_code = '6'  WHERE id = 'donghae';
UPDATE plazas SET tour_area_code = '32', tour_sigungu_code = '12' WHERE id = 'taebaek';

-- moderation_keywords 광장별 분리
ALTER TABLE moderation_keywords ADD COLUMN IF NOT EXISTS plaza_id TEXT;
UPDATE moderation_keywords SET plaza_id = 'chuncheon' WHERE plaza_id IS NULL;
ALTER TABLE moderation_keywords ALTER COLUMN plaza_id SET DEFAULT 'chuncheon';
-- 키워드 중복방지 키에 plaza 포함
DO $$
BEGIN
  -- 기존 unique 제약/인덱스가 있다면 광장별로 재정의
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'moderation_keywords_keyword_scope_key'
  ) THEN
    ALTER TABLE moderation_keywords DROP CONSTRAINT moderation_keywords_keyword_scope_key;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS moderation_keywords_plaza_keyword_scope_key
  ON moderation_keywords(plaza_id, keyword, scope);
CREATE INDEX IF NOT EXISTS moderation_keywords_plaza_idx ON moderation_keywords(plaza_id);

-- chuncheon_events 중복방지 unique 키에 plaza_id 추가 (서로 다른 광장이
-- 같은 external_id 가져도 충돌 안 나게)
DROP INDEX IF EXISTS chuncheon_events_source_external_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS chuncheon_events_source_external_plaza_key
  ON chuncheon_events (source, external_id, plaza_id)
  WHERE external_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
