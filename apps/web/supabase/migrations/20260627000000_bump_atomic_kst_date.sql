-- ============================================================================
-- bump_atomic RPC — 일일 카운터 KST 정렬 (UTC 와의 시차 버그 수정)
--
-- 문제:
--   기존 RPC 가 v_today := CURRENT_DATE (UTC) 로 bump_daily 를 INSERT/UPSERT.
--   /api/bump/status 는 Intl 'en-CA' Asia/Seoul 으로 KST 오늘 날짜를 키로 조회.
--   한국 자정 ~ 09:00 (UTC 15:00 ~ 24:00 전날) 시간대에 두 날짜가 어긋남:
--     - status: KST 오늘 = freeRemaining 2/2 (행 없음)
--     - RPC: UTC 오늘 = 이미 free_used=2 → no_free_quota
--   → 모달 표시와 실제 결과가 불일치, "잔여 있는데 거절" 버그.
--
-- 해결:
--   RPC 의 v_today 도 KST 기준으로 계산.
--     (NOW() AT TIME ZONE 'Asia/Seoul')::date
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
  -- KST 기준 — /api/bump/status 의 todayDateStr() 과 일치시킴
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::date;
  v_free_used INT;
  v_ticket_updated INT;
  v_age_days INT;
  v_bumped_at TIMESTAMPTZ;
  v_sql TEXT;
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
    -- 일일 무료 카운터 atomic increment (KST 기준 날짜)
    INSERT INTO bump_daily (user_id, plaza_id, target_type, date, free_used)
      VALUES (p_user_id, p_plaza_id, p_target_type, v_today, 1)
    ON CONFLICT (user_id, plaza_id, target_type, date)
    DO UPDATE SET free_used = bump_daily.free_used + 1
    WHERE bump_daily.free_used < v_setting.free_per_day
    RETURNING free_used INTO v_free_used;

    IF v_free_used IS NULL THEN
      RETURN json_build_object('ok', false, 'reason', 'no_free_quota');
    END IF;

  ELSIF p_payment = 'points' THEN
    -- spend 호출 (atomic 함수)
    PERFORM points_spend_atomic(p_user_id, p_plaza_id, 'bump', p_points_cost, NULL, p_target_id);
    -- spend 가 실패하면 RAISE EXCEPTION 으로 이 트랜잭션 전체 롤백

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

  -- 카운터 (paid 결제 시) — 동일하게 KST 날짜
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
