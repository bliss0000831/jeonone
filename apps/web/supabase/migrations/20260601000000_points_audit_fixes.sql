-- ============================================================================
-- 감사 보고서 후속 조치 — 포인트 시스템 / 인덱스 / 동시성
--
--  1. point_daily_counters 원자적 증가 RPC (Race Condition 해소)
--  2. point_transactions 추가 인덱스 (조회 성능)
--  3. point_redemption_settings 정합성 ALTER (필요 시)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. 일일 카운터 원자적 증가 — UPSERT (count = count + 1)
--    SELECT → UPDATE 분리 시 동시 N개 요청이 한도 우회하던 버그 차단.
-- ============================================================================
CREATE OR REPLACE FUNCTION increment_point_daily_counter(
  p_user_id UUID,
  p_rule_id TEXT,
  p_date    DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO point_daily_counters (user_id, rule_id, date, count)
  VALUES (p_user_id, p_rule_id, p_date, 1)
  ON CONFLICT (user_id, rule_id, date)
  DO UPDATE SET count = point_daily_counters.count + 1
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_point_daily_counter(UUID, TEXT, DATE) TO authenticated, service_role;

COMMENT ON FUNCTION increment_point_daily_counter IS
  '일일 한도 카운터 원자적 +1 (race-safe). 반환: 증가 후 count.';

-- ============================================================================
-- 2. point_transactions 조회 성능 인덱스
--    어드민 대시보드 / 사용자 거래 내역에서 created_at DESC 정렬이 빈번.
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_point_tx_created_at
  ON point_transactions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_point_tx_user_plaza_created
  ON point_transactions (user_id, plaza_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_point_tx_plaza_created
  ON point_transactions (plaza_id, created_at DESC);

COMMIT;

NOTIFY pgrst, 'reload schema';
