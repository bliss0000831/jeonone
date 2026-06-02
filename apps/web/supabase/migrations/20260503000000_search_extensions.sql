-- 검색 확장: 오타 제안 RPC + 키워드 블랙리스트
-- 1) search_term_blacklist 테이블 (관리자 숨김 키워드)
-- 2) log_search_query 재정의 (블랙리스트 반영)
-- 3) suggest_search_terms RPC (pg_trgm similarity 기반 오타 교정)

-- ============================================================
-- 1. search_term_blacklist
-- ============================================================
CREATE TABLE IF NOT EXISTS search_term_blacklist (
  term        text PRIMARY KEY,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE search_term_blacklist ENABLE ROW LEVEL SECURITY;

-- 읽기: 공개 (검색어 필터링용으로 클라/서버 양쪽에서 참조)
DROP POLICY IF EXISTS search_term_blacklist_select_all ON search_term_blacklist;
CREATE POLICY search_term_blacklist_select_all ON search_term_blacklist
  FOR SELECT USING (true);

-- 쓰기는 admin/superadmin 만 (INSERT / UPDATE / DELETE)
DROP POLICY IF EXISTS search_term_blacklist_admin_write ON search_term_blacklist;
CREATE POLICY search_term_blacklist_admin_write ON search_term_blacklist
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
    )
  );

-- search_queries: admin 은 DELETE 가능 (관리자 페이지에서 정리용)
DROP POLICY IF EXISTS search_queries_admin_delete ON search_queries;
CREATE POLICY search_queries_admin_delete ON search_queries
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
    )
  );


-- ============================================================
-- 2. log_search_query 재정의 (블랙리스트 고려 + 블랙리스트된 건 집계/저장 모두 skip)
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

  -- 블랙리스트에 있으면 저장하지 않음
  IF EXISTS (SELECT 1 FROM search_term_blacklist WHERE term = v_term) THEN
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

GRANT EXECUTE ON FUNCTION log_search_query(text) TO anon, authenticated;


-- ============================================================
-- 3. suggest_search_terms (오타/유사 검색어 제안)
--    - 누적 검색어 중 similarity >= 0.35 인 것
--    - 인기도 + 유사도 조합으로 정렬
-- ============================================================
CREATE OR REPLACE FUNCTION suggest_search_terms(p_term text, p_limit int DEFAULT 3)
RETURNS TABLE(term text, similarity real, count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT
    sq.term,
    similarity(sq.term, lower(trim(p_term)))::real AS similarity,
    sq.count
  FROM search_queries sq
  WHERE
    length(lower(trim(p_term))) >= 2
    AND sq.term <> lower(trim(p_term))
    AND similarity(sq.term, lower(trim(p_term))) >= 0.35
    AND NOT EXISTS (
      SELECT 1 FROM search_term_blacklist b WHERE b.term = sq.term
    )
  ORDER BY similarity DESC, sq.count DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 3), 10));
$$;

GRANT EXECUTE ON FUNCTION suggest_search_terms(text, int) TO anon, authenticated;

COMMENT ON TABLE search_term_blacklist IS '관리자가 숨긴 검색어 (인기/제안에서 제외)';
COMMENT ON FUNCTION suggest_search_terms(text, int) IS 'pg_trgm similarity 기반 검색어 제안 (오타 교정용)';
