-- ============================================================================
-- 게시글 지역 분리 — 광장 안 시/군 단위로 글 필터링.
--
-- 1. 13개 post 테이블에 region_id UUID FK 추가 (NULL = "전체 지역" 글)
-- 2. (plaza_id, region_id) 복합 인덱스 — 필터 성능
-- 3. 백필 — 작성자 profile.location 의 시/군 이름과 regions.name 매칭
--    매칭 안 되면 NULL (= 전체 지역에 노출)
--
-- regions 테이블은 이미 plaza_id 별 level=1 (시/군) row 가 시드돼 있음
-- (20260521000004_regions_per_plaza_seed.sql).
-- ============================================================================

BEGIN;

-- ─── 1. region_id 컬럼 추가 (13개 테이블) ─────────────────────────────────
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'properties',
    'property_requests',
    'secondhand_posts',
    'jobs_posts',
    'board_posts',
    'sharing_posts',
    'group_buying_posts',
    'new_store_posts',
    'local_food',
    'clubs',
    'interior_posts',
    'moving_posts',
    'cleaning_posts',
    'repair_posts'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES regions(id) ON DELETE SET NULL',
        t
      );
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I(plaza_id, region_id)',
        t || '_plaza_region_idx', t
      );
    END IF;
  END LOOP;
END $$;

-- ─── 2. 백필 — 작성자 profile.location 의 시/군 이름과 매칭 ───────────────
--
-- 알고리즘:
--   - profiles.location 텍스트(예: "춘천시 동내면") 안에 regions.name(시/군)이
--     포함되는지 LIKE 매칭
--   - plaza_id 도 같이 매칭 (광장 외부 region 으로 가지 않도록)
--   - 매칭 안 되면 region_id 는 NULL 유지 (=전체 글)
--
-- 주의: properties/new_store 등 주소 컬럼이 있는 도메인은 추후 JS 파서로
-- 더 정확히 처리. 백필은 1차로 profile.location 기준.

CREATE OR REPLACE FUNCTION _backfill_post_region(p_table TEXT)
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
      JOIN profiles p ON p.id = post_inner.user_id
      JOIN regions  r ON r.plaza_id = post_inner.plaza_id
                    AND r.level = 1
                    AND p.location IS NOT NULL
                    AND p.location LIKE '%%' || r.name || '%%'
    ) AS sub
    WHERE post.id = sub.post_id
      AND post.region_id IS NULL
  $q$, p_table, p_table);

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END $$;

DO $$
DECLARE
  t TEXT;
  cnt INT;
  tables TEXT[] := ARRAY[
    'properties',
    'property_requests',
    'secondhand_posts',
    'jobs_posts',
    'board_posts',
    'sharing_posts',
    'group_buying_posts',
    'new_store_posts',
    'local_food',
    'clubs',
    'interior_posts',
    'moving_posts',
    'cleaning_posts',
    'repair_posts'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      cnt := _backfill_post_region(t);
      RAISE NOTICE 'backfilled % rows in %', cnt, t;
    END IF;
  END LOOP;
END $$;

-- 헬퍼 함수 정리
DROP FUNCTION IF EXISTS _backfill_post_region(TEXT);

-- ─── 3. PostgREST 스키마 reload ──────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMIT;
