-- ============================================================================
-- 올리기 정책 변경 — 일일 무료 한도를 도메인별이 아니라 사용자 전체 통합 2개로
--
-- 이전: bump_settings.free_per_day 가 target_type 별로 1개씩 → 11개 도메인 = 11개
-- 변경: 전체 통합 2개 (GLOBAL_FREE_PER_DAY = 2). 모든 도메인의 free_used 합산
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION bump_atomic(
  p_user_id UUID,
  p_plaza_id TEXT,
  p_target_type TEXT,
  p_target_id UUID,
  p_payment TEXT,
  p_points_cost INT DEFAULT 0
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table TEXT;
  v_target record;
  v_setting record;
  v_today DATE := CURRENT_DATE;
  v_free_used_total INT;
  v_ticket_updated INT;
  v_age_days INT;
  v_bumped_at TIMESTAMPTZ;
  v_sql TEXT;
  v_global_free_per_day INT := 2;
BEGIN
  -- target_type → table 매핑
  CASE p_target_type
    WHEN 'property'     THEN v_table := 'properties';
    WHEN 'secondhand'   THEN v_table := 'secondhand_posts';
    WHEN 'interior'     THEN v_table := 'interior_posts';
    WHEN 'moving'       THEN v_table := 'moving_posts';
    WHEN 'cleaning'     THEN v_table := 'cleaning_posts';
    WHEN 'repair'       THEN v_table := 'repair_posts';
    WHEN 'group_buying' THEN v_table := 'group_buying_posts';
    WHEN 'local_food'   THEN v_table := 'local_food';
    WHEN 'jobs'         THEN v_table := 'jobs_posts';
    WHEN 'new_store'    THEN v_table := 'new_store_posts';
    ELSE
      RETURN json_build_object('ok', false, 'reason', 'invalid_target_type');
  END CASE;

  -- 소유권 + plaza 검증
  v_sql := format(
    'SELECT user_id, plaza_id, bumped_at FROM %I WHERE id = $1',
    v_table
  );
  EXECUTE v_sql INTO v_target USING p_target_id;

  IF v_target IS NULL OR v_target.user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'not_found_or_not_owner');
  END IF;
  IF v_target.user_id <> p_user_id OR v_target.plaza_id <> p_plaza_id THEN
    RETURN json_build_object('ok', false, 'reason', 'not_found_or_not_owner');
  END IF;

  -- 정책
  SELECT * INTO v_setting
  FROM bump_settings
  WHERE target_type = p_target_type AND enabled = TRUE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'reason', 'feature_disabled');
  END IF;

  -- 가입 연령
  SELECT FLOOR(EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400)::int
    INTO v_age_days
    FROM profiles WHERE id = p_user_id;
  IF v_age_days < v_setting.required_account_age_days THEN
    RETURN json_build_object('ok', false, 'reason', 'account_too_young');
  END IF;

  -- 같은 글 cooldown
  IF v_target.bumped_at IS NOT NULL
     AND v_target.bumped_at + (v_setting.cooldown_seconds || ' seconds')::interval > NOW() THEN
    RETURN json_build_object('ok', false, 'reason', 'cooldown');
  END IF;

  -- 결제 처리
  IF p_payment = 'free' THEN
    -- 🆕 전체 도메인 합산 무료 카운트 (사용자 단위 통합 2개)
    SELECT COALESCE(SUM(free_used), 0) INTO v_free_used_total
    FROM bump_daily
    WHERE user_id = p_user_id
      AND plaza_id = p_plaza_id
      AND date = v_today;

    IF v_free_used_total >= v_global_free_per_day THEN
      RETURN json_build_object('ok', false, 'reason', 'no_free_quota');
    END IF;

    -- 카운터 증가 (도메인별 row 유지 — 통계용)
    INSERT INTO bump_daily (user_id, plaza_id, target_type, date, free_used)
      VALUES (p_user_id, p_plaza_id, p_target_type, v_today, 1)
    ON CONFLICT (user_id, plaza_id, target_type, date)
    DO UPDATE SET free_used = bump_daily.free_used + 1;

  ELSIF p_payment = 'points' THEN
    -- spend 호출 (atomic 함수)
    PERFORM points_spend_atomic(p_user_id, p_plaza_id, 'bump', p_points_cost, NULL, p_target_id);

  ELSIF p_payment = 'ticket' THEN
    UPDATE bump_tickets
       SET balance = balance - 1,
           lifetime_used = lifetime_used + 1,
           updated_at = NOW()
     WHERE user_id = p_user_id
       AND plaza_id = p_plaza_id
       AND balance > 0
    RETURNING 1 INTO v_ticket_updated;
    IF v_ticket_updated IS NULL THEN
      RETURN json_build_object('ok', false, 'reason', 'no_tickets');
    END IF;
  ELSE
    RETURN json_build_object('ok', false, 'reason', 'invalid_payment');
  END IF;

  -- bumped_at 갱신
  v_bumped_at := NOW();
  v_sql := format('UPDATE %I SET bumped_at = $1 WHERE id = $2 AND user_id = $3', v_table);
  EXECUTE v_sql USING v_bumped_at, p_target_id, p_user_id;

  -- 카운터 (paid 결제 시)
  IF p_payment IN ('points', 'ticket') THEN
    INSERT INTO bump_daily (user_id, plaza_id, target_type, date, paid_used)
      VALUES (p_user_id, p_plaza_id, p_target_type, v_today, 1)
    ON CONFLICT (user_id, plaza_id, target_type, date)
    DO UPDATE SET paid_used = bump_daily.paid_used + 1;
  END IF;

  -- history
  INSERT INTO bump_history (
    user_id, plaza_id, target_type, target_id, payment, cost_points
  ) VALUES (
    p_user_id, p_plaza_id, p_target_type, p_target_id, p_payment,
    CASE WHEN p_payment = 'points' THEN p_points_cost ELSE 0 END
  );

  RETURN json_build_object('ok', true, 'bumped_at', v_bumped_at);
END;
$$;

REVOKE ALL ON FUNCTION bump_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bump_atomic TO authenticated, service_role;

COMMIT;
