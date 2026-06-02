-- ============================================================================
-- region_id 백필 v2 — 글 자체의 location/address 컬럼 기반.
--
-- v1 (20260701000000_post_region.sql) 은 profile.location 기준이라
-- 작성자 profile 이 비어있으면 post.region_id 가 NULL 로 남음.
-- v2 는 post 자체의 location(또는 address) 컬럼에서 시/군 이름을 매칭.
--
-- 대상 14 테이블 중 location/address 컬럼이 있는 것에만 적용 (try/catch).
-- ============================================================================

CREATE OR REPLACE FUNCTION _backfill_post_region_v2(p_table TEXT, p_col TEXT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INT := 0;
BEGIN
  EXECUTE format($q$
    UPDATE %I AS post
    SET region_id = sub.region_id
    FROM (
      SELECT post_inner.id AS post_id, r.id AS region_id
      FROM %I AS post_inner
      JOIN regions  r ON r.plaza_id = post_inner.plaza_id
                    AND r.level = 1
                    AND post_inner.%I IS NOT NULL
                    AND post_inner.%I LIKE '%%' || r.name || '%%'
    ) AS sub
    WHERE post.id = sub.post_id
      AND post.region_id IS NULL
  $q$, p_table, p_table, p_col, p_col);

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END $$;

DO $$
DECLARE
  cnt INT;
BEGIN
  -- properties: address 컬럼
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='properties' AND column_name='address') THEN
    cnt := _backfill_post_region_v2('properties', 'address');
    RAISE NOTICE 'v2 backfilled % rows in properties (address)', cnt;
  END IF;

  -- 나머지 — location 컬럼
  FOR cnt IN
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name IN (
      'property_requests', 'secondhand_posts', 'jobs_posts', 'board_posts',
      'sharing_posts', 'group_buying_posts', 'new_store_posts', 'local_food',
      'clubs', 'interior_posts', 'moving_posts', 'cleaning_posts', 'repair_posts'
    )
  LOOP
    -- nothing
  END LOOP;

  -- location 컬럼이 있는 테이블 (개별 처리)
  PERFORM _backfill_post_region_v2('property_requests', 'location')
    WHERE EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='property_requests' AND column_name='location');
  PERFORM _backfill_post_region_v2('secondhand_posts', 'location')
    WHERE EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='secondhand_posts' AND column_name='location');
  PERFORM _backfill_post_region_v2('jobs_posts', 'location')
    WHERE EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='jobs_posts' AND column_name='location');
  PERFORM _backfill_post_region_v2('sharing_posts', 'location')
    WHERE EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='sharing_posts' AND column_name='location');
  PERFORM _backfill_post_region_v2('new_store_posts', 'location')
    WHERE EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='new_store_posts' AND column_name='location');
  PERFORM _backfill_post_region_v2('local_food', 'location')
    WHERE EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='local_food' AND column_name='location');
  PERFORM _backfill_post_region_v2('clubs', 'location')
    WHERE EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='clubs' AND column_name='location');
  PERFORM _backfill_post_region_v2('interior_posts', 'location')
    WHERE EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='interior_posts' AND column_name='location');
  PERFORM _backfill_post_region_v2('moving_posts', 'location')
    WHERE EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='moving_posts' AND column_name='location');
  PERFORM _backfill_post_region_v2('cleaning_posts', 'location')
    WHERE EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='cleaning_posts' AND column_name='location');
  PERFORM _backfill_post_region_v2('repair_posts', 'location')
    WHERE EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='repair_posts' AND column_name='location');
END $$;

DROP FUNCTION IF EXISTS _backfill_post_region_v2(TEXT, TEXT);

NOTIFY pgrst, 'reload schema';
