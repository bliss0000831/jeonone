-- 통합 검색 인프라
-- 1) pg_trgm 확장 + 각 카테고리 text 컬럼에 GIN trigram 인덱스 (ilike 가속)
-- 2) search_queries 집계 테이블 + log_search_query RPC (인기 검색어용)

-- ============================================================
-- 1. pg_trgm 가속 인덱스
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 부동산
CREATE INDEX IF NOT EXISTS idx_properties_title_trgm
  ON properties USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_properties_description_trgm
  ON properties USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_properties_address_trgm
  ON properties USING gin (address gin_trgm_ops);

-- 게시판
CREATE INDEX IF NOT EXISTS idx_board_posts_title_trgm
  ON board_posts USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_board_posts_content_trgm
  ON board_posts USING gin (content gin_trgm_ops);

-- 나눔
CREATE INDEX IF NOT EXISTS idx_sharing_posts_title_trgm
  ON sharing_posts USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sharing_posts_description_trgm
  ON sharing_posts USING gin (description gin_trgm_ops);

-- 모임
CREATE INDEX IF NOT EXISTS idx_clubs_title_trgm
  ON clubs USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clubs_description_trgm
  ON clubs USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clubs_content_trgm
  ON clubs USING gin (content gin_trgm_ops);

-- 공동구매
CREATE INDEX IF NOT EXISTS idx_group_buying_posts_title_trgm
  ON group_buying_posts USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_group_buying_posts_product_trgm
  ON group_buying_posts USING gin (product_name gin_trgm_ops);

-- 로컬푸드
CREATE INDEX IF NOT EXISTS idx_local_food_title_trgm
  ON local_food USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_local_food_description_trgm
  ON local_food USING gin (description gin_trgm_ops);

-- 인테리어 · 서비스 계열 (interior_posts, moving_posts, cleaning_posts, repair_posts 공통 구조)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['interior_posts', 'moving_posts', 'cleaning_posts', 'repair_posts']
  LOOP
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%I_title_trgm ON %I USING gin (title gin_trgm_ops)',
      t, t
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%I_content_trgm ON %I USING gin (content gin_trgm_ops)',
      t, t
    );
  END LOOP;
EXCEPTION WHEN undefined_table THEN
  -- 일부 테이블이 아직 없으면 스킵
  NULL;
END $$;

-- 프로필
CREATE INDEX IF NOT EXISTS idx_profiles_nickname_trgm
  ON profiles USING gin (nickname gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_bio_trgm
  ON profiles USING gin (bio gin_trgm_ops);


-- ============================================================
-- 2. search_queries 집계 테이블 (인기 검색어)
-- ============================================================
CREATE TABLE IF NOT EXISTS search_queries (
  term              text PRIMARY KEY,
  count             bigint NOT NULL DEFAULT 1,
  last_searched_at  timestamptz NOT NULL DEFAULT now(),
  first_searched_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_queries_count
  ON search_queries (count DESC, last_searched_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_queries_last
  ON search_queries (last_searched_at DESC);

-- RLS: 읽기는 누구나 (인기 검색어는 공개), 쓰기는 RPC(SECURITY DEFINER)로만 허용
ALTER TABLE search_queries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS search_queries_select_all ON search_queries;
CREATE POLICY search_queries_select_all ON search_queries
  FOR SELECT USING (true);

-- 직접 insert/update/delete 는 막아둠 (RPC 로만 사용)
DROP POLICY IF EXISTS search_queries_no_direct_write ON search_queries;
CREATE POLICY search_queries_no_direct_write ON search_queries
  FOR INSERT WITH CHECK (false);

-- ============================================================
-- 3. log_search_query RPC (upsert)
--    - 정규화: lower(trim(term))
--    - 너무 짧거나(<2자) 너무 긴(>50자) 건 스킵
-- ============================================================
CREATE OR REPLACE FUNCTION log_search_query(p_term text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_term text;
BEGIN
  v_term := lower(trim(COALESCE(p_term, '')));
  IF v_term IS NULL OR length(v_term) < 2 OR length(v_term) > 50 THEN
    RETURN;
  END IF;

  INSERT INTO search_queries (term, count, last_searched_at)
    VALUES (v_term, 1, now())
    ON CONFLICT (term)
    DO UPDATE SET
      count = search_queries.count + 1,
      last_searched_at = now();
END;
$$;

-- anon/authenticated 에게 실행 권한 부여
GRANT EXECUTE ON FUNCTION log_search_query(text) TO anon, authenticated;

COMMENT ON TABLE search_queries IS '통합 검색 키워드 집계 (인기 검색어용)';
COMMENT ON FUNCTION log_search_query(text) IS '검색 수행 시 upsert 호출. 짧/긴 키워드 필터 + 정규화.';
