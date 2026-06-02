-- ============================================================================
-- 멀티-광장: 누락된 콘텐츠 테이블에 plaza_id 추가
--
-- 20260521000000 (foundation) 에서 main post 테이블 일부가 누락됨:
--   - clubs, sharing_posts, group_buying_posts
--   - local_food, new_store_posts
--   - interior_posts, moving_posts, cleaning_posts, repair_posts
--
-- 이 테이블들이 누락되니 코드에서 .eq('plaza_id', plaza) 가 컬럼 없음 에러로
-- 무시되거나 잘못된 결과가 나옴. 누락분 추가 + chuncheon 백필.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'clubs',
    'sharing_posts',
    'group_buying_posts',
    'local_food',
    'new_store_posts',
    'interior_posts',
    'moving_posts',
    'cleaning_posts',
    'repair_posts'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS plaza_id TEXT', t);
      EXECUTE format('UPDATE %I SET plaza_id = ''chuncheon'' WHERE plaza_id IS NULL', t);
      EXECUTE format('ALTER TABLE %I ALTER COLUMN plaza_id SET DEFAULT ''chuncheon''', t);
      EXECUTE format(
        'DO $inner$ BEGIN
           IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = %L) THEN
             ALTER TABLE %I ADD CONSTRAINT %I CHECK (plaza_id IS NOT NULL);
           END IF;
         END $inner$;',
        t || '_plaza_id_not_null', t, t || '_plaza_id_not_null'
      );
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(plaza_id)', t || '_plaza_id_idx', t);
    END IF;
  END LOOP;
END $$;

COMMIT;
