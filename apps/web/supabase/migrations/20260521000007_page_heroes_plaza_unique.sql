-- ============================================================================
-- page_heroes: page_key UNIQUE → (plaza_id, page_key) 복합 UNIQUE 로 전환
-- 광장마다 동일 page_key 허용 (예: "secondhand" 가 광장별 별도 hero 이미지)
-- ============================================================================

BEGIN;

-- 기존 page_key UNIQUE 제거 (이름이 자동생성됐을 수도)
DO $$
BEGIN
  BEGIN
    ALTER TABLE page_heroes DROP CONSTRAINT IF EXISTS page_heroes_page_key_key;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  -- 일부 환경은 UNIQUE INDEX 로 잡혀있을 수 있어 INDEX 도 시도
  BEGIN
    DROP INDEX IF EXISTS page_heroes_page_key_key;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

-- 복합 UNIQUE 추가
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'page_heroes_plaza_page_key_key'
  ) THEN
    ALTER TABLE page_heroes
      ADD CONSTRAINT page_heroes_plaza_page_key_key UNIQUE (plaza_id, page_key);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
