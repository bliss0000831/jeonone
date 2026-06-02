-- bump_inc_daily — 일일 카운터 atomic increment
-- (코드의 fallback 보다 race-safe + 단일 round-trip)
CREATE OR REPLACE FUNCTION bump_inc_daily(
  p_user_id UUID,
  p_plaza_id TEXT,
  p_target_type TEXT,
  p_date DATE,
  p_col TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_col NOT IN ('free_used', 'paid_used') THEN
    RAISE EXCEPTION 'invalid column %', p_col;
  END IF;

  IF p_col = 'free_used' THEN
    INSERT INTO bump_daily (user_id, plaza_id, target_type, date, free_used)
      VALUES (p_user_id, p_plaza_id, p_target_type, p_date, 1)
    ON CONFLICT (user_id, plaza_id, target_type, date)
    DO UPDATE SET free_used = bump_daily.free_used + 1;
  ELSE
    INSERT INTO bump_daily (user_id, plaza_id, target_type, date, paid_used)
      VALUES (p_user_id, p_plaza_id, p_target_type, p_date, 1)
    ON CONFLICT (user_id, plaza_id, target_type, date)
    DO UPDATE SET paid_used = bump_daily.paid_used + 1;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION bump_inc_daily FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bump_inc_daily TO authenticated, service_role;
