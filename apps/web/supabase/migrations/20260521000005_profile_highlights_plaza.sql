-- ============================================================================
-- profile_highlights 에 plaza_id 추가 — 광장별 하이라이트 격리
--
-- 사용자가 광장 A 에서 등록한 하이라이트가 광장 B 에서 노출되지 않도록.
-- 기존 데이터는 'chuncheon' 으로 백필.
-- ============================================================================

BEGIN;

ALTER TABLE profile_highlights ADD COLUMN IF NOT EXISTS plaza_id TEXT;
UPDATE profile_highlights SET plaza_id = 'chuncheon' WHERE plaza_id IS NULL;
ALTER TABLE profile_highlights ALTER COLUMN plaza_id SET DEFAULT 'chuncheon';
CREATE INDEX IF NOT EXISTS profile_highlights_plaza_idx ON profile_highlights(plaza_id, user_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
