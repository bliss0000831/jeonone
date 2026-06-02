-- ============================================================================
-- Atomic like_count / likes 증감 RPC — race condition 방어
--
-- 문제: 클라이언트에서 read-modify-write 으로 likes 증감하면
--      동시 좋아요 클릭 시 일부 카운트가 손실됨 (race).
-- 해결: PostgreSQL atomic UPDATE 로 race-free 증감.
--
-- 사용법:
--   await supabase.rpc('change_like_count',
--     { p_table: 'local_food', p_id: 'uuid', p_column: 'like_count', p_delta: 1 })
--
-- 음수 delta 도 허용 (좋아요 취소 시 -1).
-- 결과 카운트가 0 미만이 되지 않도록 GREATEST(…,0) 으로 클램핑.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION change_like_count(
  p_table TEXT,
  p_id UUID,
  p_column TEXT DEFAULT 'like_count',
  p_delta INTEGER DEFAULT 1
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
  allowed_columns TEXT[] := ARRAY['likes', 'like_count'];
BEGIN
  IF NOT (p_table = ANY(allowed_tables)) THEN
    RAISE EXCEPTION 'Table % not allowed', p_table;
  END IF;
  IF NOT (p_column = ANY(allowed_columns)) THEN
    RAISE EXCEPTION 'Column % not allowed', p_column;
  END IF;
  -- delta 는 ±1 ~ ±10 정도까지만 허용 (남용 방지)
  IF p_delta < -10 OR p_delta > 10 THEN
    RAISE EXCEPTION 'Delta out of range';
  END IF;

  EXECUTE format(
    'UPDATE %I SET %I = GREATEST(COALESCE(%I, 0) + $1, 0) WHERE id = $2',
    p_table, p_column, p_column
  ) USING p_delta, p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION change_like_count(TEXT, UUID, TEXT, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
