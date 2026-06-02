-- ============================================================================
-- Atomic view_count / views 증가 RPC — race condition 방어
--
-- 문제: 코드에서 read-modify-write 패턴으로 views 증가 →
--      동시 요청 시 일부 증가가 손실 (race condition).
-- 해결: PostgreSQL atomic UPDATE 로 race-free 증가.
--
-- 사용법:
--   await supabase.rpc('increment_view_count',
--     { p_table: 'properties', p_id: 'uuid-here', p_column: 'views' })
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION increment_view_count(
  p_table TEXT,
  p_id UUID,
  p_column TEXT DEFAULT 'views'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- 화이트리스트 — 임의 테이블 변조 방지
  allowed_tables TEXT[] := ARRAY[
    'properties',
    'board_posts',
    'secondhand_posts',
    'jobs_posts',
    'sharing_posts',
    'group_buying_posts',
    'clubs',
    'local_food',
    'new_store_posts',
    'interior_posts',
    'moving_posts',
    'cleaning_posts',
    'repair_posts'
  ];
  allowed_columns TEXT[] := ARRAY['views', 'view_count'];
BEGIN
  IF NOT (p_table = ANY(allowed_tables)) THEN
    RAISE EXCEPTION 'Table % not allowed', p_table;
  END IF;
  IF NOT (p_column = ANY(allowed_columns)) THEN
    RAISE EXCEPTION 'Column % not allowed', p_column;
  END IF;

  EXECUTE format(
    'UPDATE %I SET %I = COALESCE(%I, 0) + 1 WHERE id = $1',
    p_table, p_column, p_column
  ) USING p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_view_count(TEXT, UUID, TEXT) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';

COMMIT;
