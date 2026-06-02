-- ============================================================================
-- board_stats_aggregate(plaza_id, region, days) RPC
--
-- 활동왕 집계를 Postgres 에서 GROUP BY 로 끝내기.
-- 이전: Node 가 board_posts/comments 의 모든 행을 가져와 JS 로 집계 (수천 행 메모리 + 60s 마다 반복)
-- 지금: SQL 한 번에 user_id 별 (posts, comments, likes_received) 합산
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION board_stats_aggregate(
  p_plaza_id TEXT DEFAULT NULL,
  p_region   TEXT DEFAULT NULL,
  p_days     INT  DEFAULT 30
)
RETURNS TABLE (
  user_id        UUID,
  posts          INT,
  comments       INT,
  likes_received INT,
  nickname       TEXT,
  avatar_url     TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ := NOW() - (p_days || ' days')::INTERVAL;
BEGIN
  RETURN QUERY
  WITH posts_agg AS (
    SELECT
      p.user_id,
      COUNT(*)::INT AS posts,
      COALESCE(SUM(p.like_count), 0)::INT AS likes_received
    FROM board_posts p
    WHERE p.created_at >= v_since
      AND (p_plaza_id IS NULL OR p.plaza_id = p_plaza_id)
      AND (p_region   IS NULL OR p.region   = p_region OR p.region IS NULL)
    GROUP BY p.user_id
  ),
  comments_agg AS (
    SELECT
      c.user_id,
      COUNT(*)::INT AS comments
    FROM board_comments c
    WHERE c.created_at >= v_since
      AND (p_plaza_id IS NULL OR c.plaza_id = p_plaza_id)
    GROUP BY c.user_id
  )
  SELECT
    COALESCE(pa.user_id, ca.user_id)              AS user_id,
    COALESCE(pa.posts, 0)                          AS posts,
    COALESCE(ca.comments, 0)                       AS comments,
    COALESCE(pa.likes_received, 0)                 AS likes_received,
    pr.nickname,
    pr.avatar_url
  FROM posts_agg pa
  FULL OUTER JOIN comments_agg ca ON ca.user_id = pa.user_id
  LEFT JOIN profiles pr ON pr.id = COALESCE(pa.user_id, ca.user_id)
  WHERE COALESCE(pa.user_id, ca.user_id) IS NOT NULL
  ORDER BY (COALESCE(pa.posts, 0) * 10
         + COALESCE(ca.comments, 0) * 3
         + COALESCE(pa.likes_received, 0)) DESC
  LIMIT 50;
END;
$$;

GRANT EXECUTE ON FUNCTION board_stats_aggregate(TEXT, TEXT, INT) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';

COMMIT;
