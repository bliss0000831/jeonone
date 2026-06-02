-- ============================================================================
-- favorites 카운트 집계 RPC — 클라이언트가 favorites 풀 스캔하지 않도록.
--
-- 사용처:
--   /api/properties (홈 SSR), /properties 클라 페이지
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION get_property_favorite_counts(p_plaza_id TEXT, p_property_ids UUID[])
RETURNS TABLE (property_id UUID, favorite_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.property_id, COUNT(*)::BIGINT AS favorite_count
  FROM favorites f
  WHERE f.property_id = ANY(p_property_ids)
    AND (p_plaza_id IS NULL OR f.plaza_id = p_plaza_id)
  GROUP BY f.property_id;
$$;

GRANT EXECUTE ON FUNCTION get_property_favorite_counts(TEXT, UUID[]) TO anon, authenticated;

COMMENT ON FUNCTION get_property_favorite_counts IS
  '주어진 매물 ID 배열에 대한 찜 카운트만 GROUP BY. 풀 스캔 회피.';

COMMIT;

NOTIFY pgrst, 'reload schema';
