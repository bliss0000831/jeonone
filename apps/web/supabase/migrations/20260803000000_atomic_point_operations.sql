-- 포인트 잔액 원자적 증감 RPC
-- earn/spend/revert 시 read-then-write 레이스 컨디션 방어
-- 모든 필드를 단일 UPDATE 에서 atomic 하게 증감

CREATE OR REPLACE FUNCTION increment_user_points(
  p_user_id UUID,
  p_available_delta BIGINT DEFAULT 0,
  p_pending_delta BIGINT DEFAULT 0,
  p_lifetime_earned_delta BIGINT DEFAULT 0,
  p_lifetime_spent_delta BIGINT DEFAULT 0,
  p_lifetime_reverted_delta BIGINT DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_points
  SET
    available         = GREATEST(0, available + p_available_delta),
    pending           = GREATEST(0, pending + p_pending_delta),
    lifetime_earned   = lifetime_earned + p_lifetime_earned_delta,
    lifetime_spent    = lifetime_spent + p_lifetime_spent_delta,
    lifetime_reverted = lifetime_reverted + p_lifetime_reverted_delta
  WHERE user_id = p_user_id;
END;
$$;

-- 일일 카운터 원자적 감소 RPC
-- daily_cap 초과 시 롤백용

CREATE OR REPLACE FUNCTION decrement_point_daily_counter(
  p_user_id UUID,
  p_rule_id TEXT,
  p_date DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE point_daily_counters
  SET count = GREATEST(0, count - 1)
  WHERE user_id = p_user_id
    AND rule_id = p_rule_id
    AND date = p_date;
END;
$$;

-- Reputation 원자적 감소 RPC
-- 음수 방어 포함

CREATE OR REPLACE FUNCTION decrement_reputation(
  p_user_id UUID,
  p_amount INT DEFAULT 10
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_points
  SET reputation_score = GREATEST(0, reputation_score - p_amount)
  WHERE user_id = p_user_id;
END;
$$;
