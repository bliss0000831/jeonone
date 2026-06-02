-- ============================================================================
-- favorites 에 plaza_id 추가 — 광장별 즐겨찾기 격리
--
-- 그동안 favorites 만 plaza 컬럼이 없어서 어느 광장에서 찜했는지 추적 불가.
-- "내가 찜한 매물" 페이지가 다른 광장 매물을 노출하던 잠재 버그 차단.
-- ============================================================================

BEGIN;

ALTER TABLE favorites ADD COLUMN IF NOT EXISTS plaza_id TEXT;

-- 백필: favorites.property_id → properties.plaza_id
UPDATE favorites f
SET plaza_id = p.plaza_id
FROM properties p
WHERE f.property_id = p.id
  AND f.plaza_id IS NULL;

-- 그래도 NULL 인 (orphan property) 은 chuncheon 으로
UPDATE favorites SET plaza_id = 'chuncheon' WHERE plaza_id IS NULL;

ALTER TABLE favorites ALTER COLUMN plaza_id SET DEFAULT 'chuncheon';

CREATE INDEX IF NOT EXISTS favorites_plaza_user_idx ON favorites(plaza_id, user_id);
CREATE INDEX IF NOT EXISTS favorites_plaza_property_idx ON favorites(plaza_id, property_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
