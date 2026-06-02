-- ============================================================================
-- 포인트 적립 doubling race 차단
--
-- 시나리오:
--   같은 source(예: 'local_food.purchase') + source_id(예: order_id) 로
--   두 개의 confirm 요청이 거의 동시에 들어오면, 둘 다 'earn' transaction 을
--   insert 하고 user_points 잔액을 각각 갱신 → 포인트 2배 지급.
--
-- 방어:
--   1. point_transactions UNIQUE INDEX(source, source_id) WHERE type='earn'
--      → 두 번째 insert 는 23505 (unique_violation) 로 실패. 라우트에서 silent skip.
--   2. grant_points_atomic RPC — INSERT … ON CONFLICT DO UPDATE 로 잔액 원자적 갱신.
--      라우트의 select-then-update 패턴(race 위험) 제거.
--
-- 회귀 0:
--   - 기존 user_points 컬럼 그대로 사용 (available, lifetime_earned).
--   - plaza_id 는 TEXT (foundation 마이그레이션과 일치).
--   - source_id 가 NULL 인 transaction 은 unique 검사 제외 (manual_adjust 등).
-- ============================================================================

BEGIN;

-- 1) 멱등성: 같은 source+source_id 로 earn 두 번 못 들어가게
--    NULL source_id 는 partial index 에서 제외됨 (Postgres 표준 동작).
CREATE UNIQUE INDEX IF NOT EXISTS pt_unique_earn_source
  ON point_transactions(source, source_id)
  WHERE type = 'earn' AND source_id IS NOT NULL;

-- 2) 원자적 잔액 갱신 — race condition 차단
--    plaza_id 는 user_points 와 동일하게 TEXT.
CREATE OR REPLACE FUNCTION grant_points_atomic(
  p_user UUID,
  p_plaza TEXT,
  p_amount INT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO user_points (user_id, plaza_id, available, lifetime_earned)
  VALUES (p_user, p_plaza, p_amount, p_amount)
  ON CONFLICT (user_id, plaza_id) DO UPDATE
    SET available = user_points.available + EXCLUDED.available,
        lifetime_earned = user_points.lifetime_earned + EXCLUDED.lifetime_earned,
        updated_at = NOW();
END;
$$;

REVOKE EXECUTE ON FUNCTION grant_points_atomic(UUID, TEXT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION grant_points_atomic(UUID, TEXT, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION grant_points_atomic(UUID, TEXT, INT) TO service_role;

COMMENT ON FUNCTION grant_points_atomic(UUID, TEXT, INT) IS
  '포인트 잔액 원자적 증가. point_transactions INSERT 직후 호출. service_role 전용.';

NOTIFY pgrst, 'reload schema';

COMMIT;
