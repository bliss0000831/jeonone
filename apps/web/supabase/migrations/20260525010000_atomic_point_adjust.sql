-- Atomic point adjustment RPC for admin manual point grants/deductions.
-- Eliminates the read-then-write race condition in the admin points API.

-- DROP old signature (no p_plaza_id) to avoid overload ambiguity
DROP FUNCTION IF EXISTS admin_adjust_points(UUID, BIGINT, UUID);

CREATE OR REPLACE FUNCTION admin_adjust_points(
  p_user_id UUID,
  p_plaza_id TEXT,
  p_delta BIGINT,
  p_admin_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_new BIGINT;
BEGIN
  -- Upsert user_points row if not exists (PK = user_id + plaza_id)
  INSERT INTO user_points (user_id, plaza_id, available, pending, lifetime_earned, lifetime_spent, lifetime_reverted)
  VALUES (p_user_id, p_plaza_id, 0, 0, 0, 0, 0)
  ON CONFLICT (user_id, plaza_id) DO NOTHING;

  -- Atomic update with balance check
  IF p_delta > 0 THEN
    UPDATE user_points
    SET available = available + p_delta,
        lifetime_earned = lifetime_earned + p_delta
    WHERE user_id = p_user_id AND plaza_id = p_plaza_id
    RETURNING available INTO v_new;
  ELSE
    UPDATE user_points
    SET available = available + p_delta,
        lifetime_reverted = lifetime_reverted + abs(p_delta)
    WHERE user_id = p_user_id AND plaza_id = p_plaza_id
      AND available + p_delta >= 0
    RETURNING available INTO v_new;

    IF v_new IS NULL THEN
      RAISE EXCEPTION 'insufficient_balance';
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'newBalance', v_new);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
