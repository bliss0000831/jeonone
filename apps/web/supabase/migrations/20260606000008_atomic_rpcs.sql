-- ============================================================================
-- 동시성/atomicity RPC 함수 — race condition 해결
-- 모두 SECURITY DEFINER + plpgsql 트랜잭션 — 단일 호출 = 단일 트랜잭션.
-- ============================================================================

-- ─── 1. spend (포인트 사용) — atomic balance check + decrement + transaction insert
CREATE OR REPLACE FUNCTION points_spend_atomic(
  p_user_id UUID,
  p_plaza_id TEXT,
  p_category TEXT,
  p_amount INT,
  p_payment_total INT DEFAULT NULL,
  p_source_id UUID DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setting record;
  v_max_pt INT;
  v_updated INT;
  v_tx_id UUID;
BEGIN
  -- 사용처 정책 확인
  SELECT * INTO v_setting
  FROM point_redemption_settings
  WHERE category = p_category AND enabled = TRUE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'reason', 'category_disabled');
  END IF;

  IF p_payment_total IS NOT NULL THEN
    v_max_pt := FLOOR(p_payment_total * v_setting.max_redemption_pct / 100);
    IF p_amount > v_max_pt THEN
      RETURN json_build_object('ok', false, 'reason', 'exceeds_redemption_pct');
    END IF;
  END IF;

  -- atomic balance 검증 + 차감 (음수 잔액 race 방어)
  UPDATE user_points
     SET available = available - p_amount,
         lifetime_spent = lifetime_spent + p_amount
   WHERE user_id = p_user_id
     AND plaza_id = p_plaza_id
     AND available >= p_amount
     AND is_suspended = FALSE
  RETURNING 1 INTO v_updated;

  IF v_updated IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'insufficient_balance_or_suspended');
  END IF;

  -- 거래 기록 (이미 차감됨 → confirmed)
  INSERT INTO point_transactions (
    user_id, plaza_id, type, amount, source, source_id, status, confirmed_at, metadata
  ) VALUES (
    p_user_id, p_plaza_id, 'spend', p_amount,
    p_category || '.purchase', p_source_id, 'confirmed', NOW(),
    jsonb_build_object('category', p_category, 'payment_total', p_payment_total)
  )
  RETURNING id INTO v_tx_id;

  RETURN json_build_object('ok', true, 'tx_id', v_tx_id);
END;
$$;

REVOKE ALL ON FUNCTION points_spend_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION points_spend_atomic TO authenticated, service_role;

-- ─── 2. bump_atomic — 글 올리기 (소유 확인 + ticket 차감 + bumped_at + history)
-- payment: 'free' | 'points' | 'ticket'
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
    -- 일일 무료 카운터 atomic increment
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

-- ─── 3. bump_purchase_ticket_atomic — 올리기권 충전 (포인트 차감 + 잔액 증가 + 주문 기록)
CREATE OR REPLACE FUNCTION bump_purchase_ticket_atomic(
  p_user_id UUID,
  p_plaza_id TEXT,
  p_pack_id TEXT,
  p_payment TEXT,
  p_payment_id UUID DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pack record;
  v_new_balance INT;
BEGIN
  SELECT * INTO v_pack FROM bump_ticket_packs
  WHERE id = p_pack_id AND enabled = TRUE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'reason', 'pack_not_found');
  END IF;

  -- 결제
  IF p_payment = 'points' THEN
    PERFORM points_spend_atomic(p_user_id, p_plaza_id, 'bump', v_pack.points_price, NULL, NULL);
    -- 실패 시 이 트랜잭션 전체 롤백
  ELSIF p_payment = 'cash' THEN
    -- BETA stub — payment_id 검증은 외부에서 처리 (Phase C)
    IF p_payment_id IS NULL THEN
      RETURN json_build_object('ok', false, 'reason', 'payment_id_required');
    END IF;
  ELSE
    RETURN json_build_object('ok', false, 'reason', 'invalid_payment');
  END IF;

  -- ticket 잔액 +size
  INSERT INTO bump_tickets (user_id, plaza_id, balance, lifetime_purchased, updated_at)
    VALUES (p_user_id, p_plaza_id, v_pack.size, v_pack.size, NOW())
  ON CONFLICT (user_id, plaza_id)
  DO UPDATE SET
    balance = bump_tickets.balance + v_pack.size,
    lifetime_purchased = bump_tickets.lifetime_purchased + v_pack.size,
    updated_at = NOW()
  RETURNING balance INTO v_new_balance;

  -- 주문 기록
  INSERT INTO bump_ticket_orders (
    user_id, plaza_id, pack_id, qty, payment, cost_points, cost_krw, payment_id
  ) VALUES (
    p_user_id, p_plaza_id, p_pack_id, v_pack.size, p_payment,
    CASE WHEN p_payment = 'points' THEN v_pack.points_price ELSE 0 END,
    CASE WHEN p_payment = 'cash'   THEN v_pack.krw_price    ELSE 0 END,
    p_payment_id
  );

  RETURN json_build_object('ok', true, 'balance', v_new_balance, 'added', v_pack.size);
END;
$$;

REVOKE ALL ON FUNCTION bump_purchase_ticket_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bump_purchase_ticket_atomic TO authenticated, service_role;

-- ─── 4. evaluatePending atomic confirm — 한 row 만 단일 호출로 confirm
-- (cron 중복 실행 시 RETURNING row count 로 한 번만 처리됨)
CREATE OR REPLACE FUNCTION points_confirm_one(p_tx_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx record;
BEGIN
  -- atomic transition pending → confirmed (이미 confirmed/reverted 면 NULL)
  UPDATE point_transactions
     SET status = 'confirmed', confirmed_at = NOW()
   WHERE id = p_tx_id
     AND status = 'pending'
  RETURNING user_id, plaza_id, type, amount INTO v_tx;

  IF v_tx IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'already_processed');
  END IF;

  -- 잔액 반영 (earn 만 — spend 는 즉시 confirmed 라 여기 안 옴)
  IF v_tx.type = 'earn' THEN
    UPDATE user_points
       SET available = available + v_tx.amount,
           pending = GREATEST(0, pending - v_tx.amount),
           lifetime_earned = lifetime_earned + v_tx.amount
     WHERE user_id = v_tx.user_id AND plaza_id = v_tx.plaza_id;
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION points_confirm_one FROM PUBLIC;
GRANT EXECUTE ON FUNCTION points_confirm_one TO authenticated, service_role;

-- ─── 5. revert atomic — 신고/삭제 시 같은 source 의 거래 회수
CREATE OR REPLACE FUNCTION points_revert_one(p_tx_id UUID, p_reason TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx record;
BEGIN
  UPDATE point_transactions
     SET status = 'reverted', reverted_at = NOW(), reverted_reason = p_reason
   WHERE id = p_tx_id
     AND status IN ('pending', 'confirmed')
  RETURNING user_id, plaza_id, type, amount, status AS prev_status INTO v_tx;

  IF v_tx IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'already_processed');
  END IF;

  -- earn 인 경우만 잔액 회수
  IF v_tx.type = 'earn' THEN
    -- pending 이었으면 pending 에서 -, confirmed 였으면 available 에서 -
    UPDATE user_points
       SET available = GREATEST(0, available - v_tx.amount),
           lifetime_reverted = lifetime_reverted + v_tx.amount,
           reputation_score = GREATEST(0, reputation_score - 10)
     WHERE user_id = v_tx.user_id AND plaza_id = v_tx.plaza_id;
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION points_revert_one FROM PUBLIC;
GRANT EXECUTE ON FUNCTION points_revert_one TO authenticated, service_role;
