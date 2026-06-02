--
-- PostgreSQL database dump
--

\restrict NSeIVCkDGtxKEoc8UVUl9MGiecfJuA4P5P0GQqhKVlof0khFZI4q357Cy339Qx0

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA "public";


--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: _create_index_if_cols("text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_create_index_if_cols"("p_index_name" "text", "p_table_name" "text", "p_cols" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  col_list TEXT[];
  col      TEXT;
  col_name TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table_name
  ) THEN
    RAISE NOTICE 'Skip index % — table % not found', p_index_name, p_table_name;
    RETURN;
  END IF;

  col_list := string_to_array(p_cols, ',');
  FOREACH col IN ARRAY col_list LOOP
    col_name := split_part(btrim(col), ' ', 1);
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = p_table_name
        AND column_name = col_name
    ) THEN
      RAISE NOTICE 'Skip index % — column %.% not found',
        p_index_name, p_table_name, col_name;
      RETURN;
    END IF;
  END LOOP;

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (%s)',
                 p_index_name, p_table_name, p_cols);
END;
$$;


--
-- Name: add_club_owner_as_member(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."add_club_owner_as_member"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO club_members (club_id, user_id) VALUES (NEW.id, NEW.user_id) ON CONFLICT DO NOTHING;
  UPDATE clubs SET current_members = GREATEST(current_members, 1) WHERE id = NEW.id;
  RETURN NEW;
END;
$$;


--
-- Name: add_gb_owner_as_participant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."add_gb_owner_as_participant"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO group_buying_participants (post_id, user_id, quantity, receive_method, payment_status)
    VALUES (NEW.id, NEW.user_id, 0, 'pickup', 'confirmed')  -- 주최자는 수량 0, 즉시 확정
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: admin_adjust_points("uuid", integer, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."admin_adjust_points"("p_user_id" "uuid", "p_amount" integer, "p_reason" "text" DEFAULT '관리자 수동 조정'::"text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_new_balance INT;
BEGIN
  INSERT INTO user_points (user_id, available, pending, lifetime_earned, lifetime_spent, lifetime_reverted)
  VALUES (p_user_id, GREATEST(0, p_amount), 0, GREATEST(0, p_amount), 0, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET available = GREATEST(0, user_points.available + p_amount),
      lifetime_earned = CASE WHEN p_amount > 0 THEN user_points.lifetime_earned + p_amount ELSE user_points.lifetime_earned END,
      lifetime_reverted = CASE WHEN p_amount < 0 THEN user_points.lifetime_reverted + ABS(p_amount) ELSE user_points.lifetime_reverted END
  RETURNING available INTO v_new_balance;

  RETURN v_new_balance;
END;
$$;


--
-- Name: admin_adjust_points("uuid", "text", bigint, "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."admin_adjust_points"("p_user_id" "uuid", "p_plaza_id" "text", "p_delta" bigint, "p_admin_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_new BIGINT;
BEGIN
  INSERT INTO user_points (user_id, plaza_id, available, pending, lifetime_earned, lifetime_spent, lifetime_reverted)
  VALUES (p_user_id, p_plaza_id, 0, 0, 0, 0, 0)
  ON CONFLICT (user_id, plaza_id) DO NOTHING;

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
$$;


--
-- Name: apply_approved_account_type(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."apply_approved_account_type"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status = 'approved' AND COALESCE(OLD.status, '') <> 'approved' THEN
    UPDATE profiles SET account_type = NEW.requested_type WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: apply_high_volume_flags(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."apply_high_volume_flags"("threshold" integer DEFAULT 20, "days_back" integer DEFAULT 30) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  inserted_count INTEGER := 0;
  rec RECORD;
BEGIN
  FOR rec IN SELECT * FROM detect_high_volume_users(threshold, days_back) LOOP
    -- 이미 자진 신고된 사업자면 스킵
    IF EXISTS (
      SELECT 1 FROM business_declarations
      WHERE user_id = rec.user_id AND status = 'verified'
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO user_flags (user_id, flag_type, severity, metadata)
    VALUES (
      rec.user_id,
      'high_volume_posts',
      CASE
        WHEN rec.post_count >= threshold * 3 THEN 'high'
        WHEN rec.post_count >= threshold * 2 THEN 'medium'
        ELSE 'low'
      END,
      jsonb_build_object(
        'post_count', rec.post_count,
        'days_back', days_back,
        'threshold', threshold,
        'detected_at', NOW()
      )
    )
    ON CONFLICT (user_id, flag_type) WHERE status = 'open' DO UPDATE
      SET metadata = EXCLUDED.metadata,
          severity = EXCLUDED.severity,
          updated_at = NOW();

    inserted_count := inserted_count + 1;
  END LOOP;
  RETURN inserted_count;
END;
$$;


--
-- Name: FUNCTION "apply_high_volume_flags"("threshold" integer, "days_back" integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."apply_high_volume_flags"("threshold" integer, "days_back" integer) IS '대량 등록 의심 사용자 일괄 플래그 처리. cron 에서 매일 호출.';


--
-- Name: auto_complete_orders(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."auto_complete_orders"() RETURNS TABLE("domain" "text", "order_id" "uuid", "reason" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  r RECORD;
BEGIN
  -- local_food_orders
  FOR r IN
    UPDATE public.local_food_orders
    SET status = 'completed',
        completed_at = v_now
    WHERE status = 'shipped'
      AND (
        (received_at IS NOT NULL AND received_at + INTERVAL '7 days' < v_now)
        OR
        (received_at IS NULL AND shipped_at IS NOT NULL AND shipped_at + INTERVAL '14 days' < v_now)
      )
    RETURNING id, CASE WHEN received_at IS NOT NULL THEN '수령 후 7일' ELSE '발송 후 14일' END AS reason
  LOOP
    domain := 'local_food';
    order_id := r.id;
    reason := r.reason;
    RETURN NEXT;
  END LOOP;

  -- group_buying_orders (orders 테이블 사용 경로)
  FOR r IN
    UPDATE public.group_buying_orders
    SET status = 'completed',
        completed_at = v_now
    WHERE status = 'shipped'
      AND (
        (received_at IS NOT NULL AND received_at + INTERVAL '7 days' < v_now)
        OR
        (received_at IS NULL AND shipped_at IS NOT NULL AND shipped_at + INTERVAL '14 days' < v_now)
      )
    RETURNING id, CASE WHEN received_at IS NOT NULL THEN '수령 후 7일' ELSE '발송 후 14일' END AS reason
  LOOP
    domain := 'group_buying';
    order_id := r.id;
    reason := r.reason;
    RETURN NEXT;
  END LOOP;

  -- group_buying_participants (참가자 테이블 경로 — profile API 가 이걸 갱신함)
  FOR r IN
    UPDATE public.group_buying_participants
    SET payment_status = 'completed',
        completed_at = v_now
    WHERE payment_status = 'shipped'
      AND (
        (received_at IS NOT NULL AND received_at + INTERVAL '7 days' < v_now)
        OR
        (received_at IS NULL AND shipped_at IS NOT NULL AND shipped_at + INTERVAL '14 days' < v_now)
      )
    RETURNING id, CASE WHEN received_at IS NOT NULL THEN '수령 후 7일' ELSE '발송 후 14일' END AS reason
  LOOP
    domain := 'group_buying_participant';
    order_id := r.id;
    reason := r.reason;
    RETURN NEXT;
  END LOOP;
END;
$$;


--
-- Name: billing_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."billing_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: board_posts_enforce_region(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."board_posts_enforce_region"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_sub_region TEXT;
  v_role TEXT;
BEGIN
  -- region 이 NULL 이면 통과 (지역 무관 글)
  IF NEW.region IS NULL THEN
    RETURN NEW;
  END IF;

  -- 작성자 정보 조회
  SELECT sub_region, role INTO v_sub_region, v_role
    FROM profiles WHERE id = NEW.user_id;

  -- admin/superadmin 은 임의 region 지정 가능 (광장 공지/이벤트 등)
  IF v_role IN ('admin', 'superadmin') THEN
    RETURN NEW;
  END IF;

  -- 일반 사용자는 자기 sub_region 만 허용
  IF v_sub_region IS NULL OR v_sub_region <> NEW.region THEN
    RAISE EXCEPTION 'region 은 본인 지역(%)으로만 설정 가능 (시도값: %)', v_sub_region, NEW.region
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: board_stats_aggregate("text", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."board_stats_aggregate"("p_plaza_id" "text" DEFAULT NULL::"text", "p_region" "text" DEFAULT NULL::"text", "p_days" integer DEFAULT 30) RETURNS TABLE("user_id" "uuid", "posts" integer, "comments" integer, "likes_received" integer, "nickname" "text", "avatar_url" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


--
-- Name: bump_atomic("uuid", "text", "text", "uuid", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."bump_atomic"("p_user_id" "uuid", "p_plaza_id" "text", "p_target_type" "text", "p_target_id" "uuid", "p_payment" "text", "p_points_cost" integer DEFAULT 0) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;


--
-- Name: bump_inc_daily("uuid", "text", "text", "date", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."bump_inc_daily"("p_user_id" "uuid", "p_plaza_id" "text", "p_target_type" "text", "p_date" "date", "p_col" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


--
-- Name: bump_purchase_ticket_atomic("uuid", "text", "text", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."bump_purchase_ticket_atomic"("p_user_id" "uuid", "p_plaza_id" "text", "p_pack_id" "text", "p_payment" "text", "p_payment_id" "uuid" DEFAULT NULL::"uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


--
-- Name: change_like_count("text", "uuid", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."change_like_count"("p_table" "text", "p_id" "uuid", "p_column" "text" DEFAULT 'like_count'::"text", "p_delta" integer DEFAULT 1) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  -- 화이트리스트 — 임의 테이블 변조 방지
  allowed_tables TEXT[] := ARRAY[
    'properties',
    'board_posts',
    'secondhand_posts',
    'jobs_posts',
    'sharing_posts',
    'group_buying_posts',
    'clubs',
    'local_food',
    'new_store_posts',
    'interior_posts',
    'moving_posts',
    'cleaning_posts',
    'repair_posts'
  ];
  allowed_columns TEXT[] := ARRAY['likes', 'like_count'];
BEGIN
  IF NOT (p_table = ANY(allowed_tables)) THEN
    RAISE EXCEPTION 'Table % not allowed', p_table;
  END IF;
  IF NOT (p_column = ANY(allowed_columns)) THEN
    RAISE EXCEPTION 'Column % not allowed', p_column;
  END IF;
  -- delta 는 ±1 ~ ±10 정도까지만 허용 (남용 방지)
  IF p_delta < -10 OR p_delta > 10 THEN
    RAISE EXCEPTION 'Delta out of range';
  END IF;

  EXECUTE format(
    'UPDATE %I SET %I = GREATEST(COALESCE(%I, 0) + $1, 0) WHERE id = $2',
    p_table, p_column, p_column
  ) USING p_delta, p_id;
END;
$_$;


--
-- Name: chat_unread_counts("uuid"[], "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."chat_unread_counts"("p_room_ids" "uuid"[], "p_user_id" "uuid") RETURNS TABLE("chat_room_id" "uuid", "cnt" bigint)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT m.chat_room_id, COUNT(*) AS cnt
  FROM messages m
  WHERE m.chat_room_id = ANY(p_room_ids)
    AND m.is_read = false
    AND m.sender_id != p_user_id
  GROUP BY m.chat_room_id;
$$;


--
-- Name: club_join_atomic("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."club_join_atomic"("p_club_id" "uuid", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_max INTEGER;
  v_current INTEGER;
  v_status TEXT;
  v_owner UUID;
  v_already BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('club_join_' || p_club_id::text));

  SELECT max_members, current_members, status, user_id
    INTO v_max, v_current, v_status, v_owner
    FROM clubs WHERE id = p_club_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', '존재하지 않는 모임');
  END IF;
  IF v_owner = p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', '본인 모임에는 참여할 수 없습니다');
  END IF;
  IF v_status NOT IN ('recruiting', 'full') THEN
    RETURN jsonb_build_object('ok', false, 'error', '참여 가능한 상태가 아닙니다');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM club_members
    WHERE club_id = p_club_id AND user_id = p_user_id
  ) INTO v_already;
  IF v_already THEN
    RETURN jsonb_build_object('ok', false, 'error', '이미 참여중입니다');
  END IF;

  IF v_current >= v_max THEN
    RETURN jsonb_build_object('ok', false, 'error', '정원이 가득 찼습니다');
  END IF;

  INSERT INTO club_members (club_id, user_id, joined_at)
  VALUES (p_club_id, p_user_id, NOW())
  ON CONFLICT (club_id, user_id) DO NOTHING;

  UPDATE clubs
    SET current_members = current_members + 1,
        status = CASE WHEN current_members + 1 >= max_members THEN 'full' ELSE 'recruiting' END
    WHERE id = p_club_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: count_user_posts_today("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."count_user_posts_today"("p_user_id" "uuid", "p_table" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_table = 'secondhand_posts' THEN
    SELECT COUNT(*)::INT INTO v_count
      FROM public.secondhand_posts
      WHERE user_id = p_user_id
        AND created_at >= (NOW() - INTERVAL '24 hours');
  ELSIF p_table = 'jobs_posts' THEN
    SELECT COUNT(*)::INT INTO v_count
      FROM public.jobs_posts
      WHERE user_id = p_user_id
        AND created_at >= (NOW() - INTERVAL '24 hours');
  ELSE
    v_count := 0;
  END IF;
  RETURN v_count;
END;
$$;


--
-- Name: current_plaza(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."current_plaza"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT current_setting('app.current_plaza', true);
$$;


--
-- Name: decrement_point_daily_counter("uuid", "text", "date"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."decrement_point_daily_counter"("p_user_id" "uuid", "p_rule_id" "text", "p_date" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE point_daily_counters
  SET count = GREATEST(0, count - 1)
  WHERE user_id = p_user_id
    AND rule_id = p_rule_id
    AND date = p_date;
END;
$$;


--
-- Name: decrement_reputation("uuid", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."decrement_reputation"("p_user_id" "uuid", "p_amount" integer DEFAULT 10) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE user_points
  SET reputation_score = GREATEST(0, reputation_score - p_amount)
  WHERE user_id = p_user_id;
END;
$$;


--
-- Name: deduct_video_credits("uuid", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."deduct_video_credits"("p_user_id" "uuid", "p_points" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  current_balance INT;
  new_balance INT;
BEGIN
  IF p_points <= 0 THEN
    RAISE EXCEPTION 'INVALID_POINTS: % must be > 0', p_points;
  END IF;

  SELECT COALESCE(video_credits, 0) INTO current_balance
    FROM profiles WHERE id = p_user_id FOR UPDATE;

  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: %', p_user_id;
  END IF;

  IF current_balance < p_points THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS: need % have %', p_points, current_balance;
  END IF;

  UPDATE profiles SET video_credits = current_balance - p_points
    WHERE id = p_user_id
    RETURNING video_credits INTO new_balance;

  RETURN new_balance;
END;
$$;


--
-- Name: detect_high_volume_users(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."detect_high_volume_users"("threshold" integer DEFAULT 20, "days_back" integer DEFAULT 30) RETURNS TABLE("user_id" "uuid", "post_count" bigint)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT s.user_id, COUNT(*)::BIGINT AS post_count
  FROM secondhand_posts s
  WHERE s.created_at >= NOW() - (days_back || ' days')::INTERVAL
    AND s.user_id IS NOT NULL
  GROUP BY s.user_id
  HAVING COUNT(*) >= threshold;
END;
$$;


--
-- Name: FUNCTION "detect_high_volume_users"("threshold" integer, "days_back" integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."detect_high_volume_users"("threshold" integer, "days_back" integer) IS '중고거래 30일 내 다수 등록자 탐지 — 업자 의심 1차 플래그.';


--
-- Name: favorites_no_self(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."favorites_no_self"() RETURNS "trigger"
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_owner UUID;
BEGIN
  SELECT user_id INTO v_owner FROM properties WHERE id = NEW.property_id;
  IF v_owner = NEW.user_id THEN
    RAISE EXCEPTION '본인 매물에는 찜할 수 없습니다' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: gb_join_atomic("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."gb_join_atomic"("p_post_id" "uuid", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_max INTEGER;
  v_current INTEGER;
  v_status TEXT;
  v_owner UUID;
  v_already BOOLEAN;
BEGIN
  -- post-id 단위 advisory lock (동시 join 직렬화)
  PERFORM pg_advisory_xact_lock(hashtext('gb_join_' || p_post_id::text));

  SELECT max_participants, current_participants, status, user_id
    INTO v_max, v_current, v_status, v_owner
    FROM group_buying_posts WHERE id = p_post_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', '존재하지 않는 공구');
  END IF;
  IF v_owner = p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', '본인 공구에는 참여할 수 없습니다');
  END IF;
  IF v_status <> 'recruiting' THEN
    RETURN jsonb_build_object('ok', false, 'error', '모집중인 공구가 아닙니다');
  END IF;

  -- 중복 참여 체크
  SELECT EXISTS (
    SELECT 1 FROM group_buying_participants
    WHERE post_id = p_post_id AND user_id = p_user_id
  ) INTO v_already;
  IF v_already THEN
    RETURN jsonb_build_object('ok', false, 'error', '이미 참여중입니다');
  END IF;

  IF v_current >= v_max THEN
    RETURN jsonb_build_object('ok', false, 'error', '정원이 가득 찼습니다');
  END IF;

  INSERT INTO group_buying_participants (post_id, user_id, joined_at)
  VALUES (p_post_id, p_user_id, NOW());

  UPDATE group_buying_posts
    SET current_participants = current_participants + 1,
        status = CASE WHEN current_participants + 1 >= max_participants THEN 'full' ELSE 'recruiting' END
    WHERE id = p_post_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: gb_join_atomic_v2("uuid", "uuid", integer, "text", "text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."gb_join_atomic_v2"("p_post_id" "uuid", "p_user_id" "uuid", "p_quantity" integer, "p_receive_method" "text", "p_recipient_name" "text", "p_recipient_phone" "text", "p_recipient_address" "text", "p_recipient_address_detail" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_owner UUID;
  v_max INTEGER;
  v_status TEXT;
  v_deadline TIMESTAMPTZ;
  v_already BOOLEAN;
  v_total_qty INTEGER;
  v_new_total INTEGER;
  v_next_status TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('gb_join2_' || p_post_id::text));

  SELECT user_id, max_participants, status, deadline
    INTO v_owner, v_max, v_status, v_deadline
    FROM group_buying_posts
   WHERE id = p_post_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', '글을 찾을 수 없습니다');
  END IF;
  IF v_owner = p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', '본인 글에는 참여할 수 없습니다');
  END IF;
  IF v_status <> 'recruiting' THEN
    RETURN jsonb_build_object('ok', false, 'error', '모집이 종료되었습니다');
  END IF;
  IF v_deadline IS NOT NULL AND v_deadline < NOW() THEN
    RETURN jsonb_build_object('ok', false, 'error', '모집 마감일이 지났습니다');
  END IF;

  -- 중복 참여 차단
  SELECT EXISTS (
    SELECT 1 FROM group_buying_participants
     WHERE post_id = p_post_id AND user_id = p_user_id
  ) INTO v_already;
  IF v_already THEN
    RETURN jsonb_build_object('ok', false, 'error', '이미 참여중입니다');
  END IF;

  -- 주최자 제외 quantity 합산
  SELECT COALESCE(SUM(quantity), 0)
    INTO v_total_qty
    FROM group_buying_participants
   WHERE post_id = p_post_id AND user_id <> v_owner;

  v_new_total := v_total_qty + p_quantity;

  IF v_max IS NOT NULL AND v_new_total > v_max THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', '잔여 수량을 초과했습니다',
      'remaining', GREATEST(0, v_max - v_total_qty)
    );
  END IF;

  INSERT INTO group_buying_participants (
    post_id, user_id, quantity, receive_method,
    recipient_name, recipient_phone, recipient_address, recipient_address_detail,
    payment_status, joined_at
  ) VALUES (
    p_post_id, p_user_id, p_quantity, p_receive_method,
    p_recipient_name, p_recipient_phone, p_recipient_address, p_recipient_address_detail,
    'reserved', NOW()
  );

  v_next_status := CASE
    WHEN v_max IS NOT NULL AND v_new_total >= v_max THEN 'pending_payment'
    ELSE v_status
  END;

  UPDATE group_buying_posts
     SET current_participants = v_new_total,
         status = v_next_status
   WHERE id = p_post_id;

  RETURN jsonb_build_object(
    'ok', true,
    'current_participants', v_new_total,
    'status', v_next_status,
    'now_full', v_next_status = 'pending_payment'
  );
END;
$$;


--
-- Name: get_email_by_username("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_email_by_username"("input_username" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  user_email TEXT;
BEGIN
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = (SELECT id FROM profiles WHERE username = input_username LIMIT 1);
  
  RETURN user_email;
END;
$$;


--
-- Name: get_property_favorite_counts("text", "uuid"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_property_favorite_counts"("p_plaza_id" "text", "p_property_ids" "uuid"[]) RETURNS TABLE("property_id" "uuid", "favorite_count" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT f.property_id, COUNT(*)::BIGINT AS favorite_count
  FROM favorites f
  WHERE f.property_id = ANY(p_property_ids)
    AND (p_plaza_id IS NULL OR f.plaza_id = p_plaza_id)
  GROUP BY f.property_id;
$$;


--
-- Name: FUNCTION "get_property_favorite_counts"("p_plaza_id" "text", "p_property_ids" "uuid"[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."get_property_favorite_counts"("p_plaza_id" "text", "p_property_ids" "uuid"[]) IS '주어진 매물 ID 배열에 대한 찜 카운트만 GROUP BY. 풀 스캔 회피.';


--
-- Name: grant_points_atomic("uuid", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."grant_points_atomic"("p_user" "uuid", "p_plaza" "text", "p_amount" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


--
-- Name: FUNCTION "grant_points_atomic"("p_user" "uuid", "p_plaza" "text", "p_amount" integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."grant_points_atomic"("p_user" "uuid", "p_plaza" "text", "p_amount" integer) IS '포인트 잔액 원자적 증가. point_transactions INSERT 직후 호출. service_role 전용.';


--
-- Name: grant_super_admins_to_new_plaza(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."grant_super_admins_to_new_plaza"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- super admin 들에게 새 광장 권한 부여
  INSERT INTO plaza_admins (user_id, plaza_id, role)
  SELECT DISTINCT user_id, NEW.id, 'super'
  FROM plaza_admins
  WHERE role = 'super'
  ON CONFLICT (user_id, plaza_id) DO NOTHING;

  -- super admin 들 plaza_profiles 도 자동 가입 처리
  INSERT INTO plaza_profiles (user_id, plaza_id, nickname, is_active)
  SELECT DISTINCT pa.user_id, NEW.id, COALESCE(p.nickname, '슈퍼관리자'), true
  FROM plaza_admins pa
  LEFT JOIN profiles p ON p.id = pa.user_id
  WHERE pa.role = 'super'
  ON CONFLICT (user_id, plaza_id) DO NOTHING;

  RETURN NEW;
END $$;


--
-- Name: grant_video_credits("uuid", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."grant_video_credits"("p_user_id" "uuid", "p_points" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  new_balance INT;
BEGIN
  IF p_points <= 0 THEN
    RAISE EXCEPTION 'INVALID_POINTS: % must be > 0', p_points;
  END IF;

  UPDATE profiles
     SET video_credits = COALESCE(video_credits, 0) + p_points
   WHERE id = p_user_id
   RETURNING video_credits INTO new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: %', p_user_id;
  END IF;

  RETURN new_balance;
END;
$$;


--
-- Name: group_buying_auto_process(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."group_buying_auto_process"() RETURNS TABLE("processed_post_id" "uuid", "action" "text", "paid_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  r RECORD;
  v_paid_count INT;
BEGIN
  -- 마감일 지났고 아직 처리 안 된 모집중 글
  FOR r IN
    SELECT id, min_participants, deadline
    FROM group_buying_posts
    WHERE status = 'recruiting'
      AND deadline IS NOT NULL
      AND deadline < NOW()
      AND auto_processed_at IS NULL
      AND payment_required = TRUE
  LOOP
    SELECT COUNT(*) INTO v_paid_count
    FROM group_buying_orders
    WHERE post_id = r.id AND status = 'paid';

    IF v_paid_count >= COALESCE(r.min_participants, 1) THEN
      -- 성사
      UPDATE group_buying_posts
        SET status = 'confirmed',
            auto_processed_at = NOW()
        WHERE id = r.id;
      UPDATE group_buying_orders
        SET status = 'group_confirmed',
            group_confirmed_at = NOW()
        WHERE post_id = r.id AND status = 'paid';
      RETURN QUERY SELECT r.id, 'confirmed'::TEXT, v_paid_count;
    ELSE
      -- 미달 → 환불
      UPDATE group_buying_posts
        SET status = 'cancelled',
            auto_processed_at = NOW()
        WHERE id = r.id;
      UPDATE group_buying_orders
        SET status = 'refunded',
            refunded_at = NOW(),
            refund_reason = '모집 인원 미달로 자동 환불'
        WHERE post_id = r.id AND status = 'paid';
      RETURN QUERY SELECT r.id, 'cancelled'::TEXT, v_paid_count;
    END IF;
  END LOOP;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, nickname, location)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nickname', '사용자'),
    coalesce(new.raw_user_meta_data ->> 'location', null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


--
-- Name: increment_point_daily_counter("uuid", "text", "date"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."increment_point_daily_counter"("p_user_id" "uuid", "p_rule_id" "text", "p_date" "date" DEFAULT CURRENT_DATE) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


--
-- Name: FUNCTION "increment_point_daily_counter"("p_user_id" "uuid", "p_rule_id" "text", "p_date" "date"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."increment_point_daily_counter"("p_user_id" "uuid", "p_rule_id" "text", "p_date" "date") IS '일일 한도 카운터 원자적 +1 (race-safe). 반환: 증가 후 count.';


--
-- Name: increment_user_points("uuid", bigint, bigint, bigint, bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."increment_user_points"("p_user_id" "uuid", "p_available_delta" bigint DEFAULT 0, "p_pending_delta" bigint DEFAULT 0, "p_lifetime_earned_delta" bigint DEFAULT 0, "p_lifetime_spent_delta" bigint DEFAULT 0, "p_lifetime_reverted_delta" bigint DEFAULT 0) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


--
-- Name: increment_view_count("text", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."increment_view_count"("p_table" "text", "p_id" "uuid", "p_column" "text" DEFAULT 'views'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  -- 화이트리스트 — 임의 테이블 변조 방지
  allowed_tables TEXT[] := ARRAY[
    'properties',
    'board_posts',
    'secondhand_posts',
    'jobs_posts',
    'sharing_posts',
    'group_buying_posts',
    'clubs',
    'local_food',
    'new_store_posts',
    'interior_posts',
    'moving_posts',
    'cleaning_posts',
    'repair_posts'
  ];
  allowed_columns TEXT[] := ARRAY['views', 'view_count'];
BEGIN
  IF NOT (p_table = ANY(allowed_tables)) THEN
    RAISE EXCEPTION 'Table % not allowed', p_table;
  END IF;
  IF NOT (p_column = ANY(allowed_columns)) THEN
    RAISE EXCEPTION 'Column % not allowed', p_column;
  END IF;

  EXECUTE format(
    'UPDATE %I SET %I = COALESCE(%I, 0) + 1 WHERE id = $1',
    p_table, p_column, p_column
  ) USING p_id;
END;
$_$;


--
-- Name: is_admin_for_plaza("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."is_admin_for_plaza"("p_plaza_id" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  uid UUID := auth.uid();
  v_role TEXT;
BEGIN
  IF uid IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 글로벌 슈퍼 — profiles.role='superadmin' 만 (plaza 무관)
  SELECT role INTO v_role FROM profiles WHERE id = uid LIMIT 1;
  IF v_role = 'superadmin' THEN
    RETURN TRUE;
  END IF;

  -- legacy admin (광장 무관) — 해당 광장 글에만 통과
  IF v_role = 'admin' AND p_plaza_id IS NOT NULL THEN
    RETURN TRUE;
  END IF;

  -- plaza_admins — role 무관(super/admin), 해당 광장에 한해서만 통과
  -- (이전: role='super' 면 광장 무관 통과 → 권한 격상 위험)
  IF p_plaza_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM plaza_admins
    WHERE user_id = uid AND plaza_id = p_plaza_id
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;


--
-- Name: is_app_admin("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."is_app_admin"("p_uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.plaza_admins
    WHERE user_id = p_uid AND role IN ('admin', 'super')
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_uid AND role IN ('admin', 'superadmin')
  );
$$;


--
-- Name: is_plaza_admin("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."is_plaza_admin"("plaza" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM plaza_admins
    WHERE user_id = auth.uid()
      AND (role = 'super' OR plaza_id = plaza)
  );
$$;


--
-- Name: is_plaza_admin("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."is_plaza_admin"("p_uid" "uuid", "p_plaza" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.plaza_admins
    WHERE user_id = p_uid
      AND plaza_id = p_plaza
      AND role IN ('admin', 'moderator', 'super')
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_uid AND role = 'superadmin'
  );
$$;


--
-- Name: is_plaza_admin_for("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."is_plaza_admin_for"("check_plaza_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    -- legacy super admin
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'superadmin'
  ) OR EXISTS (
    -- 신규 plaza_admins (super = god mode, 그 외 = 자기 광장만)
    SELECT 1 FROM plaza_admins pa
    WHERE pa.user_id = auth.uid()
      AND (pa.role = 'super' OR pa.plaza_id = check_plaza_id)
  );
$$;


--
-- Name: is_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM plaza_admins
    WHERE user_id = auth.uid() AND role = 'super'
  );
$$;


--
-- Name: is_super_plaza_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."is_super_plaza_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'superadmin'
  ) OR EXISTS (
    SELECT 1 FROM plaza_admins pa
    WHERE pa.user_id = auth.uid()
      AND pa.role = 'super'
  );
$$;


--
-- Name: is_user_banned("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."is_user_banned"("p_uid" "uuid", "p_plaza" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_bans
    WHERE user_id = p_uid
      AND plaza_id = p_plaza
      AND lifted_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())
  );
$$;


--
-- Name: log_search_query("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."log_search_query"("p_term" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_term text;
BEGIN
  v_term := lower(trim(COALESCE(p_term, '')));
  IF v_term IS NULL OR length(v_term) < 2 OR length(v_term) > 50 THEN
    RETURN;
  END IF;

  -- 블랙리스트에 있으면 저장하지 않음
  IF EXISTS (SELECT 1 FROM search_term_blacklist WHERE term = v_term) THEN
    RETURN;
  END IF;

  INSERT INTO search_queries (term, count, last_searched_at)
    VALUES (v_term, 1, now())
    ON CONFLICT (term)
    DO UPDATE SET
      count = search_queries.count + 1,
      last_searched_at = now();
END;
$$;


--
-- Name: FUNCTION "log_search_query"("p_term" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."log_search_query"("p_term" "text") IS '검색 수행 시 upsert 호출. 짧/긴 키워드 필터 + 정규화.';


--
-- Name: points_confirm_one("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."points_confirm_one"("p_tx_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_tx RECORD;
BEGIN
  SELECT * INTO v_tx FROM point_transactions WHERE id = p_tx_id AND status = 'pending' AND type = 'earn';
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE point_transactions
  SET status = 'confirmed', confirmed_at = now()
  WHERE id = p_tx_id;

  UPDATE user_points
  SET available = available + v_tx.amount,
      pending = GREATEST(0, pending - v_tx.amount),
      lifetime_earned = lifetime_earned + v_tx.amount
  WHERE user_id = v_tx.user_id;
END;
$$;


--
-- Name: points_refund_spend("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."points_refund_spend"("p_tx_id" "uuid", "p_reason" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tx record;
  v_amount INTEGER;
BEGIN
  UPDATE point_transactions
     SET status = 'reverted',
         reverted_at = NOW(),
         reverted_reason = p_reason
   WHERE id = p_tx_id
     AND status IN ('pending', 'confirmed')
     AND type = 'spend'
  RETURNING user_id, plaza_id, amount INTO v_tx;

  IF v_tx IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'already_processed_or_not_spend');
  END IF;

  -- spend tx 의 amount 는 양수로 저장돼있다고 가정 (points_spend_atomic 컨벤션)
  -- 음수 저장 케이스도 방어
  v_amount := ABS(v_tx.amount);

  UPDATE user_points
     SET available = available + v_amount
   WHERE user_id = v_tx.user_id AND plaza_id = v_tx.plaza_id;

  RETURN json_build_object('ok', true, 'refunded', v_amount);
END;
$$;


--
-- Name: points_revert_one("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."points_revert_one"("p_tx_id" "uuid", "p_reason" "text" DEFAULT 'admin'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_tx RECORD;
BEGIN
  SELECT * INTO v_tx FROM point_transactions WHERE id = p_tx_id AND status IN ('pending','confirmed') AND type = 'earn';
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE point_transactions
  SET status = 'reverted', reverted_at = now(), reverted_reason = p_reason
  WHERE id = p_tx_id;

  IF v_tx.status = 'confirmed' THEN
    UPDATE user_points
    SET available = GREATEST(0, available - v_tx.amount),
        lifetime_reverted = lifetime_reverted + v_tx.amount
    WHERE user_id = v_tx.user_id;
  ELSE
    UPDATE user_points
    SET pending = GREATEST(0, pending - v_tx.amount)
    WHERE user_id = v_tx.user_id;
  END IF;
END;
$$;


--
-- Name: points_spend_atomic("uuid", "text", "text", integer, integer, "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."points_spend_atomic"("p_user_id" "uuid", "p_plaza_id" "text" DEFAULT NULL::"text", "p_category" "text" DEFAULT NULL::"text", "p_amount" integer DEFAULT 0, "p_payment_total" integer DEFAULT NULL::integer, "p_source_id" "uuid" DEFAULT NULL::"uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

  -- atomic balance 검증 + 차감 (PK 가 user_id 로 변경됨)
  UPDATE user_points
     SET available = available - p_amount,
         lifetime_spent = lifetime_spent + p_amount
   WHERE user_id = p_user_id
     AND available >= p_amount
     AND is_suspended = FALSE
  RETURNING 1 INTO v_updated;

  IF v_updated IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'insufficient_balance_or_suspended');
  END IF;

  -- 거래 기록 (plaza_id 는 NULL)
  INSERT INTO point_transactions (
    user_id, plaza_id, type, amount, source, source_id, status, confirmed_at, metadata
  ) VALUES (
    p_user_id, NULL, 'spend', p_amount,
    p_category || '.purchase', p_source_id, 'confirmed', NOW(),
    jsonb_build_object('category', p_category, 'payment_total', p_payment_total)
  )
  RETURNING id INTO v_tx_id;

  RETURN json_build_object('ok', true, 'tx_id', v_tx_id);
END;
$$;


--
-- Name: property_requests_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."property_requests_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: service_requests_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."service_requests_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: set_account_type_requests_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_account_type_requests_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: set_current_plaza("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_current_plaza"("plaza" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM set_config('app.current_plaza', plaza, true);
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: suggest_search_terms("text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."suggest_search_terms"("p_term" "text", "p_limit" integer DEFAULT 3) RETURNS TABLE("term" "text", "similarity" real, "count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT
    sq.term,
    similarity(sq.term, lower(trim(p_term)))::real AS similarity,
    sq.count
  FROM search_queries sq
  WHERE
    length(lower(trim(p_term))) >= 2
    AND sq.term <> lower(trim(p_term))
    AND similarity(sq.term, lower(trim(p_term))) >= 0.35
    AND NOT EXISTS (
      SELECT 1 FROM search_term_blacklist b WHERE b.term = sq.term
    )
  ORDER BY similarity DESC, sq.count DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 3), 10));
$$;


--
-- Name: FUNCTION "suggest_search_terms"("p_term" "text", "p_limit" integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."suggest_search_terms"("p_term" "text", "p_limit" integer) IS 'pg_trgm similarity 기반 검색어 제안 (오타 교정용)';


--
-- Name: touch_ai_video_jobs_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."touch_ai_video_jobs_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: touch_user_push_tokens_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."touch_user_push_tokens_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: trg_local_food_orders_freeze_critical(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_local_food_orders_freeze_critical"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- service_role 은 무제한 (라우트의 admin client)
  v_role := COALESCE(
    current_setting('request.jwt.claims', true)::jsonb->>'role',
    ''
  );
  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- 결제·정산 핵심 컬럼은 OLD 와 동일해야 함
  IF NEW.buyer_id IS DISTINCT FROM OLD.buyer_id THEN
    RAISE EXCEPTION 'buyer_id is immutable';
  END IF;
  IF NEW.seller_id IS DISTINCT FROM OLD.seller_id THEN
    RAISE EXCEPTION 'seller_id is immutable';
  END IF;
  IF NEW.plaza_id IS DISTINCT FROM OLD.plaza_id THEN
    RAISE EXCEPTION 'plaza_id is immutable';
  END IF;
  IF NEW.amount IS DISTINCT FROM OLD.amount THEN
    RAISE EXCEPTION 'amount is immutable';
  END IF;
  IF NEW.fee_amount IS DISTINCT FROM OLD.fee_amount THEN
    RAISE EXCEPTION 'fee_amount is immutable';
  END IF;
  IF NEW.pg_provider IS DISTINCT FROM OLD.pg_provider THEN
    RAISE EXCEPTION 'pg_provider is immutable';
  END IF;
  IF NEW.pg_payment_id IS DISTINCT FROM OLD.pg_payment_id
     AND OLD.pg_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'pg_payment_id is immutable once set';
  END IF;
  IF NEW.pg_merchant_uid IS DISTINCT FROM OLD.pg_merchant_uid THEN
    RAISE EXCEPTION 'pg_merchant_uid is immutable';
  END IF;
  IF NEW.pg_raw IS DISTINCT FROM OLD.pg_raw THEN
    RAISE EXCEPTION 'pg_raw is immutable for non-service-role';
  END IF;
  IF NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
    RAISE EXCEPTION 'paid_at is immutable';
  END IF;
  IF NEW.refunded_at IS DISTINCT FROM OLD.refunded_at THEN
    RAISE EXCEPTION 'refunded_at is immutable';
  END IF;
  IF NEW.settled_at IS DISTINCT FROM OLD.settled_at THEN
    RAISE EXCEPTION 'settled_at is immutable';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'created_at is immutable';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: trg_reviews_after_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_reviews_after_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM update_neighbor_star(OLD.reviewed_user_id);
    RETURN OLD;
  ELSE
    PERFORM update_neighbor_star(NEW.reviewed_user_id);
    -- UPDATE 시 reviewed_user_id 가 바뀌면 옛 유저도 재계산
    IF TG_OP = 'UPDATE' AND NEW.reviewed_user_id <> OLD.reviewed_user_id THEN
      PERFORM update_neighbor_star(OLD.reviewed_user_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;


--
-- Name: trg_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: trg_sync_properties_on_account_type_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_sync_properties_on_account_type_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_was_agent BOOLEAN;
  v_is_agent  BOOLEAN;
BEGIN
  -- account_type 이 실제로 바뀐 경우에만 동작
  IF NEW.account_type IS NOT DISTINCT FROM OLD.account_type THEN
    RETURN NEW;
  END IF;

  v_was_agent := OLD.account_type = 'agent';
  v_is_agent  := NEW.account_type = 'agent';

  IF v_was_agent AND NOT v_is_agent THEN
    -- ─── 박탈: agent → 그 외 ─────────────────────────────────────────────
    -- 해당 user 의 모든 active 매물 hidden 처리
    UPDATE public.properties
       SET status = 'hidden',
           hidden_reason = '공인중개사 인증 박탈로 자동 숨김',
           updated_at = NOW()
     WHERE user_id = NEW.id
       AND status = 'active';

    -- 관리자 액션 로그 (admin_id 는 NEW.id 의 변경자가 누군지 알 수 없으므로
    --  본인 id 로 기록 — 운영자는 audit timeline 으로 추적)
    BEGIN
      INSERT INTO public.admin_actions (
        admin_id, action, target_table, target_id, target_user_id, reason
      )
      SELECT
        NEW.id,
        'agent_revoke',
        'properties',
        p.id::text,
        p.user_id,
        '공인중개사 인증 박탈 — 자동 숨김 처리'
      FROM public.properties p
      WHERE p.user_id = NEW.id
        AND p.hidden_reason = '공인중개사 인증 박탈로 자동 숨김';
    EXCEPTION WHEN OTHERS THEN
      -- admin_actions 가 없으면 무시
      NULL;
    END;

  ELSIF NOT v_was_agent AND v_is_agent THEN
    -- ─── 승급: 일반 → agent ─────────────────────────────────────────────
    -- 기존 매물 seller_type='agent' 로 갱신 (이미 등록된 매물도 공인중개사 카테고리로)
    UPDATE public.properties
       SET seller_type = 'agent',
           updated_at = NOW()
     WHERE user_id = NEW.id
       AND seller_type IS DISTINCT FROM 'agent';

  ELSE
    -- ─── 일반인 ↔ 일반인 (business ↔ individual 등) ─────────────────────
    UPDATE public.properties
       SET seller_type = 'individual',
           updated_at = NOW()
     WHERE user_id = NEW.id
       AND seller_type IS DISTINCT FROM 'individual';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: update_neighbor_star("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_neighbor_star"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_avg NUMERIC;
  v_count INT;
BEGIN
  -- 3-항목 평균 → 단일 별점
  SELECT
    ROUND(AVG((response_speed + accuracy + kindness) / 3.0)::numeric, 1),
    COUNT(*)
  INTO v_avg, v_count
  FROM public.reviews
  WHERE reviewed_user_id = p_user_id;

  -- 0~5 범위 클램핑 (방어)
  IF v_avg IS NOT NULL THEN
    v_avg := GREATEST(0, LEAST(5, v_avg));
  END IF;

  UPDATE public.profiles
     SET trust_score = v_avg,
         review_count = COALESCE(v_count, 0)
   WHERE id = p_user_id;
END;
$$;


--
-- Name: update_plaza_business_info("text", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_plaza_business_info"("p_plaza_id" "text", "p_info" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_result JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  -- superadmin 이거나 해당 광장의 plaza_admin 인지 확인
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_uid AND role = 'superadmin'
  ) OR EXISTS (
    SELECT 1 FROM plaza_admins
    WHERE plaza_admins.plaza_id = p_plaza_id
      AND plaza_admins.user_id = v_uid
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'permission denied: not a plaza admin of %', p_plaza_id;
  END IF;

  UPDATE plazas
    SET business_info = COALESCE(p_info, '{}'::jsonb),
        updated_at    = NOW()
    WHERE id = p_plaza_id
  RETURNING business_info INTO v_result;

  RETURN v_result;
END;
$$;


--
-- Name: update_post_comment_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_post_comment_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE board_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE board_posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: update_post_like_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_post_like_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE board_posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE board_posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: update_trust_score(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_trust_score"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  avg_score DECIMAL(3,1);
  review_cnt INTEGER;
BEGIN
  SELECT 
    ROUND(AVG(total_score)::numeric, 1),
    COUNT(*)
  INTO avg_score, review_cnt
  FROM reviews
  WHERE reviewed_user_id = COALESCE(NEW.reviewed_user_id, OLD.reviewed_user_id);
  
  UPDATE profiles
  SET 
    trust_score = CASE 
      WHEN avg_score IS NOT NULL THEN ROUND((36.5 + (avg_score - 3) * 12.7)::numeric, 1)
      ELSE 36.5
    END,
    review_count = COALESCE(review_cnt, 0)
  WHERE id = COALESCE(NEW.reviewed_user_id, OLD.reviewed_user_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: update_trust_score("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_trust_score"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM update_neighbor_star(p_user_id);
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: user_in_plaza("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."user_in_plaza"("p_plaza_id" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT;
BEGIN
  IF v_uid IS NULL OR p_plaza_id IS NULL THEN
    RETURN FALSE;
  END IF;
  -- superadmin 우회
  SELECT role INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role = 'superadmin' THEN
    RETURN TRUE;
  END IF;
  -- plaza_profiles 등록 확인
  RETURN EXISTS (
    SELECT 1 FROM plaza_profiles
    WHERE user_id = v_uid AND plaza_id = p_plaza_id
  );
END;
$$;


--
-- Name: FUNCTION "user_in_plaza"("p_plaza_id" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."user_in_plaza"("p_plaza_id" "text") IS 'auth.uid() 가 해당 plaza_profiles 에 등록되어 있는지 확인 (superadmin 우회). 모든 도메인 INSERT 정책에서 사용.';


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: account_type_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."account_type_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "requested_type" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "business_name" "text" NOT NULL,
    "business_number" "text",
    "office_address" "text" NOT NULL,
    "contact_phone" "text",
    "intro" "text",
    "business_cert_urls" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "license_urls" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "extra_docs_urls" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "admin_note" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "previous_type" "text",
    "plaza_id" "text",
    "registration_number" "text",
    CONSTRAINT "account_type_requests_requested_type_check" CHECK (("requested_type" = ANY (ARRAY['agent'::"text", 'business'::"text", 'producer'::"text", 'interior'::"text", 'moving'::"text", 'cleaning'::"text", 'repair'::"text"]))),
    CONSTRAINT "account_type_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'cancelled'::"text"])))
);


--
-- Name: TABLE "account_type_requests"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."account_type_requests" IS '계정 유형 전환 신청 (일반인 → 공인중개사/사장님/생산자/인테리어/이사/청소/수리)';


--
-- Name: COLUMN "account_type_requests"."previous_type"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."account_type_requests"."previous_type" IS '신청 시점의 profiles.account_type 스냅샷. 변경 신청(non-null & !="user"/"individual")과 신규 신청 구분용';


--
-- Name: admin_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."admin_actions" (
    "id" bigint NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "target_table" "text" NOT NULL,
    "target_id" "text" NOT NULL,
    "target_user_id" "uuid",
    "plaza_id" "text",
    "before_data" "jsonb",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: admin_actions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."admin_actions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admin_actions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."admin_actions_id_seq" OWNED BY "public"."admin_actions"."id";


--
-- Name: admin_backup_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."admin_backup_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid",
    "action" "text" NOT NULL,
    "target" "text",
    "status" "text" DEFAULT 'success'::"text" NOT NULL,
    "detail" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: admin_mail_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."admin_mail_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid",
    "channel" "text" DEFAULT 'mail'::"text" NOT NULL,
    "target_type" "text" DEFAULT 'all'::"text" NOT NULL,
    "target_value" "text",
    "subject" "text",
    "body" "text" NOT NULL,
    "recipients" integer DEFAULT 0 NOT NULL,
    "success" integer DEFAULT 0 NOT NULL,
    "failed" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: admin_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."admin_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "menu_id" "text" NOT NULL,
    "can_read" boolean DEFAULT false,
    "can_write" boolean DEFAULT false,
    "can_delete" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: admin_user_memos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."admin_user_memos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "plaza_id" "text",
    "memo" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: ai_video_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ai_video_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "input" "jsonb" NOT NULL,
    "credits_used" integer DEFAULT 0 NOT NULL,
    "beta_free" boolean DEFAULT false NOT NULL,
    "result_url" "text",
    "thumbnail_url" "text",
    "duration_seconds" integer,
    "error_message" "text",
    "provider" "text",
    "provider_job_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "script_text" "text",
    "tts_url" "text",
    "bgm_url" "text",
    "clips" "jsonb" DEFAULT '[]'::"jsonb",
    "provider_request_id" "text",
    "stage" "text",
    "subtitle_segments" "jsonb" DEFAULT '[]'::"jsonb",
    "subtitle_ass_url" "text",
    "compose_url" "text",
    "credits_refunded" boolean DEFAULT false NOT NULL,
    CONSTRAINT "ai_video_jobs_stage_check" CHECK ((("stage" IS NULL) OR ("stage" = ANY (ARRAY['preparing'::"text", 'generating_clips'::"text", 'compositing'::"text", 'burning_subtitles'::"text", 'done'::"text"])))),
    CONSTRAINT "ai_video_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


--
-- Name: COLUMN "ai_video_jobs"."script_text"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."ai_video_jobs"."script_text" IS 'OpenAI 생성 한국어 나레이션 스크립트';


--
-- Name: COLUMN "ai_video_jobs"."tts_url"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."ai_video_jobs"."tts_url" IS 'ElevenLabs TTS 음성 파일 URL (Supabase Storage)';


--
-- Name: COLUMN "ai_video_jobs"."bgm_url"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."ai_video_jobs"."bgm_url" IS 'Pixabay BGM URL';


--
-- Name: COLUMN "ai_video_jobs"."clips"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."ai_video_jobs"."clips" IS 'fal.ai 가 생성한 개별 영상 클립 URL 배열';


--
-- Name: COLUMN "ai_video_jobs"."provider_request_id"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."ai_video_jobs"."provider_request_id" IS 'fal.ai queue request_id (웹훅 매칭용)';


--
-- Name: COLUMN "ai_video_jobs"."stage"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."ai_video_jobs"."stage" IS '파이프라인 단계 (UI 표시용)';


--
-- Name: COLUMN "ai_video_jobs"."subtitle_segments"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."ai_video_jobs"."subtitle_segments" IS 'OpenAI 생성 자막 구간 [{start, end, text, subText}]';


--
-- Name: COLUMN "ai_video_jobs"."subtitle_ass_url"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."ai_video_jobs"."subtitle_ass_url" IS 'Supabase Storage 의 .ass 파일 URL';


--
-- Name: COLUMN "ai_video_jobs"."compose_url"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."ai_video_jobs"."compose_url" IS '자막 burn 전 합성본 (디버깅/폴백용)';


--
-- Name: COLUMN "ai_video_jobs"."credits_refunded"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."ai_video_jobs"."credits_refunded" IS 'true 면 이 job 에 대해 이미 크레딧 환불이 완료됨 (중복 환불 방지)';


--
-- Name: app_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."app_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plaza_id" "text" NOT NULL,
    "version" "text" NOT NULL,
    "min_version" "text",
    "force_update" boolean DEFAULT false NOT NULL,
    "release_notes" "text",
    "platform" "text" DEFAULT 'all'::"text",
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "app_versions_platform_check" CHECK (("platform" = ANY (ARRAY['all'::"text", 'ios'::"text", 'android'::"text"])))
);


--
-- Name: TABLE "app_versions"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."app_versions" IS '앱 버전 히스토리. 광장별 버전 변경 이력 기록.';


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."audit_log" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "plaza_id" "text" NOT NULL,
    "action" "text" NOT NULL,
    "target_type" "text",
    "target_id" "text",
    "metadata" "jsonb",
    "ip" "inet",
    "user_agent" "text"
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."audit_log_id_seq" OWNED BY "public"."audit_log"."id";


--
-- Name: block_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."block_users" (
    "blocker_id" "uuid" NOT NULL,
    "blocked_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "block_users_check" CHECK (("blocker_id" <> "blocked_id"))
);


--
-- Name: TABLE "block_users"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."block_users" IS '사용자 ↔ 사용자 글로벌 차단 (광장 무관)';


--
-- Name: board_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."board_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(50) NOT NULL,
    "slug" character varying(50) NOT NULL,
    "description" "text",
    "icon" character varying(50),
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "board_categories_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: board_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."board_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "author_name" character varying(100),
    "author_avatar" "text",
    "parent_id" "uuid",
    "content" "text" NOT NULL,
    "like_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "images" "text"[] DEFAULT ARRAY[]::"text"[],
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "report_count" integer DEFAULT 0 NOT NULL,
    "hidden_reason" "text",
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "board_comments_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: board_post_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."board_post_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "board_post_likes_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: board_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."board_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "author_name" character varying(100),
    "author_avatar" "text",
    "title" character varying(200) NOT NULL,
    "content" "text" NOT NULL,
    "images" "text"[] DEFAULT '{}'::"text"[],
    "view_count" integer DEFAULT 0,
    "like_count" integer DEFAULT 0,
    "comment_count" integer DEFAULT 0,
    "is_pinned" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "thumbnail_url" "text",
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    "report_count" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "hidden_reason" "text",
    "region" "text",
    "region_id" "uuid",
    CONSTRAINT "board_posts_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL)),
    CONSTRAINT "board_posts_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'hidden'::"text", 'deleted'::"text"])))
);


--
-- Name: boost_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."boost_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plaza_id" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "tier" "text" NOT NULL,
    "amount" integer NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payment_id" "uuid",
    "free_period" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "boost_orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'expired'::"text", 'canceled'::"text", 'refunded'::"text"]))),
    CONSTRAINT "boost_orders_target_type_check" CHECK (("target_type" = ANY (ARRAY['property'::"text", 'new_store'::"text", 'job'::"text", 'group_buying'::"text", 'club'::"text"]))),
    CONSTRAINT "boost_orders_tier_check" CHECK (("tier" = ANY (ARRAY['main_banner_3d'::"text", 'main_banner_7d'::"text", 'category_top_3d'::"text", 'category_top_7d'::"text", 'card_news_push'::"text"])))
);


--
-- Name: TABLE "boost_orders"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."boost_orders" IS '노출 부스트 주문 — 매물별 상단 노출 결제 이력.';


--
-- Name: boost_pricing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."boost_pricing" (
    "tier" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "applicable_targets" "text"[] NOT NULL,
    "duration_days" integer NOT NULL,
    "price" integer NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 100 NOT NULL
);


--
-- Name: TABLE "boost_pricing"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."boost_pricing" IS '부스트 가격 카탈로그 — DB 값으로 코드 배포 없이 조정.';


--
-- Name: bump_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."bump_daily" (
    "user_id" "uuid" NOT NULL,
    "plaza_id" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "date" "date" NOT NULL,
    "free_used" integer DEFAULT 0 NOT NULL,
    "paid_used" integer DEFAULT 0 NOT NULL
);


--
-- Name: bump_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."bump_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plaza_id" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "payment" "text" NOT NULL,
    "cost_points" integer DEFAULT 0 NOT NULL,
    "cost_krw" integer DEFAULT 0 NOT NULL,
    "payment_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bump_history_payment_check" CHECK (("payment" = ANY (ARRAY['free'::"text", 'points'::"text", 'cash'::"text"])))
);


--
-- Name: bump_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."bump_settings" (
    "target_type" "text" NOT NULL,
    "free_per_day" integer DEFAULT 1 NOT NULL,
    "cooldown_seconds" integer DEFAULT 1800 NOT NULL,
    "points_cost" integer DEFAULT 50 NOT NULL,
    "krw_cost" integer DEFAULT 500 NOT NULL,
    "required_account_age_days" integer DEFAULT 7 NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bump_settings_prices_nonneg" CHECK ((("points_cost" >= 0) AND ("krw_cost" >= 0) AND ("free_per_day" >= 0) AND ("cooldown_seconds" >= 0)))
);


--
-- Name: bump_ticket_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."bump_ticket_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plaza_id" "text" NOT NULL,
    "pack_id" "text" NOT NULL,
    "qty" integer NOT NULL,
    "payment" "text" NOT NULL,
    "cost_points" integer DEFAULT 0 NOT NULL,
    "cost_krw" integer DEFAULT 0 NOT NULL,
    "payment_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bump_ticket_orders_payment_check" CHECK (("payment" = ANY (ARRAY['points'::"text", 'cash'::"text"])))
);


--
-- Name: bump_ticket_packs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."bump_ticket_packs" (
    "id" "text" NOT NULL,
    "size" integer NOT NULL,
    "krw_price" integer NOT NULL,
    "points_price" integer NOT NULL,
    "display_label" "text" NOT NULL,
    "description" "text",
    "enabled" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "bump_ticket_packs_prices_nonneg" CHECK ((("points_price" >= 0) AND ("krw_price" >= 0))),
    CONSTRAINT "bump_ticket_packs_size_pos" CHECK (("size" > 0))
);


--
-- Name: bump_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."bump_tickets" (
    "user_id" "uuid" NOT NULL,
    "plaza_id" "text" NOT NULL,
    "balance" integer DEFAULT 0 NOT NULL,
    "lifetime_purchased" integer DEFAULT 0 NOT NULL,
    "lifetime_used" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bump_tickets_balance_nonneg" CHECK (("balance" >= 0))
);


--
-- Name: business_declarations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."business_declarations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "business_number" "text" NOT NULL,
    "business_name" "text" NOT NULL,
    "business_category" "text",
    "ceo_name" "text",
    "business_address" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "doc_url" "text",
    "rejection_reason" "text",
    "verified_at" timestamp with time zone,
    "verified_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "business_declarations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'verified'::"text", 'rejected'::"text", 'expired'::"text"])))
);


--
-- Name: TABLE "business_declarations"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."business_declarations" IS '자진 신고된 사업자 — 검증 후 "사업자 마크" 표시. 별도 카테고리 분리 가능.';


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "parent_id" "uuid",
    "icon" "text",
    "color" "text",
    "is_active" boolean DEFAULT true,
    "order_index" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "slug" "text",
    "sort_order" integer DEFAULT 0 NOT NULL
);


--
-- Name: chat_room_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."chat_room_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "role" "text" DEFAULT 'member'::"text",
    CONSTRAINT "chat_room_participants_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'member'::"text", 'expert'::"text"])))
);


--
-- Name: chat_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."chat_rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid",
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "last_message" "text",
    "last_message_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "max_participants" integer DEFAULT 3,
    "post_type" "text" DEFAULT 'property'::"text",
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    "buyer_plaza_id" "text"
);


--
-- Name: chuncheon_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."chuncheon_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "location" "text",
    "event_date" "date" NOT NULL,
    "end_date" "date",
    "category" "text" DEFAULT 'general'::"text" NOT NULL,
    "color" "text" DEFAULT '#10b981'::"text",
    "is_active" boolean DEFAULT true NOT NULL,
    "link_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "external_id" "text",
    "source" "text",
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "chuncheon_events_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: cleaning_favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."cleaning_favorites" (
    "user_id" "uuid" NOT NULL,
    "post_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "cleaning_favorites_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: cleaning_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."cleaning_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" character varying(200) NOT NULL,
    "content" "text" NOT NULL,
    "category" character varying(50) DEFAULT '입주청소'::character varying NOT NULL,
    "service_region" character varying(100),
    "service_district" character varying(100),
    "images" "text"[] DEFAULT '{}'::"text"[],
    "contact_phone" character varying(20),
    "min_price" integer,
    "max_price" integer,
    "price_unit" character varying(20) DEFAULT '만원'::character varying,
    "views" integer DEFAULT 0,
    "likes" integer DEFAULT 0,
    "status" character varying(20) DEFAULT 'active'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "service_dong" character varying(100),
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    "bumped_at" timestamp with time zone,
    "effective_at" timestamp with time zone GENERATED ALWAYS AS (COALESCE("bumped_at", "created_at")) STORED,
    "career_years" integer,
    "lat" double precision,
    "lng" double precision,
    "region_id" "uuid",
    CONSTRAINT "cleaning_posts_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: club_chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."club_chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "club_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text",
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "club_chat_messages_check" CHECK ((("content" IS NOT NULL) OR ("image_url" IS NOT NULL))),
    CONSTRAINT "club_chat_messages_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: club_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."club_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "club_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "club_likes_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: club_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."club_members" (
    "club_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "club_members_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: clubs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."clubs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "content" "text",
    "category" "text" DEFAULT '운동'::"text" NOT NULL,
    "sport_type" "text",
    "location" "text",
    "district" "text",
    "meeting_date" timestamp with time zone,
    "meeting_time" "text",
    "current_members" integer DEFAULT 1,
    "max_members" integer DEFAULT 10,
    "skill_level" "text" DEFAULT '누구나'::"text",
    "status" "text" DEFAULT 'recruiting'::"text",
    "images" "text"[],
    "view_count" integer DEFAULT 0,
    "like_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    "lat" double precision,
    "lng" double precision,
    "region_id" "uuid",
    "hidden_reason" "text",
    "sub_region" "text",
    CONSTRAINT "clubs_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL)),
    CONSTRAINT "clubs_skill_level_check" CHECK (("skill_level" = ANY (ARRAY['누구나'::"text", '초급'::"text", '중급'::"text", '고급'::"text"]))),
    CONSTRAINT "clubs_status_check" CHECK (("status" = ANY (ARRAY['recruiting'::"text", 'full'::"text", 'closed'::"text"])))
);


--
-- Name: commission_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."commission_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plaza_id" "text",
    "category" "text",
    "rate" numeric(5,2) DEFAULT 10.00 NOT NULL,
    "effective_from" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: TABLE "commission_rates"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."commission_rates" IS '광장별/카테고리별 수수료율. plaza_id NULL = 전체 기본, category NULL = 전체 카테고리.';


--
-- Name: commission_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."commission_settings" (
    "category" "text" NOT NULL,
    "rate_pct" numeric(5,2) NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "commission_settings_rate_pct_check" CHECK ((("rate_pct" >= (0)::numeric) AND ("rate_pct" <= (100)::numeric)))
);


--
-- Name: TABLE "commission_settings"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."commission_settings" IS '카테고리별 수수료율 — DB 설정값으로 코드 배포 없이 조정 가능.';


--
-- Name: commission_splits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."commission_splits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "recipient_type" "text" NOT NULL,
    "recipient_id" "uuid",
    "plaza_id" "text",
    "amount" integer NOT NULL,
    "rate_pct" numeric(5,2),
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payout_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "commission_splits_recipient_type_check" CHECK (("recipient_type" = ANY (ARRAY['hq'::"text", 'plaza_association'::"text", 'merchant'::"text"]))),
    CONSTRAINT "commission_splits_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'reserved'::"text", 'paid_out'::"text", 'refunded'::"text"])))
);


--
-- Name: TABLE "commission_splits"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."commission_splits" IS '결제 1건당 본사/광장 분배 내역. 처음부터 분할 기록 → 모델 A↔B 호환.';


--
-- Name: credit_purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."credit_purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "product_code" "text" NOT NULL,
    "amount_krw" integer NOT NULL,
    "credits_granted" integer NOT NULL,
    "provider" "text" NOT NULL,
    "payment_key" "text",
    "order_id" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "raw_response" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone,
    CONSTRAINT "credit_purchases_provider_check" CHECK (("provider" = ANY (ARRAY['toss'::"text", 'kakaopay'::"text", 'beta_grant'::"text", 'admin_grant'::"text"]))),
    CONSTRAINT "credit_purchases_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'failed'::"text", 'refunded'::"text", 'cancelled'::"text"])))
);


--
-- Name: cron_run_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."cron_run_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_name" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "result" "jsonb",
    "error" "text",
    "duration_ms" integer
);


--
-- Name: expert_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."expert_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chat_room_id" "uuid" NOT NULL,
    "inviter_id" "uuid" NOT NULL,
    "expert_id" "uuid" NOT NULL,
    "property_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "responded_at" timestamp with time zone,
    CONSTRAINT "expert_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text", 'expired'::"text"])))
);


--
-- Name: faqs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."faqs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "text" DEFAULT 'general'::"text" NOT NULL,
    "question" "text" NOT NULL,
    "answer" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "faqs_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "plaza_id" "text" DEFAULT 'chuncheon'::"text"
);


--
-- Name: feature_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."feature_flags" (
    "key" "text" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "description" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


--
-- Name: TABLE "feature_flags"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."feature_flags" IS '기능 활성화 토글. 슈퍼 어드민만 변경 가능.';


--
-- Name: follows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."follows" (
    "follower_id" "uuid" NOT NULL,
    "following_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" NOT NULL,
    CONSTRAINT "follows_check" CHECK (("follower_id" <> "following_id"))
);


--
-- Name: group_buying_chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."group_buying_chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text",
    "image_url" "text",
    "system_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "group_buying_chat_messages_check" CHECK ((("content" IS NOT NULL) OR ("image_url" IS NOT NULL) OR ("system_type" IS NOT NULL))),
    CONSTRAINT "group_buying_chat_messages_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: group_buying_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."group_buying_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "product_name" "text" NOT NULL,
    "original_price" integer,
    "group_price" integer NOT NULL,
    "min_participants" integer DEFAULT 2 NOT NULL,
    "max_participants" integer,
    "current_participants" integer DEFAULT 0,
    "deadline" timestamp with time zone,
    "images" "text"[],
    "status" "text" DEFAULT 'recruiting'::"text" NOT NULL,
    "location" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "views" integer DEFAULT 0,
    "account_info" "text",
    "delivery_mode" "text" DEFAULT 'both'::"text" NOT NULL,
    "delivery_fee" integer DEFAULT 0 NOT NULL,
    "delivery_fee_mode" "text" DEFAULT 'separate'::"text" NOT NULL,
    "pickup_location" "text",
    "pickup_time" "text",
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    "bumped_at" timestamp with time zone,
    "effective_at" timestamp with time zone GENERATED ALWAYS AS (COALESCE("bumped_at", "created_at")) STORED,
    "visibility" "text" DEFAULT 'plaza'::"text" NOT NULL,
    "payment_required" boolean DEFAULT false NOT NULL,
    "auto_processed_at" timestamp with time zone,
    "region_id" "uuid",
    CONSTRAINT "group_buying_posts_delivery_fee_mode_check" CHECK (("delivery_fee_mode" = ANY (ARRAY['included'::"text", 'separate'::"text", 'free'::"text"]))),
    CONSTRAINT "group_buying_posts_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL)),
    CONSTRAINT "group_buying_posts_status_check" CHECK (("status" = ANY (ARRAY['recruiting'::"text", 'pending_payment'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "group_buying_posts_visibility_check" CHECK (("visibility" = ANY (ARRAY['plaza'::"text", 'national'::"text"])))
);


--
-- Name: group_buying_host_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."group_buying_host_stats" AS
 SELECT "user_id",
    "count"(*) FILTER (WHERE ("status" = ANY (ARRAY['confirmed'::"text", 'completed'::"text"]))) AS "success_count",
    "count"(*) FILTER (WHERE ("status" = 'cancelled'::"text")) AS "cancel_count",
    "count"(*) AS "total_count",
        CASE
            WHEN ("count"(*) FILTER (WHERE ("status" = ANY (ARRAY['confirmed'::"text", 'completed'::"text", 'cancelled'::"text"]))) = 0) THEN NULL::numeric
            ELSE "round"(((100.0 * ("count"(*) FILTER (WHERE ("status" = ANY (ARRAY['confirmed'::"text", 'completed'::"text"]))))::numeric) / (NULLIF("count"(*) FILTER (WHERE ("status" = ANY (ARRAY['confirmed'::"text", 'completed'::"text", 'cancelled'::"text"]))), 0))::numeric), 0)
        END AS "success_pct"
   FROM "public"."group_buying_posts"
  GROUP BY "user_id";


--
-- Name: group_buying_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."group_buying_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "plaza_id" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "unit_price" integer NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "amount" integer NOT NULL,
    "fee_amount" integer DEFAULT 0 NOT NULL,
    "settlement_amount" integer GENERATED ALWAYS AS (("amount" - "fee_amount")) STORED,
    "points_used" integer DEFAULT 0 NOT NULL,
    "points_tx_id" "uuid",
    "receive_method" "text" NOT NULL,
    "delivery_addr" "jsonb",
    "buyer_memo" "text",
    "tracking_company" "text",
    "tracking_number" "text",
    "pg_provider" "text" DEFAULT 'mock'::"text" NOT NULL,
    "pg_payment_id" "text",
    "pg_merchant_uid" "text" NOT NULL,
    "pg_raw" "jsonb",
    "paid_at" timestamp with time zone,
    "group_confirmed_at" timestamp with time zone,
    "shipped_at" timestamp with time zone,
    "confirmed_at" timestamp with time zone,
    "refunded_at" timestamp with time zone,
    "refund_reason" "text",
    "cancelled_at" timestamp with time zone,
    "settled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "idempotency_key" "text",
    "received_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "buyer_plaza_id" "text",
    CONSTRAINT "group_buying_orders_amount_check" CHECK (("amount" >= 0)),
    CONSTRAINT "group_buying_orders_points_used_check" CHECK (("points_used" >= 0)),
    CONSTRAINT "group_buying_orders_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "group_buying_orders_receive_method_check" CHECK (("receive_method" = ANY (ARRAY['pickup'::"text", 'delivery'::"text"]))),
    CONSTRAINT "group_buying_orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'pending_payment'::"text", 'paid'::"text", 'group_confirmed'::"text", 'shipped'::"text", 'confirmed'::"text", 'completed'::"text", 'refunded'::"text", 'cancelled'::"text", 'settled'::"text"]))),
    CONSTRAINT "group_buying_orders_unit_price_check" CHECK (("unit_price" >= 0))
);


--
-- Name: COLUMN "group_buying_orders"."idempotency_key"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."group_buying_orders"."idempotency_key" IS '클라이언트 발급 UUID. 같은 buyer + 같은 key → 중복 결제 차단';


--
-- Name: group_buying_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."group_buying_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "quantity" integer DEFAULT 1 NOT NULL,
    "receive_method" "text" DEFAULT 'pickup'::"text" NOT NULL,
    "recipient_name" "text",
    "recipient_phone" "text",
    "recipient_address" "text",
    "recipient_address_detail" "text",
    "tracking_carrier" "text",
    "tracking_number" "text",
    "shipped_at" timestamp with time zone,
    "payment_status" "text" DEFAULT 'reserved'::"text" NOT NULL,
    "paid_at" timestamp with time zone,
    "confirmed_at" timestamp with time zone,
    "received_at" timestamp with time zone,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "refunded_at" timestamp with time zone,
    "tracking_company" "text",
    CONSTRAINT "group_buying_participants_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['reserved'::"text", 'pending_payment'::"text", 'paid'::"text", 'confirmed'::"text", 'shipped'::"text", 'received'::"text", 'completed'::"text", 'refunded'::"text", 'cancelled'::"text"])))
);


--
-- Name: group_buying_wishlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."group_buying_wishlist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "plaza_id" "text" DEFAULT 'chuncheon'::"text"
);


--
-- Name: hero_banners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."hero_banners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "subtitle" "text",
    "description" "text",
    "href" "text" NOT NULL,
    "gradient" "text" DEFAULT 'from-blue-500 to-cyan-500'::"text" NOT NULL,
    "icon" "text" DEFAULT 'Building2'::"text" NOT NULL,
    "image_url" "text",
    "order_index" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "link_url" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "start_at" timestamp with time zone,
    "end_at" timestamp with time zone,
    "opacity" integer DEFAULT 40,
    "font_family" "text" DEFAULT 'sans'::"text",
    "logo_image_url" "text",
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "hero_banners_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: homepage_menu; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."homepage_menu" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "label" "text" NOT NULL,
    "href" "text" NOT NULL,
    "icon" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "parent_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "homepage_menu_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: homepage_slider; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."homepage_slider" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text",
    "image_url" "text" NOT NULL,
    "link_url" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "homepage_slider_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: interior_favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."interior_favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "post_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "interior_favorites_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: interior_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."interior_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" character varying(200) NOT NULL,
    "content" "text" NOT NULL,
    "category" character varying(50) DEFAULT '시공'::character varying NOT NULL,
    "service_region" character varying(100),
    "service_district" character varying(100),
    "images" "text"[] DEFAULT '{}'::"text"[],
    "contact_phone" character varying(20),
    "min_price" integer,
    "max_price" integer,
    "price_unit" character varying(20) DEFAULT '만원'::character varying,
    "views" integer DEFAULT 0,
    "likes" integer DEFAULT 0,
    "status" character varying(20) DEFAULT 'active'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "service_dong" character varying(100),
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    "bumped_at" timestamp with time zone,
    "effective_at" timestamp with time zone GENERATED ALWAYS AS (COALESCE("bumped_at", "created_at")) STORED,
    "career_years" integer,
    "lat" double precision,
    "lng" double precision,
    "region_id" "uuid",
    CONSTRAINT "interior_posts_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: jobs_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."jobs_likes" (
    "user_id" "uuid" NOT NULL,
    "post_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "jobs_likes_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: jobs_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."jobs_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "text" DEFAULT 'hiring'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "category" "text" DEFAULT '기타'::"text" NOT NULL,
    "work_type" "text",
    "hourly_wage" integer NOT NULL,
    "work_days" "text",
    "work_hours" "text",
    "location" "text",
    "contact" "text",
    "images" "jsonb",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "views" integer DEFAULT 0 NOT NULL,
    "likes" integer DEFAULT 0 NOT NULL,
    "report_count" integer DEFAULT 0 NOT NULL,
    "hidden_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    "bumped_at" timestamp with time zone,
    "effective_at" timestamp with time zone GENERATED ALWAYS AS (COALESCE("bumped_at", "created_at")) STORED,
    "lat" double precision,
    "lng" double precision,
    "region_id" "uuid",
    CONSTRAINT "jobs_posts_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: TABLE "jobs_posts"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."jobs_posts" IS '구인구직 게시글 (알바 중심)';


--
-- Name: local_food; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."local_food" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "content" "text",
    "price" integer,
    "original_price" integer,
    "unit" "text" DEFAULT '1kg'::"text",
    "category" "text" DEFAULT '채소'::"text",
    "images" "text"[],
    "location" "text",
    "district" "text",
    "status" "text" DEFAULT 'available'::"text",
    "view_count" integer DEFAULT 0,
    "like_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    "bumped_at" timestamp with time zone,
    "effective_at" timestamp with time zone GENERATED ALWAYS AS (COALESCE("bumped_at", "created_at")) STORED,
    "farm_name" "text",
    "shipping_fee" integer DEFAULT 0 NOT NULL,
    "free_shipping" boolean DEFAULT false NOT NULL,
    "region_id" "uuid",
    "visibility" "text" DEFAULT 'plaza'::"text" NOT NULL,
    CONSTRAINT "local_food_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL)),
    CONSTRAINT "local_food_shipping_fee_check" CHECK (("shipping_fee" >= 0)),
    CONSTRAINT "local_food_visibility_check" CHECK (("visibility" = ANY (ARRAY['plaza'::"text", 'national'::"text"])))
);


--
-- Name: COLUMN "local_food"."farm_name"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."local_food"."farm_name" IS '농가/가게/브랜드 이름. NULL 허용 — 비어 있으면 클라이언트에서 작성자 닉네임으로 fallback.';


--
-- Name: local_food_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."local_food_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "local_food_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "plaza_id" "text" DEFAULT 'chuncheon'::"text"
);


--
-- Name: local_food_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."local_food_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "local_food_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "unit" "text",
    "unit_price" integer NOT NULL,
    "quantity" integer NOT NULL,
    "subtotal" integer GENERATED ALWAYS AS (("unit_price" * "quantity")) STORED,
    "thumbnail_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "local_food_order_items_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "local_food_order_items_unit_price_check" CHECK (("unit_price" >= 0))
);


--
-- Name: local_food_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."local_food_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "plaza_id" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "amount" integer NOT NULL,
    "fee_amount" integer DEFAULT 0 NOT NULL,
    "settlement_amount" integer GENERATED ALWAYS AS (("amount" - "fee_amount")) STORED,
    "delivery_addr" "jsonb" NOT NULL,
    "buyer_memo" "text",
    "seller_memo" "text",
    "tracking_company" "text",
    "tracking_number" "text",
    "pg_provider" "text" DEFAULT 'mock'::"text" NOT NULL,
    "pg_payment_id" "text",
    "pg_merchant_uid" "text" NOT NULL,
    "pg_raw" "jsonb",
    "paid_at" timestamp with time zone,
    "shipped_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "confirmed_at" timestamp with time zone,
    "refund_requested_at" timestamp with time zone,
    "refunded_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "settled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "points_used" integer DEFAULT 0 NOT NULL,
    "points_tx_id" "uuid",
    "idempotency_key" "text",
    "received_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "buyer_plaza_id" "text",
    CONSTRAINT "local_food_orders_amount_check" CHECK (("amount" >= 0)),
    CONSTRAINT "local_food_orders_fee_amount_check" CHECK (("fee_amount" >= 0)),
    CONSTRAINT "local_food_orders_points_used_check" CHECK (("points_used" >= 0)),
    CONSTRAINT "local_food_orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'pending_payment'::"text", 'paid'::"text", 'shipped'::"text", 'delivered'::"text", 'confirmed'::"text", 'completed'::"text", 'refund_requested'::"text", 'refunded'::"text", 'cancelled'::"text", 'settled'::"text"])))
);


--
-- Name: COLUMN "local_food_orders"."points_used"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."local_food_orders"."points_used" IS '주문에 사용한 포인트 (1pt = 1원, 결제액 차감)';


--
-- Name: COLUMN "local_food_orders"."points_tx_id"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."local_food_orders"."points_tx_id" IS 'points_spend_atomic 의 transaction id — 환불·취소 시 회수에 사용';


--
-- Name: COLUMN "local_food_orders"."idempotency_key"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."local_food_orders"."idempotency_key" IS '클라이언트 발급 UUID. 같은 buyer + 같은 key → 중복 결제 차단';


--
-- Name: maintenance_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."maintenance_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_enabled" boolean DEFAULT false,
    "title" "text" DEFAULT '사이트 점검 중'::"text",
    "message" "text" DEFAULT '더 나은 서비스를 위해 점검 중입니다.'::"text",
    "start_time" timestamp with time zone,
    "end_time" timestamp with time zone,
    "allowed_ips" "text"[],
    "updated_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chat_room_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_system" boolean DEFAULT false,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text"
);


--
-- Name: moderation_keywords; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."moderation_keywords" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "keyword" "text" NOT NULL,
    "scope" "text" DEFAULT 'all'::"text" NOT NULL,
    "action" "text" DEFAULT 'flag'::"text" NOT NULL,
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text"
);


--
-- Name: TABLE "moderation_keywords"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."moderation_keywords" IS '관리자 설정 업자/스팸 필터 키워드';


--
-- Name: moving_favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."moving_favorites" (
    "user_id" "uuid" NOT NULL,
    "post_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "moving_favorites_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: moving_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."moving_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" character varying(200) NOT NULL,
    "content" "text" NOT NULL,
    "category" character varying(50) DEFAULT '가정이사'::character varying NOT NULL,
    "service_region" character varying(100),
    "service_district" character varying(100),
    "images" "text"[] DEFAULT '{}'::"text"[],
    "contact_phone" character varying(20),
    "min_price" integer,
    "max_price" integer,
    "price_unit" character varying(20) DEFAULT '만원'::character varying,
    "views" integer DEFAULT 0,
    "likes" integer DEFAULT 0,
    "status" character varying(20) DEFAULT 'active'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "service_dong" character varying(100),
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    "bumped_at" timestamp with time zone,
    "effective_at" timestamp with time zone GENERATED ALWAYS AS (COALESCE("bumped_at", "created_at")) STORED,
    "career_years" integer,
    "lat" double precision,
    "lng" double precision,
    "region_id" "uuid",
    CONSTRAINT "moving_posts_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: my_club_chat_rooms; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."my_club_chat_rooms" WITH ("security_invoker"='true') AS
 SELECT "c"."id" AS "club_id",
    "c"."title",
    "c"."images",
    "c"."sport_type",
    "c"."status",
    "c"."max_members",
    "c"."current_members",
    "cm"."user_id",
    "cm"."joined_at",
    "cm"."last_read_at",
    ( SELECT "m"."content"
           FROM "public"."club_chat_messages" "m"
          WHERE ("m"."club_id" = "c"."id")
          ORDER BY "m"."created_at" DESC
         LIMIT 1) AS "last_message",
    ( SELECT "m"."created_at"
           FROM "public"."club_chat_messages" "m"
          WHERE ("m"."club_id" = "c"."id")
          ORDER BY "m"."created_at" DESC
         LIMIT 1) AS "last_message_at",
    ( SELECT ("count"(*))::integer AS "count"
           FROM "public"."club_chat_messages" "m"
          WHERE (("m"."club_id" = "c"."id") AND ("m"."created_at" > "cm"."last_read_at") AND ("m"."user_id" <> "cm"."user_id"))) AS "unread_count"
   FROM ("public"."club_members" "cm"
     JOIN "public"."clubs" "c" ON (("c"."id" = "cm"."club_id")))
  WHERE ("c"."status" = ANY (ARRAY['full'::"text", 'closed'::"text"]));


--
-- Name: my_group_buying_chat_rooms; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."my_group_buying_chat_rooms" WITH ("security_invoker"='true') AS
 SELECT "gp"."id" AS "post_id",
    "gp"."plaza_id",
    "gp"."title",
    "gp"."product_name",
    "gp"."images",
    "gp"."status",
    "gp"."group_price",
    "gp"."max_participants",
    "gp"."current_participants",
    "gp"."user_id" AS "owner_id",
    "p"."user_id",
    "p"."payment_status",
    "p"."quantity",
    "p"."last_read_at",
    COALESCE(( SELECT "o"."buyer_plaza_id"
           FROM "public"."group_buying_orders" "o"
          WHERE (("o"."post_id" = "gp"."id") AND ("o"."buyer_id" = "p"."user_id"))
          ORDER BY "o"."created_at"
         LIMIT 1), "gp"."plaza_id") AS "buyer_plaza_id",
    ( SELECT COALESCE("m"."content",
                CASE
                    WHEN ("m"."image_url" IS NOT NULL) THEN '[사진]'::"text"
                    ELSE '[공지]'::"text"
                END) AS "coalesce"
           FROM "public"."group_buying_chat_messages" "m"
          WHERE ("m"."post_id" = "gp"."id")
          ORDER BY "m"."created_at" DESC
         LIMIT 1) AS "last_message",
    ( SELECT "m"."created_at"
           FROM "public"."group_buying_chat_messages" "m"
          WHERE ("m"."post_id" = "gp"."id")
          ORDER BY "m"."created_at" DESC
         LIMIT 1) AS "last_message_at",
    ( SELECT ("count"(*))::integer AS "count"
           FROM "public"."group_buying_chat_messages" "m"
          WHERE (("m"."post_id" = "gp"."id") AND ("m"."created_at" > "p"."last_read_at") AND ("m"."user_id" <> "p"."user_id"))) AS "unread_count"
   FROM ("public"."group_buying_participants" "p"
     JOIN "public"."group_buying_posts" "gp" ON (("gp"."id" = "p"."post_id")))
  WHERE ("gp"."status" = ANY (ARRAY['pending_payment'::"text", 'in_progress'::"text", 'completed'::"text"]));


--
-- Name: new_store_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."new_store_likes" (
    "user_id" "uuid" NOT NULL,
    "post_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "new_store_likes_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: new_store_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."new_store_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "store_name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "category" "text" NOT NULL,
    "address" "text" NOT NULL,
    "phone" "text",
    "opening_date" "date",
    "opening_event" "text",
    "images" "text"[],
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "views" integer DEFAULT 0,
    "likes" integer DEFAULT 0,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    "bumped_at" timestamp with time zone,
    "effective_at" timestamp with time zone GENERATED ALWAYS AS (COALESCE("bumped_at", "created_at")) STORED,
    "lat" double precision,
    "lng" double precision,
    "region_id" "uuid",
    CONSTRAINT "new_store_posts_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL)),
    CONSTRAINT "new_store_posts_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'closed'::"text"])))
);


--
-- Name: notices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."notices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "is_pinned" boolean DEFAULT false NOT NULL,
    "is_published" boolean DEFAULT true NOT NULL,
    "author_id" "uuid",
    "view_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "notices_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "link" "text",
    "property_id" "uuid",
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "thumbnail_url" "text",
    "actor_id" "uuid",
    "plaza_id" "text" DEFAULT 'chuncheon'::"text"
);


--
-- Name: page_heroes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."page_heroes" (
    "page_key" "text" NOT NULL,
    "image_url" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "page_heroes_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: payment_webhooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."payment_webhooks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pg_provider" "text" NOT NULL,
    "pg_payment_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "raw_body" "jsonb",
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "plaza_id" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "reference_type" "text",
    "reference_id" "uuid",
    "amount" integer NOT NULL,
    "vat_amount" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "pg_provider" "text",
    "pg_payment_id" "text",
    "pg_method" "text",
    "pg_raw_response" "jsonb",
    "receipt_url" "text",
    "memo" "text",
    "paid_at" timestamp with time zone,
    "refunded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payments_kind_check" CHECK (("kind" = ANY (ARRAY['subscription'::"text", 'boost'::"text", 'push_credit'::"text", 'ad_banner'::"text", 'commission_payout'::"text", 'manual'::"text"]))),
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'succeeded'::"text", 'failed'::"text", 'canceled'::"text", 'refunded'::"text", 'partially_refunded'::"text"])))
);


--
-- Name: TABLE "payments"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."payments" IS '결제 이력 — 모든 결제 (구독/부스트/푸시/광고/거래 분배 송금) 통합 기록.';


--
-- Name: payout_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."payout_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "total_gross_amount" integer DEFAULT 0 NOT NULL,
    "total_hq_amount" integer DEFAULT 0 NOT NULL,
    "total_plaza_amount" integer DEFAULT 0 NOT NULL,
    "plaza_count" integer DEFAULT 0 NOT NULL,
    "notes" "text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "payout_batches_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text", 'partial'::"text"])))
);


--
-- Name: TABLE "payout_batches"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."payout_batches" IS '월말 정산 배치 — 매월 N일 자동 생성, 광장별 합계 계산.';


--
-- Name: payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_id" "uuid",
    "plaza_association_id" "uuid" NOT NULL,
    "plaza_id" "text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "gross_amount" integer NOT NULL,
    "hq_fee_amount" integer NOT NULL,
    "net_amount" integer NOT NULL,
    "transfer_method" "text" DEFAULT 'manual_bank'::"text" NOT NULL,
    "transfer_reference" "text",
    "bank_name" "text",
    "bank_account" "text",
    "bank_holder" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "tax_invoice_issued" boolean DEFAULT false NOT NULL,
    "tax_invoice_url" "text",
    "approved_at" timestamp with time zone,
    "approved_by" "uuid",
    "transferred_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payouts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'transferred'::"text", 'failed'::"text", 'disputed'::"text", 'refunded'::"text"]))),
    CONSTRAINT "payouts_transfer_method_check" CHECK (("transfer_method" = ANY (ARRAY['manual_bank'::"text", 'pg_split'::"text", 'pg_payout'::"text", 'offset'::"text"])))
);


--
-- Name: TABLE "payouts"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."payouts" IS '광장 협회별 월별 정산 내역 — 본사 20% / 협회 80%.';


--
-- Name: plaza_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."plaza_admins" (
    "user_id" "uuid" NOT NULL,
    "plaza_id" "text" NOT NULL,
    "role" "text" DEFAULT 'admin'::"text" NOT NULL,
    "granted_by" "uuid",
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "plaza_admins_role_check" CHECK (("role" = ANY (ARRAY['super'::"text", 'owner'::"text", 'admin'::"text", 'moderator'::"text", 'finance'::"text", 'content'::"text", 'support'::"text", 'viewer'::"text"])))
);


--
-- Name: plaza_associations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."plaza_associations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plaza_id" "text" NOT NULL,
    "business_name" "text" NOT NULL,
    "business_number" "text" NOT NULL,
    "ceo_name" "text" NOT NULL,
    "bank_name" "text" NOT NULL,
    "bank_account" "text" NOT NULL,
    "bank_holder" "text" NOT NULL,
    "contact_email" "text" NOT NULL,
    "contact_phone" "text",
    "address" "text",
    "business_doc_url" "text",
    "bankbook_doc_url" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "royalty_rate" numeric(5,2) DEFAULT 20.00 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_at" timestamp with time zone,
    "approved_by" "uuid",
    CONSTRAINT "plaza_associations_royalty_rate_check" CHECK ((("royalty_rate" >= (0)::numeric) AND ("royalty_rate" <= (100)::numeric))),
    CONSTRAINT "plaza_associations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'suspended'::"text", 'terminated'::"text"])))
);


--
-- Name: TABLE "plaza_associations"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."plaza_associations" IS '광장 협회 = 각 광장의 운영 사업자. 본사와 별개 사업자.';


--
-- Name: COLUMN "plaza_associations"."royalty_rate"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."plaza_associations"."royalty_rate" IS '본사 수취 비율(%). 기본 20% — 광장 협회는 80% 수취.';


--
-- Name: plaza_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."plaza_profiles" (
    "user_id" "uuid" NOT NULL,
    "plaza_id" "text" NOT NULL,
    "nickname" "text",
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sub_region" "text",
    "avatar_url" "text",
    "bio" "text",
    "phone" "text",
    "background_url" "text",
    "account_type" "text" DEFAULT 'user'::"text",
    "business_hours" "text",
    "specialties" "text"[],
    "service_areas" "text"[],
    "website" "text",
    "kakao_id" "text",
    "location" "text",
    "region_id" "uuid",
    "trust_score" numeric,
    "review_count" integer DEFAULT 0 NOT NULL
);


--
-- Name: COLUMN "plaza_profiles"."sub_region"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."plaza_profiles"."sub_region" IS '이 광장에 속한 회원의 세부 지역 (광장 가입 시 선택).';


--
-- Name: plaza_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."plaza_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plaza_id" "text" NOT NULL,
    "key" "text" NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: TABLE "plaza_settings"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."plaza_settings" IS '광장별 키-값 설정. site_settings와 유사하나 광장 단위로 격리.';


--
-- Name: plaza_settlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."plaza_settlements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plaza_id" "text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "total_revenue" bigint DEFAULT 0 NOT NULL,
    "platform_fee" bigint DEFAULT 0 NOT NULL,
    "net_amount" bigint DEFAULT 0 NOT NULL,
    "commission_rate" numeric(5,2) DEFAULT 10.00 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "memo" "text",
    "settled_at" timestamp with time zone,
    "settled_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "plaza_settlements_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'settled'::"text", 'paid'::"text"])))
);


--
-- Name: TABLE "plaza_settlements"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."plaza_settlements" IS '광장별 정산 내역. 기간별 매출/수수료/분배금 기록.';


--
-- Name: plazas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."plazas" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "parent_region" "text",
    "center_lat" numeric(10,6),
    "center_lng" numeric(10,6),
    "bounds" "jsonb",
    "theme" "jsonb" DEFAULT '{}'::"jsonb",
    "is_active" boolean DEFAULT false NOT NULL,
    "is_open_soon" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "coverage" "text"[] DEFAULT '{}'::"text"[],
    "tour_area_code" "text",
    "tour_sigungu_code" "text",
    "portone_store_id" "text",
    "portone_channel_key" "text",
    "pg_provider" "text" DEFAULT 'mock'::"text",
    "business_number" "text",
    "business_name" "text",
    "business_holder" "text",
    "settlement_email" "text",
    "payments_enabled" boolean DEFAULT false NOT NULL,
    "business_info" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


--
-- Name: COLUMN "plazas"."portone_store_id"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."plazas"."portone_store_id" IS '민감정보 — service_role 만 조회. PortOne 결제 채널 식별자.';


--
-- Name: COLUMN "plazas"."portone_channel_key"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."plazas"."portone_channel_key" IS '민감정보 — service_role 만 조회. PortOne 채널 키.';


--
-- Name: COLUMN "plazas"."business_number"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."plazas"."business_number" IS '민감정보 — service_role 만 조회. 사업자등록번호.';


--
-- Name: COLUMN "plazas"."business_holder"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."plazas"."business_holder" IS '민감정보 — service_role 만 조회. 대표자명.';


--
-- Name: COLUMN "plazas"."settlement_email"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."plazas"."settlement_email" IS '민감정보 — service_role 만 조회. 정산 메일.';


--
-- Name: COLUMN "plazas"."business_info"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."plazas"."business_info" IS '광장별 사업자 정보 (상호·대표자·사업자번호·통신판매업신고·주소·연락처 등). 약관·푸터·면책고지 렌더링에 사용.';


--
-- Name: point_daily_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."point_daily_counters" (
    "user_id" "uuid" NOT NULL,
    "rule_id" "text" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "count" integer DEFAULT 0 NOT NULL
);


--
-- Name: TABLE "point_daily_counters"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."point_daily_counters" IS '일일 적립 한도 추적용. 자정 지나면 새 row.';


--
-- Name: point_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."point_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "amount" integer NOT NULL,
    "balance" integer NOT NULL,
    "type" "text" NOT NULL,
    "reason" "text",
    "related_id" "uuid",
    "related_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone,
    "admin_id" "uuid"
);


--
-- Name: point_redemption_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."point_redemption_settings" (
    "category" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "max_redemption_pct" integer DEFAULT 30 NOT NULL,
    "exchange_rate" integer DEFAULT 1 NOT NULL,
    "daily_limit_pt" integer,
    "min_balance_required" integer DEFAULT 0 NOT NULL,
    "required_account_age_days" integer DEFAULT 30 NOT NULL,
    "description" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "point_redemption_settings_max_redemption_pct_check" CHECK ((("max_redemption_pct" >= 0) AND ("max_redemption_pct" <= 100)))
);


--
-- Name: TABLE "point_redemption_settings"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."point_redemption_settings" IS '카테고리별 포인트 사용 정책.';


--
-- Name: point_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."point_rules" (
    "id" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "amount" integer NOT NULL,
    "daily_cap" integer,
    "weekly_cap" integer,
    "cooldown_seconds" integer DEFAULT 0 NOT NULL,
    "quality_threshold" "jsonb" DEFAULT '{}'::"jsonb",
    "evaluation_period_hours" integer DEFAULT 24 NOT NULL,
    "required_account_age_days" integer DEFAULT 7 NOT NULL,
    "required_phone_verified" boolean DEFAULT true NOT NULL,
    "required_email_verified" boolean DEFAULT true NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "description" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "point_rules_amount_nonneg" CHECK (("amount" >= 0))
);


--
-- Name: TABLE "point_rules"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."point_rules" IS '활동별 적립 규칙. 관리자 페이지에서 조정.';


--
-- Name: point_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."point_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plaza_id" "text",
    "type" "text" NOT NULL,
    "amount" integer NOT NULL,
    "source" "text" NOT NULL,
    "source_id" "uuid",
    "rule_id" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "evaluation_at" timestamp with time zone,
    "confirmed_at" timestamp with time zone,
    "reverted_at" timestamp with time zone,
    "reverted_reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "point_transactions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'reverted'::"text"]))),
    CONSTRAINT "point_transactions_type_check" CHECK (("type" = ANY (ARRAY['earn'::"text", 'spend'::"text", 'revert'::"text", 'expire'::"text", 'manual_adjust'::"text", 'penalty'::"text", 'event'::"text"])))
);


--
-- Name: TABLE "point_transactions"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."point_transactions" IS '포인트 거래 — 모든 적립/사용/회수 기록.';


--
-- Name: popular_searches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."popular_searches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "keyword" "text" NOT NULL,
    "user_id" "uuid",
    "context" "text" DEFAULT 'global'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "popular_searches_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: popups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."popups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text",
    "image_url" "text",
    "link_url" "text",
    "position_x" integer DEFAULT 100,
    "position_y" integer DEFAULT 100,
    "width" integer DEFAULT 400,
    "height" integer DEFAULT 300,
    "start_date" timestamp with time zone,
    "end_date" timestamp with time zone,
    "is_active" boolean DEFAULT true,
    "show_today_hide" boolean DEFAULT true,
    "display_pages" "text"[] DEFAULT ARRAY['home'::"text"],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "position" "text" DEFAULT 'center'::"text",
    "start_at" timestamp with time zone,
    "end_at" timestamp with time zone,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "popups_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: post_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."post_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "target_user_id" "uuid",
    "reason" "text" NOT NULL,
    "reason_detail" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "resolved_by" "uuid",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "post_reports_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: TABLE "post_reports"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."post_reports" IS '게시글 신고 기록 (모든 게시판 통합)';


--
-- Name: producer_settlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."producer_settlements" (
    "user_id" "uuid" NOT NULL,
    "bank_code" "text",
    "bank_name" "text",
    "bank_account" "text",
    "account_holder" "text",
    "business_number" "text",
    "is_verified" boolean DEFAULT false NOT NULL,
    "verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: profile_highlights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."profile_highlights" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "cover_url" "text",
    "link_url" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "media_url" "text",
    "media_type" "text" DEFAULT 'image'::"text",
    "duration_ms" integer DEFAULT 5000,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text" NOT NULL,
    CONSTRAINT "profile_highlights_media_type_check" CHECK (("media_type" = ANY (ARRAY['image'::"text", 'video'::"text"])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."profiles" (
    "id" "uuid" NOT NULL,
    "nickname" "text",
    "phone" "text",
    "avatar_url" "text",
    "location" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "account_type" "text" DEFAULT 'individual'::"text",
    "role" "text" DEFAULT 'user'::"text",
    "full_name" "text",
    "last_seen" timestamp with time zone DEFAULT "now"(),
    "trust_score" numeric(3,1) DEFAULT 36.5,
    "review_count" integer DEFAULT 0,
    "bio" "text",
    "is_admin" boolean DEFAULT false,
    "username" "text",
    "points" integer DEFAULT 0,
    "is_verified" boolean DEFAULT false,
    "verified_at" timestamp with time zone,
    "verification_type" "text",
    "cover_url" "text",
    "business_hours" "text",
    "specialties" "text"[],
    "service_areas" "text"[],
    "website" "text",
    "kakao_id" "text",
    "response_rate" integer,
    "avg_response_minutes" integer,
    "completed_deals" integer DEFAULT 0,
    "is_verified_phone" boolean DEFAULT false,
    "is_verified_business" boolean DEFAULT false,
    "is_verified_license" boolean DEFAULT false,
    "posts_public" boolean DEFAULT true NOT NULL,
    "video_credits" integer DEFAULT 0 NOT NULL,
    "sub_region" "text",
    "notif_chat" boolean DEFAULT true NOT NULL,
    "notif_property" boolean DEFAULT true NOT NULL,
    "notif_marketing" boolean DEFAULT false NOT NULL,
    CONSTRAINT "profiles_account_type_check" CHECK (("account_type" = ANY (ARRAY['individual'::"text", 'agent'::"text", 'interior'::"text", 'moving'::"text", 'cleaning'::"text", 'repair'::"text", 'admin'::"text", 'producer'::"text", 'business'::"text"]))),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'admin'::"text", 'superadmin'::"text"])))
);


--
-- Name: COLUMN "profiles"."posts_public"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."profiles"."posts_public" IS '프로필 "게시물" 탭의 공개 여부. false 면 본인 외에는 게시물 목록이 보이지 않는다.';


--
-- Name: COLUMN "profiles"."video_credits"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."profiles"."video_credits" IS 'AI 홍보영상 크레딧(포인트 단위). 10포인트 = 1크레딧. 15초=5pt/30초=10pt/60초=20pt';


--
-- Name: COLUMN "profiles"."sub_region"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."profiles"."sub_region" IS '광장 내 세부 지역. plazas.coverage 의 한 항목. NULL 이면 전체 광장 뉴스.';


--
-- Name: COLUMN "profiles"."notif_chat"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."profiles"."notif_chat" IS '채팅 메시지 알림 수신 여부';


--
-- Name: COLUMN "profiles"."notif_property"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."profiles"."notif_property" IS '관심 매물 알림 수신 여부';


--
-- Name: COLUMN "profiles"."notif_marketing"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."profiles"."notif_marketing" IS '마케팅/프로모션 알림 수신 여부';


--
-- Name: profile_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."profile_stats" WITH ("security_invoker"='true') AS
 SELECT "id" AS "user_id",
    COALESCE(( SELECT "count"(*) AS "count"
           FROM "public"."follows" "f"
          WHERE ("f"."following_id" = "p"."id")), (0)::bigint) AS "followers_count",
    COALESCE(( SELECT "count"(*) AS "count"
           FROM "public"."follows" "f"
          WHERE ("f"."follower_id" = "p"."id")), (0)::bigint) AS "following_count"
   FROM "public"."profiles" "p";


--
-- Name: properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."properties" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "property_type" "text" NOT NULL,
    "transaction_type" "text" NOT NULL,
    "price" bigint NOT NULL,
    "monthly_rent" bigint,
    "maintenance_fee" bigint DEFAULT 0,
    "area_sqm" numeric(10,2) NOT NULL,
    "floor_info" "text",
    "total_floors" integer,
    "rooms" integer DEFAULT 1,
    "bathrooms" integer DEFAULT 1,
    "direction" "text",
    "parking" boolean DEFAULT false,
    "elevator" boolean DEFAULT false,
    "pet_allowed" boolean DEFAULT false,
    "move_in_date" "date",
    "address" "text" NOT NULL,
    "address_detail" "text",
    "latitude" numeric(10,7),
    "longitude" numeric(10,7),
    "description" "text",
    "features" "text"[],
    "images" "text"[],
    "status" "text" DEFAULT 'active'::"text",
    "views" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "seller_type" "text" DEFAULT 'individual'::"text",
    "is_featured" boolean DEFAULT false,
    "instagram_post_url" "text",
    "youtube_post_url" "text",
    "lat" double precision,
    "lng" double precision,
    "ai_video_url" "text",
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    "panorama_images" "jsonb" DEFAULT '[]'::"jsonb",
    "bumped_at" timestamp with time zone,
    "effective_at" timestamp with time zone GENERATED ALWAYS AS (COALESCE("bumped_at", "created_at")) STORED,
    "hidden_reason" "text",
    "region_id" "uuid",
    CONSTRAINT "properties_coords_range_chk" CHECK (((("lat" IS NULL) AND ("lng" IS NULL)) OR ((("lat" >= (32.0)::double precision) AND ("lat" <= (39.5)::double precision)) AND (("lng" >= (124.0)::double precision) AND ("lng" <= (132.5)::double precision))))),
    CONSTRAINT "properties_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL)),
    CONSTRAINT "properties_property_type_check" CHECK (("property_type" = ANY (ARRAY['아파트'::"text", '빌라'::"text", '오피스텔'::"text", '원룸'::"text", '투룸'::"text", '주택'::"text", '펜션'::"text", '상가'::"text", '사무실'::"text", '토지'::"text"]))),
    CONSTRAINT "properties_seller_type_check" CHECK (("seller_type" = ANY (ARRAY['individual'::"text", 'agent'::"text"]))),
    CONSTRAINT "properties_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'reserved'::"text", 'completed'::"text", 'hidden'::"text"]))),
    CONSTRAINT "properties_transaction_type_check" CHECK (("transaction_type" = ANY (ARRAY['매매'::"text", '전세'::"text", '월세'::"text"])))
);


--
-- Name: COLUMN "properties"."ai_video_url"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."properties"."ai_video_url" IS 'AI 로 생성된 홍보영상 MP4 URL (fal.ai + Supabase Storage)';


--
-- Name: COLUMN "properties"."panorama_images"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."properties"."panorama_images" IS '360° 가상 투어 이미지. [{url, title}] 형태. Pannellum 뷰어로 표시.';


--
-- Name: property_highlights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."property_highlights" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid" NOT NULL,
    "badge" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "start_at" timestamp with time zone,
    "end_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "property_highlights_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: property_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."property_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid" NOT NULL,
    "reporter_id" "uuid",
    "reason" "text" NOT NULL,
    "detail" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "admin_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "property_reports_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL)),
    CONSTRAINT "property_reports_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'reviewed'::"text", 'resolved'::"text", 'rejected'::"text"])))
);


--
-- Name: property_request_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."property_request_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "property_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "property_request_responses_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: property_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."property_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "region" "text",
    "district" "text",
    "dong" "text",
    "property_type" "text",
    "transaction_type" "text",
    "budget_min" bigint,
    "budget_max" bigint,
    "move_in_date" "date",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "views" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    "region_id" "uuid",
    CONSTRAINT "property_requests_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL)),
    CONSTRAINT "property_requests_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'matched'::"text", 'closed'::"text"])))
);


--
-- Name: refund_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."refund_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plaza_id" "text" NOT NULL,
    "order_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" integer NOT NULL,
    "reason" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "processed_at" timestamp with time zone,
    "processed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "refund_requests_amount_check" CHECK (("amount" > 0)),
    CONSTRAINT "refund_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


--
-- Name: TABLE "refund_requests"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."refund_requests" IS '환불 요청. 사용자가 신청하고 광장 관리자가 승인/반려.';


--
-- Name: regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."regions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "parent_id" "uuid",
    "level" integer DEFAULT 1,
    "is_active" boolean DEFAULT true,
    "order_index" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "code" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text"
);


--
-- Name: repair_favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."repair_favorites" (
    "user_id" "uuid" NOT NULL,
    "post_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "repair_favorites_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: repair_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."repair_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" character varying(200) NOT NULL,
    "content" "text" NOT NULL,
    "category" character varying(50) DEFAULT '설비수리'::character varying NOT NULL,
    "service_region" character varying(100),
    "service_district" character varying(100),
    "images" "text"[] DEFAULT '{}'::"text"[],
    "contact_phone" character varying(20),
    "min_price" integer,
    "max_price" integer,
    "price_unit" character varying(20) DEFAULT '만원'::character varying,
    "views" integer DEFAULT 0,
    "likes" integer DEFAULT 0,
    "status" character varying(20) DEFAULT 'active'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "service_dong" character varying(100),
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    "bumped_at" timestamp with time zone,
    "effective_at" timestamp with time zone GENERATED ALWAYS AS (COALESCE("bumped_at", "created_at")) STORED,
    "career_years" integer,
    "lat" double precision,
    "lng" double precision,
    "region_id" "uuid",
    CONSTRAINT "repair_posts_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reviewer_id" "uuid" NOT NULL,
    "reviewed_user_id" "uuid" NOT NULL,
    "property_id" "uuid",
    "chat_room_id" "uuid",
    "response_speed" integer,
    "accuracy" integer,
    "kindness" integer,
    "total_score" numeric(2,1) GENERATED ALWAYS AS ("round"((((("response_speed" + "accuracy") + "kindness"))::numeric / 3.0), 1)) STORED,
    "content" "text",
    "transaction_completed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "source_type" "text",
    "source_id" "uuid",
    "plaza_id" "text" NOT NULL,
    CONSTRAINT "reviews_accuracy_check" CHECK ((("accuracy" >= 1) AND ("accuracy" <= 5))),
    CONSTRAINT "reviews_kindness_check" CHECK ((("kindness" >= 1) AND ("kindness" <= 5))),
    CONSTRAINT "reviews_response_speed_check" CHECK ((("response_speed" >= 1) AND ("response_speed" <= 5)))
);


--
-- Name: search_queries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."search_queries" (
    "term" "text" NOT NULL,
    "count" bigint DEFAULT 1 NOT NULL,
    "last_searched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "first_searched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "search_queries_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: TABLE "search_queries"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."search_queries" IS '통합 검색 키워드 집계 (인기 검색어용)';


--
-- Name: search_term_blacklist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."search_term_blacklist" (
    "term" "text" NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


--
-- Name: TABLE "search_term_blacklist"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."search_term_blacklist" IS '관리자가 숨긴 검색어 (인기/제안에서 제외)';


--
-- Name: secondhand_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."secondhand_likes" (
    "user_id" "uuid" NOT NULL,
    "post_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "secondhand_likes_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: secondhand_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."secondhand_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "category" "text" DEFAULT '기타'::"text" NOT NULL,
    "price" integer DEFAULT 0 NOT NULL,
    "is_price_negotiable" boolean DEFAULT false NOT NULL,
    "images" "jsonb",
    "location" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "views" integer DEFAULT 0 NOT NULL,
    "likes" integer DEFAULT 0 NOT NULL,
    "report_count" integer DEFAULT 0 NOT NULL,
    "hidden_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    "bumped_at" timestamp with time zone,
    "effective_at" timestamp with time zone GENERATED ALWAYS AS (COALESCE("bumped_at", "created_at")) STORED,
    "condition" "text",
    "lat" double precision,
    "lng" double precision,
    "region_id" "uuid",
    CONSTRAINT "secondhand_posts_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: TABLE "secondhand_posts"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."secondhand_posts" IS '중고거래 게시글';


--
-- Name: COLUMN "secondhand_posts"."condition"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."secondhand_posts"."condition" IS '상품 상태. 권장 값: 새상품 / 거의 새것 / 사용감 적음 / 사용감 많음. NULL 허용.';


--
-- Name: service_request_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."service_request_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "plaza_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: service_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."service_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plaza_id" "text",
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "service_type" "text" NOT NULL,
    "region" "text",
    "district" "text",
    "dong" "text",
    "budget_min" bigint,
    "budget_max" bigint,
    "desired_date" "date",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "views" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_requests_service_type_check" CHECK (("service_type" = ANY (ARRAY['interior'::"text", 'moving'::"text", 'cleaning'::"text", 'repair'::"text"]))),
    CONSTRAINT "service_requests_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'matched'::"text", 'closed'::"text"])))
);


--
-- Name: sharing_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."sharing_likes" (
    "user_id" "uuid" NOT NULL,
    "post_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "sharing_likes_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: sharing_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."sharing_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "category" "text" DEFAULT '기타'::"text" NOT NULL,
    "images" "text"[],
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "location" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "views" integer DEFAULT 0,
    "likes" integer DEFAULT 0,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    "lat" double precision,
    "lng" double precision,
    "region_id" "uuid",
    "hidden_reason" "text",
    "bumped_at" timestamp with time zone,
    "effective_at" timestamp with time zone GENERATED ALWAYS AS (COALESCE("bumped_at", "created_at")) STORED,
    CONSTRAINT "sharing_posts_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL)),
    CONSTRAINT "sharing_posts_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'reserved'::"text", 'completed'::"text"])))
);


--
-- Name: site_labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."site_labels" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "fallback" "text" NOT NULL,
    "description" "text",
    "group_name" "text" DEFAULT 'misc'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "max_length" integer,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "image_url" "text",
    "recommended_size" "text"
);


--
-- Name: COLUMN "site_labels"."image_url"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."site_labels"."image_url" IS '슈퍼관리자가 업로드한 이미지 URL. 설정 시 텍스트/이모지 대신 이 이미지가 표시됨.';


--
-- Name: COLUMN "site_labels"."recommended_size"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."site_labels"."recommended_size" IS '권장 이미지 크기 안내. 예: "정사각 96x96px, PNG/WebP 권장"';


--
-- Name: site_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."site_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "value" "jsonb",
    "description" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid"
);


--
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."subscription_plans" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "monthly_price" integer NOT NULL,
    "early_bird_discount_pct" integer DEFAULT 50 NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "subscription_plans_category_check" CHECK (("category" = ANY (ARRAY['realtor'::"text", 'service'::"text", 'newstore'::"text", 'other'::"text"]))),
    CONSTRAINT "subscription_plans_early_bird_discount_pct_check" CHECK ((("early_bird_discount_pct" >= 0) AND ("early_bird_discount_pct" <= 100)))
);


--
-- Name: TABLE "subscription_plans"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."subscription_plans" IS '구독 플랜. 가격 변경 시 신규 가입자만 적용 (기존은 락인).';


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plaza_id" "text" NOT NULL,
    "plan_id" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "current_period_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "current_period_end" timestamp with time zone DEFAULT ("now"() + '1 mon'::interval) NOT NULL,
    "is_early_bird" boolean DEFAULT false NOT NULL,
    "applied_discount_pct" integer DEFAULT 0 NOT NULL,
    "billing_key" "text",
    "billing_key_provider" "text",
    "canceled_at" timestamp with time zone,
    "cancel_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "subscriptions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'past_due'::"text", 'canceled'::"text", 'expired'::"text", 'free_period'::"text"])))
);


--
-- Name: TABLE "subscriptions"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."subscriptions" IS '사용자별 구독. 6개월 무료기간 가입자는 free_period → 자동으로 active 전환.';


--
-- Name: support_inquiries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."support_inquiries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text",
    "email" "text",
    "phone" "text",
    "category" "text" DEFAULT 'general'::"text",
    "subject" "text" NOT NULL,
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "answer" "text",
    "answered_by" "uuid",
    "answered_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "support_inquiries_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL)),
    CONSTRAINT "support_inquiries_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'answered'::"text", 'closed'::"text"])))
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plaza_id" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "buyer_id" "uuid",
    "seller_id" "uuid",
    "reference_type" "text",
    "reference_id" "uuid",
    "gross_amount" integer NOT NULL,
    "commission_rate" numeric(5,2) NOT NULL,
    "commission_amount" integer NOT NULL,
    "net_amount" integer NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payment_id" "uuid",
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transactions_kind_check" CHECK (("kind" = ANY (ARRAY['group_buying'::"text", 'local_food'::"text", 'service_match'::"text", 'secondhand_safe'::"text"]))),
    CONSTRAINT "transactions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'canceled'::"text", 'refunded'::"text", 'disputed'::"text"])))
);


--
-- Name: TABLE "transactions"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."transactions" IS '거래 추적 — 공동구매/로컬푸드/서비스매칭 거래의 수수료 기준점.';


--
-- Name: user_bans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_bans" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plaza_id" "text" NOT NULL,
    "banned_by" "uuid",
    "reason" "text",
    "scope" "text" DEFAULT 'suspend'::"text" NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "lifted_at" timestamp with time zone,
    "lifted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: user_bans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."user_bans_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_bans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."user_bans_id_seq" OWNED BY "public"."user_bans"."id";


--
-- Name: user_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_flags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "flag_type" "text" NOT NULL,
    "severity" "text" DEFAULT 'low'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "reviewer_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_flags_flag_type_check" CHECK (("flag_type" = ANY (ARRAY['high_volume_posts'::"text", 'duplicate_images'::"text", 'multi_account_ip'::"text", 'manual_admin'::"text", 'reported_by_users'::"text"]))),
    CONSTRAINT "user_flags_severity_check" CHECK (("severity" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "user_flags_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'reviewed_clear'::"text", 'reviewed_warning'::"text", 'reviewed_suspended'::"text", 'reviewed_business_redirect'::"text"])))
);


--
-- Name: TABLE "user_flags"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."user_flags" IS '의심 패턴 자동 플래그 — cron 으로 매일 갱신, 관리자가 검토.';


--
-- Name: user_points; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_points" (
    "user_id" "uuid" NOT NULL,
    "plaza_id" "text",
    "available" integer DEFAULT 0 NOT NULL,
    "pending" integer DEFAULT 0 NOT NULL,
    "lifetime_earned" integer DEFAULT 0 NOT NULL,
    "lifetime_spent" integer DEFAULT 0 NOT NULL,
    "lifetime_reverted" integer DEFAULT 0 NOT NULL,
    "reputation_score" integer DEFAULT 100 NOT NULL,
    "is_suspended" boolean DEFAULT false NOT NULL,
    "suspended_reason" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_points_available_nonneg" CHECK (("available" >= 0)),
    CONSTRAINT "user_points_reputation_score_check" CHECK ((("reputation_score" >= 0) AND ("reputation_score" <= 100)))
);


--
-- Name: TABLE "user_points"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."user_points" IS '사용자 포인트 잔액 + 신뢰도 점수.';


--
-- Name: COLUMN "user_points"."reputation_score"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."user_points"."reputation_score" IS '0~100. 80+ 100% 적립, 50~79 70%, 30~49 30%, 0~29 정지.';


--
-- Name: user_push_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "provider" "text" DEFAULT 'expo'::"text" NOT NULL,
    "device_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_push_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text", 'web'::"text"]))),
    CONSTRAINT "user_push_tokens_provider_check" CHECK (("provider" = ANY (ARRAY['expo'::"text", 'fcm'::"text", 'apns'::"text"])))
);


--
-- Name: TABLE "user_push_tokens"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."user_push_tokens" IS '디바이스 푸시 토큰 (expo/fcm/apns)';


--
-- Name: verification_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."verification_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "type" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "company_name" "text",
    "representative_name" "text",
    "phone" "text",
    "address" "text",
    "license_number" "text",
    "license_image_url" "text",
    "office_name" "text",
    "business_number" "text",
    "business_license_url" "text",
    "business_type" "text",
    "farm_name" "text",
    "farm_address" "text",
    "certification_type" "text",
    "certification_url" "text",
    "service_type" "text",
    "experience_years" integer,
    "portfolio_urls" "text"[],
    "certifications" "text"[],
    "reject_reason" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "data" "jsonb",
    "documents" "text"[],
    "plaza_id" "text"
);


--
-- Name: visitor_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."visitor_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "session_id" "text",
    "ip_address" "text",
    "user_agent" "text",
    "referer" "text",
    "page_url" "text",
    "visited_at" timestamp with time zone DEFAULT "now"(),
    "device_type" "text",
    "browser" "text",
    "os" "text",
    "country" "text",
    "city" "text",
    "path" "text",
    "referrer" "text",
    "ip_hash" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plaza_id" "text" DEFAULT 'chuncheon'::"text",
    CONSTRAINT "visitor_logs_plaza_id_not_null" CHECK (("plaza_id" IS NOT NULL))
);


--
-- Name: admin_actions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_actions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."admin_actions_id_seq"'::"regclass");


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."audit_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."audit_log_id_seq"'::"regclass");


--
-- Name: user_bans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_bans" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."user_bans_id_seq"'::"regclass");


--
-- Name: account_type_requests account_type_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."account_type_requests"
    ADD CONSTRAINT "account_type_requests_pkey" PRIMARY KEY ("id");


--
-- Name: admin_actions admin_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_actions"
    ADD CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id");


--
-- Name: admin_backup_logs admin_backup_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_backup_logs"
    ADD CONSTRAINT "admin_backup_logs_pkey" PRIMARY KEY ("id");


--
-- Name: admin_mail_log admin_mail_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_mail_log"
    ADD CONSTRAINT "admin_mail_log_pkey" PRIMARY KEY ("id");


--
-- Name: admin_permissions admin_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_permissions"
    ADD CONSTRAINT "admin_permissions_pkey" PRIMARY KEY ("id");


--
-- Name: admin_permissions admin_permissions_user_id_menu_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_permissions"
    ADD CONSTRAINT "admin_permissions_user_id_menu_id_key" UNIQUE ("user_id", "menu_id");


--
-- Name: admin_user_memos admin_user_memos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_user_memos"
    ADD CONSTRAINT "admin_user_memos_pkey" PRIMARY KEY ("id");


--
-- Name: admin_user_memos admin_user_memos_user_id_plaza_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_user_memos"
    ADD CONSTRAINT "admin_user_memos_user_id_plaza_id_key" UNIQUE ("user_id", "plaza_id");


--
-- Name: ai_video_jobs ai_video_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_video_jobs"
    ADD CONSTRAINT "ai_video_jobs_pkey" PRIMARY KEY ("id");


--
-- Name: app_versions app_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."app_versions"
    ADD CONSTRAINT "app_versions_pkey" PRIMARY KEY ("id");


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");


--
-- Name: block_users block_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."block_users"
    ADD CONSTRAINT "block_users_pkey" PRIMARY KEY ("blocker_id", "blocked_id");


--
-- Name: board_categories board_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."board_categories"
    ADD CONSTRAINT "board_categories_pkey" PRIMARY KEY ("id");


--
-- Name: board_categories board_categories_plaza_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."board_categories"
    ADD CONSTRAINT "board_categories_plaza_slug_key" UNIQUE ("plaza_id", "slug");


--
-- Name: board_comments board_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."board_comments"
    ADD CONSTRAINT "board_comments_pkey" PRIMARY KEY ("id");


--
-- Name: board_post_likes board_post_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."board_post_likes"
    ADD CONSTRAINT "board_post_likes_pkey" PRIMARY KEY ("id");


--
-- Name: board_post_likes board_post_likes_post_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."board_post_likes"
    ADD CONSTRAINT "board_post_likes_post_id_user_id_key" UNIQUE ("post_id", "user_id");


--
-- Name: board_posts board_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."board_posts"
    ADD CONSTRAINT "board_posts_pkey" PRIMARY KEY ("id");


--
-- Name: boost_orders boost_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."boost_orders"
    ADD CONSTRAINT "boost_orders_pkey" PRIMARY KEY ("id");


--
-- Name: boost_pricing boost_pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."boost_pricing"
    ADD CONSTRAINT "boost_pricing_pkey" PRIMARY KEY ("tier");


--
-- Name: bump_daily bump_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bump_daily"
    ADD CONSTRAINT "bump_daily_pkey" PRIMARY KEY ("user_id", "plaza_id", "target_type", "date");


--
-- Name: bump_history bump_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bump_history"
    ADD CONSTRAINT "bump_history_pkey" PRIMARY KEY ("id");


--
-- Name: bump_settings bump_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bump_settings"
    ADD CONSTRAINT "bump_settings_pkey" PRIMARY KEY ("target_type");


--
-- Name: bump_ticket_orders bump_ticket_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bump_ticket_orders"
    ADD CONSTRAINT "bump_ticket_orders_pkey" PRIMARY KEY ("id");


--
-- Name: bump_ticket_packs bump_ticket_packs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bump_ticket_packs"
    ADD CONSTRAINT "bump_ticket_packs_pkey" PRIMARY KEY ("id");


--
-- Name: bump_tickets bump_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bump_tickets"
    ADD CONSTRAINT "bump_tickets_pkey" PRIMARY KEY ("user_id", "plaza_id");


--
-- Name: business_declarations business_declarations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."business_declarations"
    ADD CONSTRAINT "business_declarations_pkey" PRIMARY KEY ("id");


--
-- Name: business_declarations business_declarations_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."business_declarations"
    ADD CONSTRAINT "business_declarations_user_id_key" UNIQUE ("user_id");


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");


--
-- Name: chat_room_participants chat_room_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chat_room_participants"
    ADD CONSTRAINT "chat_room_participants_pkey" PRIMARY KEY ("id");


--
-- Name: chat_room_participants chat_room_participants_room_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chat_room_participants"
    ADD CONSTRAINT "chat_room_participants_room_id_user_id_key" UNIQUE ("room_id", "user_id");


--
-- Name: chat_rooms chat_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chat_rooms"
    ADD CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id");


--
-- Name: chat_rooms chat_rooms_property_id_buyer_id_seller_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chat_rooms"
    ADD CONSTRAINT "chat_rooms_property_id_buyer_id_seller_id_key" UNIQUE ("property_id", "buyer_id", "seller_id");


--
-- Name: chuncheon_events chuncheon_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chuncheon_events"
    ADD CONSTRAINT "chuncheon_events_pkey" PRIMARY KEY ("id");


--
-- Name: cleaning_favorites cleaning_favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cleaning_favorites"
    ADD CONSTRAINT "cleaning_favorites_pkey" PRIMARY KEY ("user_id", "post_id");


--
-- Name: cleaning_posts cleaning_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cleaning_posts"
    ADD CONSTRAINT "cleaning_posts_pkey" PRIMARY KEY ("id");


--
-- Name: club_chat_messages club_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."club_chat_messages"
    ADD CONSTRAINT "club_chat_messages_pkey" PRIMARY KEY ("id");


--
-- Name: club_likes club_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."club_likes"
    ADD CONSTRAINT "club_likes_pkey" PRIMARY KEY ("id");


--
-- Name: club_likes club_likes_user_id_club_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."club_likes"
    ADD CONSTRAINT "club_likes_user_id_club_id_key" UNIQUE ("user_id", "club_id");


--
-- Name: club_members club_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."club_members"
    ADD CONSTRAINT "club_members_pkey" PRIMARY KEY ("club_id", "user_id");


--
-- Name: clubs clubs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clubs"
    ADD CONSTRAINT "clubs_pkey" PRIMARY KEY ("id");


--
-- Name: commission_rates commission_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."commission_rates"
    ADD CONSTRAINT "commission_rates_pkey" PRIMARY KEY ("id");


--
-- Name: commission_settings commission_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."commission_settings"
    ADD CONSTRAINT "commission_settings_pkey" PRIMARY KEY ("category");


--
-- Name: commission_splits commission_splits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."commission_splits"
    ADD CONSTRAINT "commission_splits_pkey" PRIMARY KEY ("id");


--
-- Name: credit_purchases credit_purchases_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."credit_purchases"
    ADD CONSTRAINT "credit_purchases_order_id_key" UNIQUE ("order_id");


--
-- Name: credit_purchases credit_purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."credit_purchases"
    ADD CONSTRAINT "credit_purchases_pkey" PRIMARY KEY ("id");


--
-- Name: cron_run_log cron_run_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cron_run_log"
    ADD CONSTRAINT "cron_run_log_pkey" PRIMARY KEY ("id");


--
-- Name: expert_invitations expert_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."expert_invitations"
    ADD CONSTRAINT "expert_invitations_pkey" PRIMARY KEY ("id");


--
-- Name: faqs faqs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."faqs"
    ADD CONSTRAINT "faqs_pkey" PRIMARY KEY ("id");


--
-- Name: favorites favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_pkey" PRIMARY KEY ("id");


--
-- Name: favorites favorites_user_id_property_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_property_id_key" UNIQUE ("user_id", "property_id");


--
-- Name: favorites favorites_user_property_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_property_key" UNIQUE ("user_id", "property_id");


--
-- Name: feature_flags feature_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."feature_flags"
    ADD CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key");


--
-- Name: follows follows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_pkey" PRIMARY KEY ("follower_id", "following_id");


--
-- Name: group_buying_chat_messages group_buying_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."group_buying_chat_messages"
    ADD CONSTRAINT "group_buying_chat_messages_pkey" PRIMARY KEY ("id");


--
-- Name: group_buying_orders group_buying_orders_pg_merchant_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."group_buying_orders"
    ADD CONSTRAINT "group_buying_orders_pg_merchant_uid_key" UNIQUE ("pg_merchant_uid");


--
-- Name: group_buying_orders group_buying_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."group_buying_orders"
    ADD CONSTRAINT "group_buying_orders_pkey" PRIMARY KEY ("id");


--
-- Name: group_buying_participants group_buying_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."group_buying_participants"
    ADD CONSTRAINT "group_buying_participants_pkey" PRIMARY KEY ("id");


--
-- Name: group_buying_participants group_buying_participants_post_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."group_buying_participants"
    ADD CONSTRAINT "group_buying_participants_post_id_user_id_key" UNIQUE ("post_id", "user_id");


--
-- Name: group_buying_posts group_buying_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."group_buying_posts"
    ADD CONSTRAINT "group_buying_posts_pkey" PRIMARY KEY ("id");


--
-- Name: group_buying_wishlist group_buying_wishlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."group_buying_wishlist"
    ADD CONSTRAINT "group_buying_wishlist_pkey" PRIMARY KEY ("id");


--
-- Name: group_buying_wishlist group_buying_wishlist_post_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."group_buying_wishlist"
    ADD CONSTRAINT "group_buying_wishlist_post_id_user_id_key" UNIQUE ("post_id", "user_id");


--
-- Name: hero_banners hero_banners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."hero_banners"
    ADD CONSTRAINT "hero_banners_pkey" PRIMARY KEY ("id");


--
-- Name: homepage_menu homepage_menu_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."homepage_menu"
    ADD CONSTRAINT "homepage_menu_pkey" PRIMARY KEY ("id");


--
-- Name: homepage_slider homepage_slider_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."homepage_slider"
    ADD CONSTRAINT "homepage_slider_pkey" PRIMARY KEY ("id");


--
-- Name: interior_favorites interior_favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."interior_favorites"
    ADD CONSTRAINT "interior_favorites_pkey" PRIMARY KEY ("id");


--
-- Name: interior_favorites interior_favorites_user_id_post_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."interior_favorites"
    ADD CONSTRAINT "interior_favorites_user_id_post_id_key" UNIQUE ("user_id", "post_id");


--
-- Name: interior_posts interior_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."interior_posts"
    ADD CONSTRAINT "interior_posts_pkey" PRIMARY KEY ("id");


--
-- Name: jobs_likes jobs_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."jobs_likes"
    ADD CONSTRAINT "jobs_likes_pkey" PRIMARY KEY ("user_id", "post_id");


--
-- Name: jobs_posts jobs_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."jobs_posts"
    ADD CONSTRAINT "jobs_posts_pkey" PRIMARY KEY ("id");


--
-- Name: local_food_likes local_food_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_food_likes"
    ADD CONSTRAINT "local_food_likes_pkey" PRIMARY KEY ("id");


--
-- Name: local_food_likes local_food_likes_user_id_local_food_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_food_likes"
    ADD CONSTRAINT "local_food_likes_user_id_local_food_id_key" UNIQUE ("user_id", "local_food_id");


--
-- Name: local_food_order_items local_food_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_food_order_items"
    ADD CONSTRAINT "local_food_order_items_pkey" PRIMARY KEY ("id");


--
-- Name: local_food_orders local_food_orders_pg_merchant_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_food_orders"
    ADD CONSTRAINT "local_food_orders_pg_merchant_uid_key" UNIQUE ("pg_merchant_uid");


--
-- Name: local_food_orders local_food_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_food_orders"
    ADD CONSTRAINT "local_food_orders_pkey" PRIMARY KEY ("id");


--
-- Name: local_food local_food_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_food"
    ADD CONSTRAINT "local_food_pkey" PRIMARY KEY ("id");


--
-- Name: maintenance_settings maintenance_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."maintenance_settings"
    ADD CONSTRAINT "maintenance_settings_pkey" PRIMARY KEY ("id");


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");


--
-- Name: moderation_keywords moderation_keywords_keyword_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."moderation_keywords"
    ADD CONSTRAINT "moderation_keywords_keyword_key" UNIQUE ("keyword");


--
-- Name: moderation_keywords moderation_keywords_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."moderation_keywords"
    ADD CONSTRAINT "moderation_keywords_pkey" PRIMARY KEY ("id");


--
-- Name: moving_favorites moving_favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."moving_favorites"
    ADD CONSTRAINT "moving_favorites_pkey" PRIMARY KEY ("user_id", "post_id");


--
-- Name: moving_posts moving_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."moving_posts"
    ADD CONSTRAINT "moving_posts_pkey" PRIMARY KEY ("id");


--
-- Name: new_store_likes new_store_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."new_store_likes"
    ADD CONSTRAINT "new_store_likes_pkey" PRIMARY KEY ("user_id", "post_id");


--
-- Name: new_store_posts new_store_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."new_store_posts"
    ADD CONSTRAINT "new_store_posts_pkey" PRIMARY KEY ("id");


--
-- Name: notices notices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notices"
    ADD CONSTRAINT "notices_pkey" PRIMARY KEY ("id");


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");


--
-- Name: page_heroes page_heroes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."page_heroes"
    ADD CONSTRAINT "page_heroes_pkey" PRIMARY KEY ("page_key");


--
-- Name: page_heroes page_heroes_plaza_page_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."page_heroes"
    ADD CONSTRAINT "page_heroes_plaza_page_key_key" UNIQUE ("plaza_id", "page_key");


--
-- Name: payment_webhooks payment_webhooks_pg_provider_pg_payment_id_event_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_webhooks"
    ADD CONSTRAINT "payment_webhooks_pg_provider_pg_payment_id_event_type_key" UNIQUE ("pg_provider", "pg_payment_id", "event_type");


--
-- Name: payment_webhooks payment_webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_webhooks"
    ADD CONSTRAINT "payment_webhooks_pkey" PRIMARY KEY ("id");


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");


--
-- Name: payout_batches payout_batches_period_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payout_batches"
    ADD CONSTRAINT "payout_batches_period_unique" UNIQUE ("period_start", "period_end");


--
-- Name: payout_batches payout_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payout_batches"
    ADD CONSTRAINT "payout_batches_pkey" PRIMARY KEY ("id");


--
-- Name: payouts payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_pkey" PRIMARY KEY ("id");


--
-- Name: plaza_admins plaza_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."plaza_admins"
    ADD CONSTRAINT "plaza_admins_pkey" PRIMARY KEY ("user_id", "plaza_id");


--
-- Name: plaza_associations plaza_associations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."plaza_associations"
    ADD CONSTRAINT "plaza_associations_pkey" PRIMARY KEY ("id");


--
-- Name: plaza_associations plaza_associations_plaza_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."plaza_associations"
    ADD CONSTRAINT "plaza_associations_plaza_id_key" UNIQUE ("plaza_id");


--
-- Name: plaza_profiles plaza_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."plaza_profiles"
    ADD CONSTRAINT "plaza_profiles_pkey" PRIMARY KEY ("user_id", "plaza_id");


--
-- Name: plaza_settings plaza_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."plaza_settings"
    ADD CONSTRAINT "plaza_settings_pkey" PRIMARY KEY ("id");


--
-- Name: plaza_settings plaza_settings_plaza_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."plaza_settings"
    ADD CONSTRAINT "plaza_settings_plaza_key_unique" UNIQUE ("plaza_id", "key");


--
-- Name: plaza_settlements plaza_settlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."plaza_settlements"
    ADD CONSTRAINT "plaza_settlements_pkey" PRIMARY KEY ("id");


--
-- Name: plaza_settlements plaza_settlements_plaza_id_period_start_period_end_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."plaza_settlements"
    ADD CONSTRAINT "plaza_settlements_plaza_id_period_start_period_end_key" UNIQUE ("plaza_id", "period_start", "period_end");


--
-- Name: plazas plazas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."plazas"
    ADD CONSTRAINT "plazas_pkey" PRIMARY KEY ("id");


--
-- Name: point_daily_counters point_daily_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."point_daily_counters"
    ADD CONSTRAINT "point_daily_counters_pkey" PRIMARY KEY ("user_id", "rule_id", "date");


--
-- Name: point_history point_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."point_history"
    ADD CONSTRAINT "point_history_pkey" PRIMARY KEY ("id");


--
-- Name: point_redemption_settings point_redemption_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."point_redemption_settings"
    ADD CONSTRAINT "point_redemption_settings_pkey" PRIMARY KEY ("category");


--
-- Name: point_rules point_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."point_rules"
    ADD CONSTRAINT "point_rules_pkey" PRIMARY KEY ("id");


--
-- Name: point_transactions point_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."point_transactions"
    ADD CONSTRAINT "point_transactions_pkey" PRIMARY KEY ("id");


--
-- Name: popular_searches popular_searches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."popular_searches"
    ADD CONSTRAINT "popular_searches_pkey" PRIMARY KEY ("id");


--
-- Name: popups popups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."popups"
    ADD CONSTRAINT "popups_pkey" PRIMARY KEY ("id");


--
-- Name: post_reports post_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."post_reports"
    ADD CONSTRAINT "post_reports_pkey" PRIMARY KEY ("id");


--
-- Name: post_reports post_reports_reporter_id_target_type_target_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."post_reports"
    ADD CONSTRAINT "post_reports_reporter_id_target_type_target_id_key" UNIQUE ("reporter_id", "target_type", "target_id");


--
-- Name: producer_settlements producer_settlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."producer_settlements"
    ADD CONSTRAINT "producer_settlements_pkey" PRIMARY KEY ("user_id");


--
-- Name: profile_highlights profile_highlights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profile_highlights"
    ADD CONSTRAINT "profile_highlights_pkey" PRIMARY KEY ("id");


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");


--
-- Name: properties properties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."properties"
    ADD CONSTRAINT "properties_pkey" PRIMARY KEY ("id");


--
-- Name: property_highlights property_highlights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."property_highlights"
    ADD CONSTRAINT "property_highlights_pkey" PRIMARY KEY ("id");


--
-- Name: property_highlights property_highlights_property_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."property_highlights"
    ADD CONSTRAINT "property_highlights_property_id_key" UNIQUE ("property_id");


--
-- Name: property_reports property_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."property_reports"
    ADD CONSTRAINT "property_reports_pkey" PRIMARY KEY ("id");


--
-- Name: property_request_responses property_request_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."property_request_responses"
    ADD CONSTRAINT "property_request_responses_pkey" PRIMARY KEY ("id");


--
-- Name: property_requests property_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."property_requests"
    ADD CONSTRAINT "property_requests_pkey" PRIMARY KEY ("id");


--
-- Name: refund_requests refund_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id");


--
-- Name: regions regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."regions"
    ADD CONSTRAINT "regions_pkey" PRIMARY KEY ("id");


--
-- Name: repair_favorites repair_favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."repair_favorites"
    ADD CONSTRAINT "repair_favorites_pkey" PRIMARY KEY ("user_id", "post_id");


--
-- Name: repair_posts repair_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."repair_posts"
    ADD CONSTRAINT "repair_posts_pkey" PRIMARY KEY ("id");


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");


--
-- Name: reviews reviews_reviewer_id_reviewed_user_id_property_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_reviewer_id_reviewed_user_id_property_id_key" UNIQUE ("reviewer_id", "reviewed_user_id", "property_id");


--
-- Name: search_queries search_queries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."search_queries"
    ADD CONSTRAINT "search_queries_pkey" PRIMARY KEY ("term");


--
-- Name: search_term_blacklist search_term_blacklist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."search_term_blacklist"
    ADD CONSTRAINT "search_term_blacklist_pkey" PRIMARY KEY ("term");


--
-- Name: secondhand_likes secondhand_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."secondhand_likes"
    ADD CONSTRAINT "secondhand_likes_pkey" PRIMARY KEY ("user_id", "post_id");


--
-- Name: secondhand_posts secondhand_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."secondhand_posts"
    ADD CONSTRAINT "secondhand_posts_pkey" PRIMARY KEY ("id");


--
-- Name: service_request_responses service_request_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."service_request_responses"
    ADD CONSTRAINT "service_request_responses_pkey" PRIMARY KEY ("id");


--
-- Name: service_requests service_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."service_requests"
    ADD CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id");


--
-- Name: sharing_likes sharing_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sharing_likes"
    ADD CONSTRAINT "sharing_likes_pkey" PRIMARY KEY ("user_id", "post_id");


--
-- Name: sharing_posts sharing_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sharing_posts"
    ADD CONSTRAINT "sharing_posts_pkey" PRIMARY KEY ("id");


--
-- Name: site_labels site_labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."site_labels"
    ADD CONSTRAINT "site_labels_pkey" PRIMARY KEY ("key");


--
-- Name: site_settings site_settings_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."site_settings"
    ADD CONSTRAINT "site_settings_key_key" UNIQUE ("key");


--
-- Name: site_settings site_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."site_settings"
    ADD CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id");


--
-- Name: subscription_plans subscription_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."subscription_plans"
    ADD CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id");


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");


--
-- Name: support_inquiries support_inquiries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."support_inquiries"
    ADD CONSTRAINT "support_inquiries_pkey" PRIMARY KEY ("id");


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");


--
-- Name: user_bans user_bans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_bans"
    ADD CONSTRAINT "user_bans_pkey" PRIMARY KEY ("id");


--
-- Name: user_flags user_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_flags"
    ADD CONSTRAINT "user_flags_pkey" PRIMARY KEY ("id");


--
-- Name: user_points user_points_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_points"
    ADD CONSTRAINT "user_points_pkey" PRIMARY KEY ("user_id");


--
-- Name: user_push_tokens user_push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_push_tokens"
    ADD CONSTRAINT "user_push_tokens_pkey" PRIMARY KEY ("id");


--
-- Name: user_push_tokens user_push_tokens_user_id_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_push_tokens"
    ADD CONSTRAINT "user_push_tokens_user_id_token_key" UNIQUE ("user_id", "token");


--
-- Name: verification_requests verification_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."verification_requests"
    ADD CONSTRAINT "verification_requests_pkey" PRIMARY KEY ("id");


--
-- Name: visitor_logs visitor_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."visitor_logs"
    ADD CONSTRAINT "visitor_logs_pkey" PRIMARY KEY ("id");


--
-- Name: admin_actions_admin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_admin_idx" ON "public"."admin_actions" USING "btree" ("admin_id", "created_at" DESC);


--
-- Name: admin_actions_plaza_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_plaza_idx" ON "public"."admin_actions" USING "btree" ("plaza_id", "created_at" DESC);


--
-- Name: admin_actions_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_target_idx" ON "public"."admin_actions" USING "btree" ("target_table", "target_id");


--
-- Name: ai_video_jobs_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_video_jobs_request_id_idx" ON "public"."ai_video_jobs" USING "btree" ("provider_request_id") WHERE ("provider_request_id" IS NOT NULL);


--
-- Name: ai_video_jobs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_video_jobs_status_idx" ON "public"."ai_video_jobs" USING "btree" ("status") WHERE ("status" = ANY (ARRAY['pending'::"text", 'processing'::"text"]));


--
-- Name: ai_video_jobs_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_video_jobs_user_id_idx" ON "public"."ai_video_jobs" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: audit_log_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "audit_log_action_idx" ON "public"."audit_log" USING "btree" ("action");


--
-- Name: audit_log_actor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "audit_log_actor_idx" ON "public"."audit_log" USING "btree" ("actor_id", "created_at" DESC);


--
-- Name: audit_log_plaza_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "audit_log_plaza_created_idx" ON "public"."audit_log" USING "btree" ("plaza_id", "created_at" DESC);


--
-- Name: block_users_blocked_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "block_users_blocked_idx" ON "public"."block_users" USING "btree" ("blocked_id");


--
-- Name: board_categories_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "board_categories_plaza_id_idx" ON "public"."board_categories" USING "btree" ("plaza_id");


--
-- Name: board_comments_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "board_comments_parent_idx" ON "public"."board_comments" USING "btree" ("parent_id");


--
-- Name: board_comments_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "board_comments_plaza_id_idx" ON "public"."board_comments" USING "btree" ("plaza_id");


--
-- Name: board_comments_post_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "board_comments_post_idx" ON "public"."board_comments" USING "btree" ("post_id");


--
-- Name: board_comments_post_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "board_comments_post_status_idx" ON "public"."board_comments" USING "btree" ("post_id", "status");


--
-- Name: board_comments_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "board_comments_user_idx" ON "public"."board_comments" USING "btree" ("user_id");


--
-- Name: board_post_likes_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "board_post_likes_plaza_id_idx" ON "public"."board_post_likes" USING "btree" ("plaza_id");


--
-- Name: board_post_likes_post_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "board_post_likes_post_idx" ON "public"."board_post_likes" USING "btree" ("post_id");


--
-- Name: board_post_likes_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "board_post_likes_user_idx" ON "public"."board_post_likes" USING "btree" ("user_id");


--
-- Name: board_posts_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "board_posts_category_idx" ON "public"."board_posts" USING "btree" ("category_id");


--
-- Name: board_posts_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "board_posts_created_idx" ON "public"."board_posts" USING "btree" ("created_at" DESC);


--
-- Name: board_posts_plaza_cat_region_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "board_posts_plaza_cat_region_created_idx" ON "public"."board_posts" USING "btree" ("plaza_id", "category_id", "region", "is_pinned" DESC, "created_at" DESC) WHERE (("status" = 'active'::"text") OR ("status" IS NULL));


--
-- Name: board_posts_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "board_posts_plaza_id_idx" ON "public"."board_posts" USING "btree" ("plaza_id");


--
-- Name: board_posts_plaza_region_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "board_posts_plaza_region_idx" ON "public"."board_posts" USING "btree" ("plaza_id", "region_id");


--
-- Name: board_posts_region_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "board_posts_region_idx" ON "public"."board_posts" USING "btree" ("region");


--
-- Name: board_posts_region_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "board_posts_region_status_created_idx" ON "public"."board_posts" USING "btree" ("region", "status", "created_at" DESC);


--
-- Name: board_posts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "board_posts_status_idx" ON "public"."board_posts" USING "btree" ("status");


--
-- Name: board_posts_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "board_posts_user_idx" ON "public"."board_posts" USING "btree" ("user_id");


--
-- Name: categories_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "categories_type_idx" ON "public"."categories" USING "btree" ("type", "sort_order");


--
-- Name: chat_rooms_buyer_plaza_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chat_rooms_buyer_plaza_idx" ON "public"."chat_rooms" USING "btree" ("buyer_plaza_id", "buyer_id");


--
-- Name: chat_rooms_direct_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "chat_rooms_direct_unique" ON "public"."chat_rooms" USING "btree" (LEAST("buyer_id", "seller_id"), GREATEST("buyer_id", "seller_id"), "plaza_id") WHERE (("post_type" = 'direct'::"text") AND ("property_id" IS NULL));


--
-- Name: chat_rooms_plaza_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chat_rooms_plaza_idx" ON "public"."chat_rooms" USING "btree" ("plaza_id");


--
-- Name: chat_rooms_plaza_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chat_rooms_plaza_user_idx" ON "public"."chat_rooms" USING "btree" ("plaza_id", "buyer_id", "seller_id");


--
-- Name: chuncheon_events_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chuncheon_events_plaza_id_idx" ON "public"."chuncheon_events" USING "btree" ("plaza_id");


--
-- Name: chuncheon_events_source_external_plaza_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "chuncheon_events_source_external_plaza_key" ON "public"."chuncheon_events" USING "btree" ("source", "external_id", "plaza_id") WHERE ("external_id" IS NOT NULL);


--
-- Name: chuncheon_events_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chuncheon_events_source_idx" ON "public"."chuncheon_events" USING "btree" ("source");


--
-- Name: chuncheon_events_src_ext_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "chuncheon_events_src_ext_unique" ON "public"."chuncheon_events" USING "btree" ("source", "external_id") WHERE (("source" IS NOT NULL) AND ("external_id" IS NOT NULL));


--
-- Name: cleaning_favorites_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "cleaning_favorites_plaza_id_idx" ON "public"."cleaning_favorites" USING "btree" ("plaza_id");


--
-- Name: cleaning_favorites_post_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "cleaning_favorites_post_idx" ON "public"."cleaning_favorites" USING "btree" ("post_id");


--
-- Name: cleaning_posts_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "cleaning_posts_plaza_id_idx" ON "public"."cleaning_posts" USING "btree" ("plaza_id");


--
-- Name: cleaning_posts_plaza_region_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "cleaning_posts_plaza_region_idx" ON "public"."cleaning_posts" USING "btree" ("plaza_id", "region_id");


--
-- Name: club_chat_messages_club_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "club_chat_messages_club_created_idx" ON "public"."club_chat_messages" USING "btree" ("club_id", "created_at" DESC);


--
-- Name: club_chat_messages_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "club_chat_messages_plaza_id_idx" ON "public"."club_chat_messages" USING "btree" ("plaza_id");


--
-- Name: club_likes_club_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "club_likes_club_idx" ON "public"."club_likes" USING "btree" ("club_id");


--
-- Name: club_likes_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "club_likes_plaza_id_idx" ON "public"."club_likes" USING "btree" ("plaza_id");


--
-- Name: club_members_club_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "club_members_club_idx" ON "public"."club_members" USING "btree" ("club_id");


--
-- Name: club_members_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "club_members_plaza_id_idx" ON "public"."club_members" USING "btree" ("plaza_id");


--
-- Name: club_members_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "club_members_user_idx" ON "public"."club_members" USING "btree" ("user_id");


--
-- Name: clubs_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "clubs_plaza_id_idx" ON "public"."clubs" USING "btree" ("plaza_id");


--
-- Name: clubs_plaza_region_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "clubs_plaza_region_idx" ON "public"."clubs" USING "btree" ("plaza_id", "region_id");


--
-- Name: credit_purchases_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "credit_purchases_user_id_idx" ON "public"."credit_purchases" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: cron_run_log_job_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "cron_run_log_job_started_idx" ON "public"."cron_run_log" USING "btree" ("job_name", "started_at" DESC);


--
-- Name: ei_chat_room_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ei_chat_room_idx" ON "public"."expert_invitations" USING "btree" ("chat_room_id");


--
-- Name: ei_expert_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ei_expert_idx" ON "public"."expert_invitations" USING "btree" ("expert_id");


--
-- Name: ei_inviter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ei_inviter_idx" ON "public"."expert_invitations" USING "btree" ("inviter_id");


--
-- Name: ei_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ei_status_idx" ON "public"."expert_invitations" USING "btree" ("status");


--
-- Name: ei_unique_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ei_unique_pending" ON "public"."expert_invitations" USING "btree" ("chat_room_id", "expert_id") WHERE ("status" = 'pending'::"text");


--
-- Name: faqs_cat_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "faqs_cat_idx" ON "public"."faqs" USING "btree" ("category", "sort_order");


--
-- Name: faqs_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "faqs_plaza_id_idx" ON "public"."faqs" USING "btree" ("plaza_id");


--
-- Name: favorites_plaza_property_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "favorites_plaza_property_idx" ON "public"."favorites" USING "btree" ("plaza_id", "property_id");


--
-- Name: favorites_plaza_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "favorites_plaza_user_idx" ON "public"."favorites" USING "btree" ("plaza_id", "user_id");


--
-- Name: follows_follower_following_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "follows_follower_following_idx" ON "public"."follows" USING "btree" ("follower_id", "following_id");


--
-- Name: follows_follower_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "follows_follower_idx" ON "public"."follows" USING "btree" ("follower_id");


--
-- Name: follows_following_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "follows_following_idx" ON "public"."follows" USING "btree" ("following_id");


--
-- Name: follows_plaza_follower_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "follows_plaza_follower_idx" ON "public"."follows" USING "btree" ("plaza_id", "follower_id");


--
-- Name: follows_plaza_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "follows_plaza_idx" ON "public"."follows" USING "btree" ("plaza_id", "following_id");


--
-- Name: gbcm_post_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "gbcm_post_created_idx" ON "public"."group_buying_chat_messages" USING "btree" ("post_id", "created_at" DESC);


--
-- Name: gbp_post_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "gbp_post_idx" ON "public"."group_buying_participants" USING "btree" ("post_id");


--
-- Name: gbp_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "gbp_user_idx" ON "public"."group_buying_participants" USING "btree" ("user_id");


--
-- Name: group_buying_chat_messages_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "group_buying_chat_messages_plaza_id_idx" ON "public"."group_buying_chat_messages" USING "btree" ("plaza_id");


--
-- Name: group_buying_orders_idem_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "group_buying_orders_idem_uniq" ON "public"."group_buying_orders" USING "btree" ("buyer_id", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);


--
-- Name: group_buying_posts_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "group_buying_posts_plaza_id_idx" ON "public"."group_buying_posts" USING "btree" ("plaza_id");


--
-- Name: group_buying_posts_plaza_region_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "group_buying_posts_plaza_region_idx" ON "public"."group_buying_posts" USING "btree" ("plaza_id", "region_id");


--
-- Name: group_buying_wishlist_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "group_buying_wishlist_plaza_id_idx" ON "public"."group_buying_wishlist" USING "btree" ("plaza_id");


--
-- Name: hero_banners_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "hero_banners_order_idx" ON "public"."hero_banners" USING "btree" ("order_index", "created_at" DESC);


--
-- Name: hero_banners_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "hero_banners_plaza_id_idx" ON "public"."hero_banners" USING "btree" ("plaza_id");


--
-- Name: hero_banners_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "hero_banners_sort_idx" ON "public"."hero_banners" USING "btree" ("sort_order", "created_at" DESC);


--
-- Name: highlights_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "highlights_user_idx" ON "public"."profile_highlights" USING "btree" ("user_id", "sort_order");


--
-- Name: homepage_menu_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "homepage_menu_plaza_id_idx" ON "public"."homepage_menu" USING "btree" ("plaza_id");


--
-- Name: homepage_slider_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "homepage_slider_plaza_id_idx" ON "public"."homepage_slider" USING "btree" ("plaza_id");


--
-- Name: idx_account_type_requests_pending_submitted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_account_type_requests_pending_submitted" ON "public"."account_type_requests" USING "btree" ("submitted_at" DESC) WHERE ("status" = 'pending'::"text");


--
-- Name: idx_account_type_requests_plaza; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_account_type_requests_plaza" ON "public"."account_type_requests" USING "btree" ("plaza_id", "status", "submitted_at" DESC);


--
-- Name: idx_account_type_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_account_type_requests_status" ON "public"."account_type_requests" USING "btree" ("status", "submitted_at" DESC);


--
-- Name: idx_account_type_requests_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_account_type_requests_user" ON "public"."account_type_requests" USING "btree" ("user_id", "submitted_at" DESC);


--
-- Name: idx_admin_user_memos_plaza_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_admin_user_memos_plaza_id" ON "public"."admin_user_memos" USING "btree" ("plaza_id");


--
-- Name: idx_admin_user_memos_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_admin_user_memos_user_id" ON "public"."admin_user_memos" USING "btree" ("user_id");


--
-- Name: idx_app_versions_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_app_versions_created" ON "public"."app_versions" USING "btree" ("created_at" DESC);


--
-- Name: idx_app_versions_plaza; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_app_versions_plaza" ON "public"."app_versions" USING "btree" ("plaza_id");


--
-- Name: idx_board_comments_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_board_comments_post" ON "public"."board_comments" USING "btree" ("post_id");


--
-- Name: idx_board_comments_post_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_board_comments_post_created" ON "public"."board_comments" USING "btree" ("post_id", "created_at");


--
-- Name: idx_board_comments_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_board_comments_user" ON "public"."board_comments" USING "btree" ("user_id");


--
-- Name: idx_board_posts_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_board_posts_category" ON "public"."board_posts" USING "btree" ("category_id");


--
-- Name: idx_board_posts_category_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_board_posts_category_created" ON "public"."board_posts" USING "btree" ("category_id", "created_at" DESC);


--
-- Name: idx_board_posts_content_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_board_posts_content_trgm" ON "public"."board_posts" USING "gin" ("content" "public"."gin_trgm_ops");


--
-- Name: idx_board_posts_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_board_posts_created" ON "public"."board_posts" USING "btree" ("created_at" DESC);


--
-- Name: idx_board_posts_like_view; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_board_posts_like_view" ON "public"."board_posts" USING "btree" ("like_count" DESC, "view_count" DESC);


--
-- Name: idx_board_posts_title_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_board_posts_title_trgm" ON "public"."board_posts" USING "gin" ("title" "public"."gin_trgm_ops");


--
-- Name: idx_board_posts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_board_posts_user" ON "public"."board_posts" USING "btree" ("user_id");


--
-- Name: idx_boost_orders_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_boost_orders_active" ON "public"."boost_orders" USING "btree" ("target_type", "target_id", "ends_at") WHERE ("status" = 'active'::"text");


--
-- Name: idx_boost_orders_plaza; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_boost_orders_plaza" ON "public"."boost_orders" USING "btree" ("plaza_id");


--
-- Name: idx_boost_orders_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_boost_orders_target" ON "public"."boost_orders" USING "btree" ("target_type", "target_id");


--
-- Name: idx_boost_orders_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_boost_orders_user" ON "public"."boost_orders" USING "btree" ("user_id");


--
-- Name: idx_bump_history_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_bump_history_target" ON "public"."bump_history" USING "btree" ("target_type", "target_id");


--
-- Name: idx_bump_history_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_bump_history_user" ON "public"."bump_history" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_bump_ticket_orders_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_bump_ticket_orders_user" ON "public"."bump_ticket_orders" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_business_declarations_business_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_business_declarations_business_number" ON "public"."business_declarations" USING "btree" ("business_number");


--
-- Name: idx_business_declarations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_business_declarations_status" ON "public"."business_declarations" USING "btree" ("status");


--
-- Name: idx_chat_room_participants_room_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chat_room_participants_room_id" ON "public"."chat_room_participants" USING "btree" ("room_id");


--
-- Name: idx_chat_room_participants_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chat_room_participants_user_id" ON "public"."chat_room_participants" USING "btree" ("user_id");


--
-- Name: idx_chat_rooms_buyer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chat_rooms_buyer_id" ON "public"."chat_rooms" USING "btree" ("buyer_id");


--
-- Name: idx_chat_rooms_property_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chat_rooms_property_id" ON "public"."chat_rooms" USING "btree" ("property_id");


--
-- Name: idx_chat_rooms_seller_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chat_rooms_seller_id" ON "public"."chat_rooms" USING "btree" ("seller_id");


--
-- Name: idx_chuncheon_events_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chuncheon_events_active" ON "public"."chuncheon_events" USING "btree" ("is_active");


--
-- Name: idx_chuncheon_events_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chuncheon_events_date" ON "public"."chuncheon_events" USING "btree" ("event_date");


--
-- Name: idx_chuncheon_events_plaza_active_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chuncheon_events_plaza_active_date" ON "public"."chuncheon_events" USING "btree" ("plaza_id", "is_active", "event_date" DESC);


--
-- Name: idx_cleaning_plaza_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_cleaning_plaza_status_created" ON "public"."cleaning_posts" USING "btree" ("plaza_id", "status", "created_at" DESC);


--
-- Name: idx_cleaning_posts_content_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_cleaning_posts_content_trgm" ON "public"."cleaning_posts" USING "gin" ("content" "public"."gin_trgm_ops");


--
-- Name: idx_cleaning_posts_effective_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_cleaning_posts_effective_active" ON "public"."cleaning_posts" USING "btree" ("plaza_id", "effective_at" DESC) WHERE (("status")::"text" = 'active'::"text");


--
-- Name: idx_cleaning_posts_title_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_cleaning_posts_title_trgm" ON "public"."cleaning_posts" USING "gin" ("title" "public"."gin_trgm_ops");


--
-- Name: idx_clubs_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clubs_category" ON "public"."clubs" USING "btree" ("category");


--
-- Name: idx_clubs_content_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clubs_content_trgm" ON "public"."clubs" USING "gin" ("content" "public"."gin_trgm_ops");


--
-- Name: idx_clubs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clubs_created" ON "public"."clubs" USING "btree" ("created_at" DESC);


--
-- Name: idx_clubs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clubs_created_at" ON "public"."clubs" USING "btree" ("created_at" DESC);


--
-- Name: idx_clubs_description_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clubs_description_trgm" ON "public"."clubs" USING "gin" ("description" "public"."gin_trgm_ops");


--
-- Name: idx_clubs_district; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clubs_district" ON "public"."clubs" USING "btree" ("district");


--
-- Name: idx_clubs_plaza_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clubs_plaza_status_created" ON "public"."clubs" USING "btree" ("plaza_id", "status", "created_at" DESC);


--
-- Name: idx_clubs_title_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clubs_title_trgm" ON "public"."clubs" USING "gin" ("title" "public"."gin_trgm_ops");


--
-- Name: idx_clubs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clubs_user_id" ON "public"."clubs" USING "btree" ("user_id");


--
-- Name: idx_commission_rates_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_commission_rates_category" ON "public"."commission_rates" USING "btree" ("category");


--
-- Name: idx_commission_rates_effective; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_commission_rates_effective" ON "public"."commission_rates" USING "btree" ("effective_from");


--
-- Name: idx_commission_rates_plaza; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_commission_rates_plaza" ON "public"."commission_rates" USING "btree" ("plaza_id");


--
-- Name: idx_commission_splits_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_commission_splits_payment" ON "public"."commission_splits" USING "btree" ("payment_id");


--
-- Name: idx_commission_splits_payout; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_commission_splits_payout" ON "public"."commission_splits" USING "btree" ("payout_id") WHERE ("payout_id" IS NOT NULL);


--
-- Name: idx_commission_splits_plaza; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_commission_splits_plaza" ON "public"."commission_splits" USING "btree" ("plaza_id");


--
-- Name: idx_commission_splits_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_commission_splits_recipient" ON "public"."commission_splits" USING "btree" ("recipient_type", "recipient_id");


--
-- Name: idx_commission_splits_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_commission_splits_status" ON "public"."commission_splits" USING "btree" ("status");


--
-- Name: idx_expert_invitations_chat_room_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_expert_invitations_chat_room_id" ON "public"."expert_invitations" USING "btree" ("chat_room_id");


--
-- Name: idx_expert_invitations_expert_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_expert_invitations_expert_created" ON "public"."expert_invitations" USING "btree" ("expert_id", "created_at" DESC);


--
-- Name: idx_expert_invitations_expert_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_expert_invitations_expert_id" ON "public"."expert_invitations" USING "btree" ("expert_id");


--
-- Name: idx_expert_invitations_expert_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_expert_invitations_expert_pending" ON "public"."expert_invitations" USING "btree" ("expert_id") WHERE ("status" = 'pending'::"text");


--
-- Name: idx_expert_invitations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_expert_invitations_status" ON "public"."expert_invitations" USING "btree" ("status");


--
-- Name: idx_favorites_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_favorites_property" ON "public"."favorites" USING "btree" ("property_id");


--
-- Name: idx_favorites_property_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_favorites_property_id" ON "public"."favorites" USING "btree" ("property_id");


--
-- Name: idx_favorites_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_favorites_user" ON "public"."favorites" USING "btree" ("user_id");


--
-- Name: idx_favorites_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_favorites_user_id" ON "public"."favorites" USING "btree" ("user_id");


--
-- Name: idx_gb_orders_buyer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_gb_orders_buyer" ON "public"."group_buying_orders" USING "btree" ("buyer_id", "created_at" DESC);


--
-- Name: idx_gb_orders_buyer_plaza; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_gb_orders_buyer_plaza" ON "public"."group_buying_orders" USING "btree" ("buyer_plaza_id");


--
-- Name: idx_gb_orders_plaza_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_gb_orders_plaza_status" ON "public"."group_buying_orders" USING "btree" ("plaza_id", "status");


--
-- Name: idx_gb_orders_post_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_gb_orders_post_status" ON "public"."group_buying_orders" USING "btree" ("post_id", "status");


--
-- Name: idx_gb_orders_seller; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_gb_orders_seller" ON "public"."group_buying_orders" USING "btree" ("seller_id", "created_at" DESC);


--
-- Name: idx_gb_orders_shipped_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_gb_orders_shipped_at" ON "public"."group_buying_orders" USING "btree" ("shipped_at") WHERE ("status" = 'shipped'::"text");


--
-- Name: idx_gb_orders_status_received; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_gb_orders_status_received" ON "public"."group_buying_orders" USING "btree" ("status", "received_at") WHERE (("status" = 'shipped'::"text") AND ("received_at" IS NOT NULL));


--
-- Name: idx_gb_participants_shipped_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_gb_participants_shipped_at" ON "public"."group_buying_participants" USING "btree" ("shipped_at") WHERE ("payment_status" = 'shipped'::"text");


--
-- Name: idx_gb_participants_status_received; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_gb_participants_status_received" ON "public"."group_buying_participants" USING "btree" ("payment_status", "received_at") WHERE (("payment_status" = 'shipped'::"text") AND ("received_at" IS NOT NULL));


--
-- Name: idx_group_buying_plaza_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_group_buying_plaza_status_created" ON "public"."group_buying_posts" USING "btree" ("plaza_id", "status", "created_at" DESC);


--
-- Name: idx_group_buying_posts_effective_recruiting; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_group_buying_posts_effective_recruiting" ON "public"."group_buying_posts" USING "btree" ("plaza_id", "effective_at" DESC) WHERE ("status" = 'recruiting'::"text");


--
-- Name: idx_group_buying_posts_product_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_group_buying_posts_product_trgm" ON "public"."group_buying_posts" USING "gin" ("product_name" "public"."gin_trgm_ops");


--
-- Name: idx_group_buying_posts_title_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_group_buying_posts_title_trgm" ON "public"."group_buying_posts" USING "gin" ("title" "public"."gin_trgm_ops");


--
-- Name: idx_group_buying_posts_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_group_buying_posts_visibility" ON "public"."group_buying_posts" USING "btree" ("visibility", "status", "created_at" DESC);


--
-- Name: idx_group_buying_wishlist_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_group_buying_wishlist_post_id" ON "public"."group_buying_wishlist" USING "btree" ("post_id");


--
-- Name: idx_group_buying_wishlist_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_group_buying_wishlist_user_id" ON "public"."group_buying_wishlist" USING "btree" ("user_id");


--
-- Name: idx_hero_banners_active_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_hero_banners_active_sort" ON "public"."hero_banners" USING "btree" ("is_active", "sort_order", "created_at" DESC);


--
-- Name: idx_interior_plaza_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_interior_plaza_status_created" ON "public"."interior_posts" USING "btree" ("plaza_id", "status", "created_at" DESC);


--
-- Name: idx_interior_posts_content_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_interior_posts_content_trgm" ON "public"."interior_posts" USING "gin" ("content" "public"."gin_trgm_ops");


--
-- Name: idx_interior_posts_effective_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_interior_posts_effective_active" ON "public"."interior_posts" USING "btree" ("plaza_id", "effective_at" DESC) WHERE (("status")::"text" = 'active'::"text");


--
-- Name: idx_interior_posts_title_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_interior_posts_title_trgm" ON "public"."interior_posts" USING "gin" ("title" "public"."gin_trgm_ops");


--
-- Name: idx_jobs_posts_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_jobs_posts_category" ON "public"."jobs_posts" USING "btree" ("category");


--
-- Name: idx_jobs_posts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_jobs_posts_created_at" ON "public"."jobs_posts" USING "btree" ("created_at" DESC);


--
-- Name: idx_jobs_posts_effective_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_jobs_posts_effective_active" ON "public"."jobs_posts" USING "btree" ("plaza_id", "effective_at" DESC) WHERE ("status" = 'active'::"text");


--
-- Name: idx_jobs_posts_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_jobs_posts_kind" ON "public"."jobs_posts" USING "btree" ("kind");


--
-- Name: idx_jobs_posts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_jobs_posts_status" ON "public"."jobs_posts" USING "btree" ("status");


--
-- Name: idx_jobs_posts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_jobs_posts_user_id" ON "public"."jobs_posts" USING "btree" ("user_id");


--
-- Name: idx_lf_orders_buyer_plaza; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lf_orders_buyer_plaza" ON "public"."local_food_orders" USING "btree" ("buyer_plaza_id");


--
-- Name: idx_lf_orders_shipped_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lf_orders_shipped_at" ON "public"."local_food_orders" USING "btree" ("shipped_at") WHERE ("status" = 'shipped'::"text");


--
-- Name: idx_lf_orders_status_received; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lf_orders_status_received" ON "public"."local_food_orders" USING "btree" ("status", "received_at") WHERE (("status" = 'shipped'::"text") AND ("received_at" IS NOT NULL));


--
-- Name: idx_local_food_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_local_food_category" ON "public"."local_food" USING "btree" ("category");


--
-- Name: idx_local_food_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_local_food_created" ON "public"."local_food" USING "btree" ("created_at" DESC);


--
-- Name: idx_local_food_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_local_food_created_at" ON "public"."local_food" USING "btree" ("created_at" DESC);


--
-- Name: idx_local_food_description_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_local_food_description_trgm" ON "public"."local_food" USING "gin" ("description" "public"."gin_trgm_ops");


--
-- Name: idx_local_food_district; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_local_food_district" ON "public"."local_food" USING "btree" ("district");


--
-- Name: idx_local_food_effective_available; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_local_food_effective_available" ON "public"."local_food" USING "btree" ("plaza_id", "effective_at" DESC) WHERE ("status" = 'available'::"text");


--
-- Name: idx_local_food_order_items_food; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_local_food_order_items_food" ON "public"."local_food_order_items" USING "btree" ("local_food_id");


--
-- Name: idx_local_food_order_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_local_food_order_items_order" ON "public"."local_food_order_items" USING "btree" ("order_id");


--
-- Name: idx_local_food_orders_buyer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_local_food_orders_buyer" ON "public"."local_food_orders" USING "btree" ("buyer_id", "created_at" DESC);


--
-- Name: idx_local_food_orders_pg_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_local_food_orders_pg_payment" ON "public"."local_food_orders" USING "btree" ("pg_payment_id") WHERE ("pg_payment_id" IS NOT NULL);


--
-- Name: idx_local_food_orders_plaza_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_local_food_orders_plaza_status" ON "public"."local_food_orders" USING "btree" ("plaza_id", "status");


--
-- Name: idx_local_food_orders_seller; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_local_food_orders_seller" ON "public"."local_food_orders" USING "btree" ("seller_id", "created_at" DESC);


--
-- Name: idx_local_food_plaza_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_local_food_plaza_status_created" ON "public"."local_food" USING "btree" ("plaza_id", "status", "created_at" DESC);


--
-- Name: idx_local_food_title_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_local_food_title_trgm" ON "public"."local_food" USING "gin" ("title" "public"."gin_trgm_ops");


--
-- Name: idx_local_food_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_local_food_user_id" ON "public"."local_food" USING "btree" ("user_id");


--
-- Name: idx_local_food_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_local_food_visibility" ON "public"."local_food" USING "btree" ("visibility", "status", "created_at" DESC);


--
-- Name: idx_messages_chat_room_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_messages_chat_room_id" ON "public"."messages" USING "btree" ("chat_room_id");


--
-- Name: idx_messages_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_messages_created_at" ON "public"."messages" USING "btree" ("created_at" DESC);


--
-- Name: idx_messages_unread_by_room; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_messages_unread_by_room" ON "public"."messages" USING "btree" ("chat_room_id") WHERE ("is_read" = false);


--
-- Name: idx_messages_unread_by_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_messages_unread_by_sender" ON "public"."messages" USING "btree" ("sender_id") WHERE ("is_read" = false);


--
-- Name: idx_moderation_keywords_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_moderation_keywords_scope" ON "public"."moderation_keywords" USING "btree" ("scope");


--
-- Name: idx_moving_plaza_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_moving_plaza_status_created" ON "public"."moving_posts" USING "btree" ("plaza_id", "status", "created_at" DESC);


--
-- Name: idx_moving_posts_content_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_moving_posts_content_trgm" ON "public"."moving_posts" USING "gin" ("content" "public"."gin_trgm_ops");


--
-- Name: idx_moving_posts_effective_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_moving_posts_effective_active" ON "public"."moving_posts" USING "btree" ("plaza_id", "effective_at" DESC) WHERE (("status")::"text" = 'active'::"text");


--
-- Name: idx_moving_posts_title_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_moving_posts_title_trgm" ON "public"."moving_posts" USING "gin" ("title" "public"."gin_trgm_ops");


--
-- Name: idx_new_store_plaza_status_likes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_new_store_plaza_status_likes" ON "public"."new_store_posts" USING "btree" ("plaza_id", "status", "likes" DESC, "created_at" DESC);


--
-- Name: idx_new_store_posts_effective_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_new_store_posts_effective_active" ON "public"."new_store_posts" USING "btree" ("plaza_id", "effective_at" DESC) WHERE ("status" = 'active'::"text");


--
-- Name: idx_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_notifications_created_at" ON "public"."notifications" USING "btree" ("created_at" DESC);


--
-- Name: idx_notifications_is_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_notifications_is_read" ON "public"."notifications" USING "btree" ("user_id", "is_read");


--
-- Name: idx_notifications_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_notifications_user_created" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_notifications_user_unread" ON "public"."notifications" USING "btree" ("user_id", "is_read");


--
-- Name: idx_payments_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_payments_kind" ON "public"."payments" USING "btree" ("kind");


--
-- Name: idx_payments_paid_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_payments_paid_at" ON "public"."payments" USING "btree" ("paid_at") WHERE ("paid_at" IS NOT NULL);


--
-- Name: idx_payments_pg_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_payments_pg_id" ON "public"."payments" USING "btree" ("pg_payment_id") WHERE ("pg_payment_id" IS NOT NULL);


--
-- Name: idx_payments_plaza; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_payments_plaza" ON "public"."payments" USING "btree" ("plaza_id");


--
-- Name: idx_payments_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_payments_reference" ON "public"."payments" USING "btree" ("reference_type", "reference_id");


--
-- Name: idx_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_payments_status" ON "public"."payments" USING "btree" ("status");


--
-- Name: idx_payments_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_payments_user" ON "public"."payments" USING "btree" ("user_id");


--
-- Name: idx_payout_batches_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_payout_batches_period" ON "public"."payout_batches" USING "btree" ("period_start", "period_end");


--
-- Name: idx_payout_batches_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_payout_batches_status" ON "public"."payout_batches" USING "btree" ("status");


--
-- Name: idx_payouts_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_payouts_batch" ON "public"."payouts" USING "btree" ("batch_id");


--
-- Name: idx_payouts_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_payouts_period" ON "public"."payouts" USING "btree" ("period_start", "period_end");


--
-- Name: idx_payouts_plaza; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_payouts_plaza" ON "public"."payouts" USING "btree" ("plaza_id");


--
-- Name: idx_payouts_plaza_assoc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_payouts_plaza_assoc" ON "public"."payouts" USING "btree" ("plaza_association_id");


--
-- Name: idx_payouts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_payouts_status" ON "public"."payouts" USING "btree" ("status");


--
-- Name: idx_plaza_associations_plaza; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_plaza_associations_plaza" ON "public"."plaza_associations" USING "btree" ("plaza_id");


--
-- Name: idx_plaza_associations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_plaza_associations_status" ON "public"."plaza_associations" USING "btree" ("status");


--
-- Name: idx_plaza_settings_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_plaza_settings_key" ON "public"."plaza_settings" USING "btree" ("key");


--
-- Name: idx_plaza_settings_plaza; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_plaza_settings_plaza" ON "public"."plaza_settings" USING "btree" ("plaza_id");


--
-- Name: idx_plaza_settlements_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_plaza_settlements_period" ON "public"."plaza_settlements" USING "btree" ("period_start", "period_end");


--
-- Name: idx_plaza_settlements_plaza; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_plaza_settlements_plaza" ON "public"."plaza_settlements" USING "btree" ("plaza_id");


--
-- Name: idx_plaza_settlements_plaza_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_plaza_settlements_plaza_id" ON "public"."plaza_settlements" USING "btree" ("plaza_id");


--
-- Name: idx_plaza_settlements_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_plaza_settlements_status" ON "public"."plaza_settlements" USING "btree" ("status");


--
-- Name: idx_point_counters_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_point_counters_date" ON "public"."point_daily_counters" USING "btree" ("date");


--
-- Name: idx_point_history_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_point_history_user_id" ON "public"."point_history" USING "btree" ("user_id");


--
-- Name: idx_point_tx_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_point_tx_created_at" ON "public"."point_transactions" USING "btree" ("created_at" DESC);


--
-- Name: idx_point_tx_eval; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_point_tx_eval" ON "public"."point_transactions" USING "btree" ("evaluation_at") WHERE ("status" = 'pending'::"text");


--
-- Name: idx_point_tx_plaza; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_point_tx_plaza" ON "public"."point_transactions" USING "btree" ("plaza_id");


--
-- Name: idx_point_tx_plaza_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_point_tx_plaza_created" ON "public"."point_transactions" USING "btree" ("plaza_id", "created_at" DESC);


--
-- Name: idx_point_tx_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_point_tx_source" ON "public"."point_transactions" USING "btree" ("source", "source_id");


--
-- Name: idx_point_tx_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_point_tx_status" ON "public"."point_transactions" USING "btree" ("status");


--
-- Name: idx_point_tx_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_point_tx_user" ON "public"."point_transactions" USING "btree" ("user_id");


--
-- Name: idx_point_tx_user_plaza_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_point_tx_user_plaza_created" ON "public"."point_transactions" USING "btree" ("user_id", "plaza_id", "created_at" DESC);


--
-- Name: idx_point_tx_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_point_tx_user_status" ON "public"."point_transactions" USING "btree" ("user_id", "status");


--
-- Name: idx_popups_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_popups_active" ON "public"."popups" USING "btree" ("is_active", "created_at" DESC);


--
-- Name: idx_popups_active_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_popups_active_start" ON "public"."popups" USING "btree" ("is_active", "start_at", "end_at");


--
-- Name: idx_post_reports_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_post_reports_created_at" ON "public"."post_reports" USING "btree" ("created_at" DESC);


--
-- Name: idx_post_reports_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_post_reports_status" ON "public"."post_reports" USING "btree" ("status");


--
-- Name: idx_post_reports_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_post_reports_target" ON "public"."post_reports" USING "btree" ("target_type", "target_id");


--
-- Name: idx_post_reports_target_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_post_reports_target_user" ON "public"."post_reports" USING "btree" ("target_user_id");


--
-- Name: idx_profiles_account_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_profiles_account_type" ON "public"."profiles" USING "btree" ("account_type");


--
-- Name: idx_profiles_account_type_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_profiles_account_type_created" ON "public"."profiles" USING "btree" ("account_type", "created_at" DESC);


--
-- Name: idx_profiles_bio_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_profiles_bio_trgm" ON "public"."profiles" USING "gin" ("bio" "public"."gin_trgm_ops");


--
-- Name: idx_profiles_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_profiles_location" ON "public"."profiles" USING "btree" ("location");


--
-- Name: idx_profiles_nickname_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_profiles_nickname_trgm" ON "public"."profiles" USING "gin" ("nickname" "public"."gin_trgm_ops");


--
-- Name: idx_profiles_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_profiles_username" ON "public"."profiles" USING "btree" ("username");


--
-- Name: idx_properties_address_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_properties_address_trgm" ON "public"."properties" USING "gin" ("address" "public"."gin_trgm_ops");


--
-- Name: idx_properties_bump; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_properties_bump" ON "public"."properties" USING "btree" ("plaza_id", COALESCE("bumped_at", "created_at") DESC) WHERE ("status" = 'active'::"text");


--
-- Name: idx_properties_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_properties_created_at" ON "public"."properties" USING "btree" ("created_at" DESC);


--
-- Name: idx_properties_description_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_properties_description_trgm" ON "public"."properties" USING "gin" ("description" "public"."gin_trgm_ops");


--
-- Name: idx_properties_effective; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_properties_effective" ON "public"."properties" USING "btree" ("plaza_id", "effective_at" DESC) WHERE ("status" = 'active'::"text");


--
-- Name: idx_properties_lat_lng; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_properties_lat_lng" ON "public"."properties" USING "btree" ("lat", "lng") WHERE (("lat" IS NOT NULL) AND ("lng" IS NOT NULL));


--
-- Name: idx_properties_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_properties_status" ON "public"."properties" USING "btree" ("status");


--
-- Name: idx_properties_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_properties_status_created" ON "public"."properties" USING "btree" ("status", "created_at" DESC);


--
-- Name: idx_properties_title_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_properties_title_trgm" ON "public"."properties" USING "gin" ("title" "public"."gin_trgm_ops");


--
-- Name: idx_properties_transaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_properties_transaction" ON "public"."properties" USING "btree" ("transaction_type");


--
-- Name: idx_properties_tx_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_properties_tx_status_created" ON "public"."properties" USING "btree" ("transaction_type", "status", "created_at" DESC);


--
-- Name: idx_properties_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_properties_type" ON "public"."properties" USING "btree" ("property_type");


--
-- Name: idx_properties_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_properties_user" ON "public"."properties" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_properties_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_properties_user_created" ON "public"."properties" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_properties_user_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_properties_user_created_at" ON "public"."properties" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_properties_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_properties_user_id" ON "public"."properties" USING "btree" ("user_id");


--
-- Name: idx_property_requests_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_property_requests_status_created" ON "public"."property_requests" USING "btree" ("status", "created_at" DESC);


--
-- Name: idx_refund_requests_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_refund_requests_created" ON "public"."refund_requests" USING "btree" ("created_at" DESC);


--
-- Name: idx_refund_requests_plaza; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_refund_requests_plaza" ON "public"."refund_requests" USING "btree" ("plaza_id");


--
-- Name: idx_refund_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_refund_requests_status" ON "public"."refund_requests" USING "btree" ("status");


--
-- Name: idx_refund_requests_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_refund_requests_user" ON "public"."refund_requests" USING "btree" ("user_id");


--
-- Name: idx_repair_plaza_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_repair_plaza_status_created" ON "public"."repair_posts" USING "btree" ("plaza_id", "status", "created_at" DESC);


--
-- Name: idx_repair_posts_content_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_repair_posts_content_trgm" ON "public"."repair_posts" USING "gin" ("content" "public"."gin_trgm_ops");


--
-- Name: idx_repair_posts_effective_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_repair_posts_effective_active" ON "public"."repair_posts" USING "btree" ("plaza_id", "effective_at" DESC) WHERE (("status")::"text" = 'active'::"text");


--
-- Name: idx_repair_posts_title_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_repair_posts_title_trgm" ON "public"."repair_posts" USING "gin" ("title" "public"."gin_trgm_ops");


--
-- Name: idx_search_queries_count; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_search_queries_count" ON "public"."search_queries" USING "btree" ("count" DESC, "last_searched_at" DESC);


--
-- Name: idx_search_queries_last; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_search_queries_last" ON "public"."search_queries" USING "btree" ("last_searched_at" DESC);


--
-- Name: idx_secondhand_bump; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_secondhand_bump" ON "public"."secondhand_posts" USING "btree" ("plaza_id", COALESCE("bumped_at", "created_at") DESC) WHERE ("status" = 'active'::"text");


--
-- Name: idx_secondhand_effective; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_secondhand_effective" ON "public"."secondhand_posts" USING "btree" ("plaza_id", "effective_at" DESC) WHERE ("status" = 'active'::"text");


--
-- Name: idx_secondhand_posts_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_secondhand_posts_category" ON "public"."secondhand_posts" USING "btree" ("category");


--
-- Name: idx_secondhand_posts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_secondhand_posts_created_at" ON "public"."secondhand_posts" USING "btree" ("created_at" DESC);


--
-- Name: idx_secondhand_posts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_secondhand_posts_status" ON "public"."secondhand_posts" USING "btree" ("status");


--
-- Name: idx_secondhand_posts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_secondhand_posts_user_id" ON "public"."secondhand_posts" USING "btree" ("user_id");


--
-- Name: idx_sharing_plaza_status_likes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_sharing_plaza_status_likes" ON "public"."sharing_posts" USING "btree" ("plaza_id", "status", "likes" DESC, "created_at" DESC);


--
-- Name: idx_sharing_posts_description_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_sharing_posts_description_trgm" ON "public"."sharing_posts" USING "gin" ("description" "public"."gin_trgm_ops");


--
-- Name: idx_sharing_posts_title_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_sharing_posts_title_trgm" ON "public"."sharing_posts" USING "gin" ("title" "public"."gin_trgm_ops");


--
-- Name: idx_subscriptions_period_end; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_subscriptions_period_end" ON "public"."subscriptions" USING "btree" ("current_period_end") WHERE ("status" = ANY (ARRAY['active'::"text", 'past_due'::"text"]));


--
-- Name: idx_subscriptions_plaza; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_subscriptions_plaza" ON "public"."subscriptions" USING "btree" ("plaza_id");


--
-- Name: idx_subscriptions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_subscriptions_status" ON "public"."subscriptions" USING "btree" ("status");


--
-- Name: idx_subscriptions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_subscriptions_user" ON "public"."subscriptions" USING "btree" ("user_id");


--
-- Name: idx_transactions_buyer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_transactions_buyer" ON "public"."transactions" USING "btree" ("buyer_id");


--
-- Name: idx_transactions_completed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_transactions_completed" ON "public"."transactions" USING "btree" ("completed_at") WHERE ("status" = 'completed'::"text");


--
-- Name: idx_transactions_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_transactions_kind" ON "public"."transactions" USING "btree" ("kind");


--
-- Name: idx_transactions_plaza; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_transactions_plaza" ON "public"."transactions" USING "btree" ("plaza_id");


--
-- Name: idx_transactions_seller; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_transactions_seller" ON "public"."transactions" USING "btree" ("seller_id");


--
-- Name: idx_transactions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_transactions_status" ON "public"."transactions" USING "btree" ("status");


--
-- Name: idx_user_flags_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_flags_severity" ON "public"."user_flags" USING "btree" ("severity");


--
-- Name: idx_user_flags_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_flags_status" ON "public"."user_flags" USING "btree" ("status") WHERE ("status" = 'open'::"text");


--
-- Name: idx_user_flags_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_flags_type" ON "public"."user_flags" USING "btree" ("flag_type");


--
-- Name: idx_user_flags_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_flags_user" ON "public"."user_flags" USING "btree" ("user_id");


--
-- Name: idx_user_points_reputation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_points_reputation" ON "public"."user_points" USING "btree" ("reputation_score") WHERE ("reputation_score" < 50);


--
-- Name: idx_verification_requests_plaza; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_verification_requests_plaza" ON "public"."verification_requests" USING "btree" ("plaza_id", "status");


--
-- Name: idx_verification_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_verification_requests_status" ON "public"."verification_requests" USING "btree" ("status");


--
-- Name: idx_verification_requests_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_verification_requests_type" ON "public"."verification_requests" USING "btree" ("type");


--
-- Name: idx_verification_requests_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_verification_requests_user_id" ON "public"."verification_requests" USING "btree" ("user_id");


--
-- Name: idx_visitor_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_visitor_logs_created" ON "public"."visitor_logs" USING "btree" ("created_at" DESC);


--
-- Name: idx_visitor_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_visitor_logs_user_id" ON "public"."visitor_logs" USING "btree" ("user_id");


--
-- Name: idx_visitor_logs_visited; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_visitor_logs_visited" ON "public"."visitor_logs" USING "btree" ("visited_at" DESC);


--
-- Name: idx_visitor_logs_visited_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_visitor_logs_visited_at" ON "public"."visitor_logs" USING "btree" ("visited_at");


--
-- Name: interior_favorites_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "interior_favorites_plaza_id_idx" ON "public"."interior_favorites" USING "btree" ("plaza_id");


--
-- Name: interior_favorites_post_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "interior_favorites_post_idx" ON "public"."interior_favorites" USING "btree" ("post_id");


--
-- Name: interior_posts_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "interior_posts_plaza_id_idx" ON "public"."interior_posts" USING "btree" ("plaza_id");


--
-- Name: interior_posts_plaza_region_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "interior_posts_plaza_region_idx" ON "public"."interior_posts" USING "btree" ("plaza_id", "region_id");


--
-- Name: jobs_likes_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "jobs_likes_plaza_id_idx" ON "public"."jobs_likes" USING "btree" ("plaza_id");


--
-- Name: jobs_posts_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "jobs_posts_plaza_id_idx" ON "public"."jobs_posts" USING "btree" ("plaza_id");


--
-- Name: jobs_posts_plaza_region_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "jobs_posts_plaza_region_idx" ON "public"."jobs_posts" USING "btree" ("plaza_id", "region_id");


--
-- Name: local_food_likes_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "local_food_likes_plaza_id_idx" ON "public"."local_food_likes" USING "btree" ("plaza_id");


--
-- Name: local_food_orders_idem_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "local_food_orders_idem_uniq" ON "public"."local_food_orders" USING "btree" ("buyer_id", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);


--
-- Name: local_food_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "local_food_plaza_id_idx" ON "public"."local_food" USING "btree" ("plaza_id");


--
-- Name: local_food_plaza_region_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "local_food_plaza_region_idx" ON "public"."local_food" USING "btree" ("plaza_id", "region_id");


--
-- Name: messages_plaza_room_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "messages_plaza_room_idx" ON "public"."messages" USING "btree" ("plaza_id", "chat_room_id");


--
-- Name: moderation_keywords_plaza_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "moderation_keywords_plaza_idx" ON "public"."moderation_keywords" USING "btree" ("plaza_id");


--
-- Name: moderation_keywords_plaza_keyword_scope_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "moderation_keywords_plaza_keyword_scope_key" ON "public"."moderation_keywords" USING "btree" ("plaza_id", "keyword", "scope");


--
-- Name: moving_favorites_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "moving_favorites_plaza_id_idx" ON "public"."moving_favorites" USING "btree" ("plaza_id");


--
-- Name: moving_favorites_post_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "moving_favorites_post_idx" ON "public"."moving_favorites" USING "btree" ("post_id");


--
-- Name: moving_posts_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "moving_posts_plaza_id_idx" ON "public"."moving_posts" USING "btree" ("plaza_id");


--
-- Name: moving_posts_plaza_region_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "moving_posts_plaza_region_idx" ON "public"."moving_posts" USING "btree" ("plaza_id", "region_id");


--
-- Name: new_store_likes_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "new_store_likes_plaza_id_idx" ON "public"."new_store_likes" USING "btree" ("plaza_id");


--
-- Name: new_store_likes_post_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "new_store_likes_post_idx" ON "public"."new_store_likes" USING "btree" ("post_id");


--
-- Name: new_store_posts_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "new_store_posts_plaza_id_idx" ON "public"."new_store_posts" USING "btree" ("plaza_id");


--
-- Name: new_store_posts_plaza_region_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "new_store_posts_plaza_region_idx" ON "public"."new_store_posts" USING "btree" ("plaza_id", "region_id");


--
-- Name: notices_pinned_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notices_pinned_idx" ON "public"."notices" USING "btree" ("is_pinned" DESC, "created_at" DESC);


--
-- Name: notices_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notices_plaza_id_idx" ON "public"."notices" USING "btree" ("plaza_id");


--
-- Name: notifications_plaza_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notifications_plaza_user_idx" ON "public"."notifications" USING "btree" ("plaza_id", "user_id", "created_at" DESC);


--
-- Name: page_heroes_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "page_heroes_plaza_id_idx" ON "public"."page_heroes" USING "btree" ("plaza_id");


--
-- Name: ph_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ph_sort_idx" ON "public"."property_highlights" USING "btree" ("sort_order", "created_at" DESC);


--
-- Name: plaza_admins_plaza_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "plaza_admins_plaza_idx" ON "public"."plaza_admins" USING "btree" ("plaza_id", "role");


--
-- Name: plaza_profiles_plaza_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "plaza_profiles_plaza_idx" ON "public"."plaza_profiles" USING "btree" ("plaza_id");


--
-- Name: plazas_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "plazas_active_idx" ON "public"."plazas" USING "btree" ("is_active", "sort_order");


--
-- Name: point_history_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "point_history_user_idx" ON "public"."point_history" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: popular_searches_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "popular_searches_plaza_id_idx" ON "public"."popular_searches" USING "btree" ("plaza_id");


--
-- Name: popups_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "popups_plaza_id_idx" ON "public"."popups" USING "btree" ("plaza_id");


--
-- Name: post_reports_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "post_reports_plaza_id_idx" ON "public"."post_reports" USING "btree" ("plaza_id");


--
-- Name: pr_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "pr_created_idx" ON "public"."property_requests" USING "btree" ("created_at" DESC);


--
-- Name: pr_district_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "pr_district_idx" ON "public"."property_requests" USING "btree" ("district");


--
-- Name: pr_property_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "pr_property_idx" ON "public"."property_reports" USING "btree" ("property_id");


--
-- Name: pr_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "pr_status_idx" ON "public"."property_reports" USING "btree" ("status");


--
-- Name: pr_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "pr_user_idx" ON "public"."property_requests" USING "btree" ("user_id");


--
-- Name: profile_highlights_plaza_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "profile_highlights_plaza_idx" ON "public"."profile_highlights" USING "btree" ("plaza_id", "user_id");


--
-- Name: profile_highlights_user_plaza_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "profile_highlights_user_plaza_idx" ON "public"."profile_highlights" USING "btree" ("user_id", "plaza_id");


--
-- Name: properties_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "properties_plaza_id_idx" ON "public"."properties" USING "btree" ("plaza_id");


--
-- Name: properties_plaza_region_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "properties_plaza_region_idx" ON "public"."properties" USING "btree" ("plaza_id", "region_id");


--
-- Name: property_highlights_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "property_highlights_plaza_id_idx" ON "public"."property_highlights" USING "btree" ("plaza_id");


--
-- Name: property_reports_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "property_reports_plaza_id_idx" ON "public"."property_reports" USING "btree" ("plaza_id");


--
-- Name: property_request_responses_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "property_request_responses_plaza_id_idx" ON "public"."property_request_responses" USING "btree" ("plaza_id");


--
-- Name: property_requests_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "property_requests_plaza_id_idx" ON "public"."property_requests" USING "btree" ("plaza_id");


--
-- Name: property_requests_plaza_region_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "property_requests_plaza_region_idx" ON "public"."property_requests" USING "btree" ("plaza_id", "region_id");


--
-- Name: prr_request_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "prr_request_idx" ON "public"."property_request_responses" USING "btree" ("request_id");


--
-- Name: prr_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "prr_user_idx" ON "public"."property_request_responses" USING "btree" ("user_id");


--
-- Name: ps_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ps_created_idx" ON "public"."popular_searches" USING "btree" ("created_at" DESC);


--
-- Name: ps_keyword_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ps_keyword_idx" ON "public"."popular_searches" USING "btree" ("keyword");


--
-- Name: pt_unique_earn_source; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "pt_unique_earn_source" ON "public"."point_transactions" USING "btree" ("source", "source_id") WHERE (("type" = 'earn'::"text") AND ("source_id" IS NOT NULL));


--
-- Name: regions_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "regions_parent_idx" ON "public"."regions" USING "btree" ("parent_id");


--
-- Name: regions_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "regions_plaza_id_idx" ON "public"."regions" USING "btree" ("plaza_id");


--
-- Name: repair_favorites_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "repair_favorites_plaza_id_idx" ON "public"."repair_favorites" USING "btree" ("plaza_id");


--
-- Name: repair_favorites_post_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "repair_favorites_post_idx" ON "public"."repair_favorites" USING "btree" ("post_id");


--
-- Name: repair_posts_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "repair_posts_plaza_id_idx" ON "public"."repair_posts" USING "btree" ("plaza_id");


--
-- Name: repair_posts_plaza_region_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "repair_posts_plaza_region_idx" ON "public"."repair_posts" USING "btree" ("plaza_id", "region_id");


--
-- Name: reviews_plaza_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "reviews_plaza_idx" ON "public"."reviews" USING "btree" ("plaza_id");


--
-- Name: reviews_unique_per_source; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "reviews_unique_per_source" ON "public"."reviews" USING "btree" ("reviewer_id", "source_type", "source_id") WHERE (("source_type" IS NOT NULL) AND ("source_id" IS NOT NULL));


--
-- Name: search_queries_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "search_queries_plaza_id_idx" ON "public"."search_queries" USING "btree" ("plaza_id");


--
-- Name: secondhand_likes_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "secondhand_likes_plaza_id_idx" ON "public"."secondhand_likes" USING "btree" ("plaza_id");


--
-- Name: secondhand_posts_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "secondhand_posts_plaza_id_idx" ON "public"."secondhand_posts" USING "btree" ("plaza_id");


--
-- Name: secondhand_posts_plaza_region_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "secondhand_posts_plaza_region_idx" ON "public"."secondhand_posts" USING "btree" ("plaza_id", "region_id");


--
-- Name: sharing_likes_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sharing_likes_plaza_id_idx" ON "public"."sharing_likes" USING "btree" ("plaza_id");


--
-- Name: sharing_likes_post_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sharing_likes_post_idx" ON "public"."sharing_likes" USING "btree" ("post_id");


--
-- Name: sharing_likes_user_post_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sharing_likes_user_post_idx" ON "public"."sharing_likes" USING "btree" ("user_id", "post_id");


--
-- Name: sharing_posts_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sharing_posts_plaza_id_idx" ON "public"."sharing_posts" USING "btree" ("plaza_id");


--
-- Name: sharing_posts_plaza_region_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sharing_posts_plaza_region_idx" ON "public"."sharing_posts" USING "btree" ("plaza_id", "region_id");


--
-- Name: si_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "si_status_idx" ON "public"."support_inquiries" USING "btree" ("status", "created_at" DESC);


--
-- Name: si_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "si_user_idx" ON "public"."support_inquiries" USING "btree" ("user_id");


--
-- Name: sr_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sr_created_idx" ON "public"."service_requests" USING "btree" ("created_at" DESC);


--
-- Name: sr_plaza_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sr_plaza_idx" ON "public"."service_requests" USING "btree" ("plaza_id");


--
-- Name: sr_service_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sr_service_type_idx" ON "public"."service_requests" USING "btree" ("service_type");


--
-- Name: sr_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sr_status_idx" ON "public"."service_requests" USING "btree" ("status");


--
-- Name: sr_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sr_user_idx" ON "public"."service_requests" USING "btree" ("user_id");


--
-- Name: srr_request_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "srr_request_idx" ON "public"."service_request_responses" USING "btree" ("request_id");


--
-- Name: srr_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "srr_user_idx" ON "public"."service_request_responses" USING "btree" ("user_id");


--
-- Name: support_inquiries_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "support_inquiries_plaza_id_idx" ON "public"."support_inquiries" USING "btree" ("plaza_id");


--
-- Name: uniq_account_type_requests_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uniq_account_type_requests_pending" ON "public"."account_type_requests" USING "btree" ("user_id", "requested_type") WHERE ("status" = 'pending'::"text");


--
-- Name: uniq_user_flags_open; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uniq_user_flags_open" ON "public"."user_flags" USING "btree" ("user_id", "flag_type") WHERE ("status" = 'open'::"text");


--
-- Name: user_bans_plaza_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "user_bans_plaza_idx" ON "public"."user_bans" USING "btree" ("plaza_id", "created_at" DESC);


--
-- Name: user_bans_user_plaza_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "user_bans_user_plaza_active_idx" ON "public"."user_bans" USING "btree" ("user_id", "plaza_id") WHERE ("lifted_at" IS NULL);


--
-- Name: user_push_tokens_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "user_push_tokens_user_idx" ON "public"."user_push_tokens" USING "btree" ("user_id");


--
-- Name: visitor_logs_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "visitor_logs_created_idx" ON "public"."visitor_logs" USING "btree" ("created_at" DESC);


--
-- Name: visitor_logs_plaza_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "visitor_logs_plaza_id_idx" ON "public"."visitor_logs" USING "btree" ("plaza_id");


--
-- Name: vr_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vr_status_idx" ON "public"."verification_requests" USING "btree" ("status");


--
-- Name: vr_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vr_type_idx" ON "public"."verification_requests" USING "btree" ("type");


--
-- Name: vr_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vr_user_idx" ON "public"."verification_requests" USING "btree" ("user_id");


--
-- Name: ai_video_jobs ai_video_jobs_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ai_video_jobs_touch_updated_at" BEFORE UPDATE ON "public"."ai_video_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."touch_ai_video_jobs_updated_at"();


--
-- Name: plazas auto_grant_super_on_plaza_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "auto_grant_super_on_plaza_insert" AFTER INSERT ON "public"."plazas" FOR EACH ROW EXECUTE FUNCTION "public"."grant_super_admins_to_new_plaza"();


--
-- Name: board_posts board_posts_enforce_region_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "board_posts_enforce_region_trg" BEFORE INSERT OR UPDATE OF "region" ON "public"."board_posts" FOR EACH ROW EXECUTE FUNCTION "public"."board_posts_enforce_region"();


--
-- Name: favorites favorites_no_self_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "favorites_no_self_trg" BEFORE INSERT ON "public"."favorites" FOR EACH ROW EXECUTE FUNCTION "public"."favorites_no_self"();


--
-- Name: group_buying_orders group_buying_orders_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "group_buying_orders_updated" BEFORE UPDATE ON "public"."group_buying_orders" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_updated_at"();


--
-- Name: local_food_orders local_food_orders_freeze_critical; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "local_food_orders_freeze_critical" BEFORE UPDATE ON "public"."local_food_orders" FOR EACH ROW EXECUTE FUNCTION "public"."trg_local_food_orders_freeze_critical"();


--
-- Name: local_food_orders local_food_orders_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "local_food_orders_updated" BEFORE UPDATE ON "public"."local_food_orders" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_updated_at"();


--
-- Name: producer_settlements producer_settlements_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "producer_settlements_updated" BEFORE UPDATE ON "public"."producer_settlements" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_updated_at"();


--
-- Name: profiles profiles_account_type_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "profiles_account_type_change" AFTER UPDATE OF "account_type" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."trg_sync_properties_on_account_type_change"();


--
-- Name: reviews reviews_after_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "reviews_after_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."trg_reviews_after_change"();


--
-- Name: service_requests service_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "service_requests_updated_at" BEFORE UPDATE ON "public"."service_requests" FOR EACH ROW EXECUTE FUNCTION "public"."service_requests_touch_updated_at"();


--
-- Name: commission_rates set_commission_rates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "set_commission_rates_updated_at" BEFORE UPDATE ON "public"."commission_rates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: plaza_settlements set_plaza_settlements_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "set_plaza_settlements_updated_at" BEFORE UPDATE ON "public"."plaza_settlements" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: account_type_requests trg_account_type_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_account_type_requests_updated_at" BEFORE UPDATE ON "public"."account_type_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_account_type_requests_updated_at"();


--
-- Name: clubs trg_add_club_owner; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_add_club_owner" AFTER INSERT ON "public"."clubs" FOR EACH ROW EXECUTE FUNCTION "public"."add_club_owner_as_member"();


--
-- Name: group_buying_posts trg_add_gb_owner; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_add_gb_owner" AFTER INSERT ON "public"."group_buying_posts" FOR EACH ROW EXECUTE FUNCTION "public"."add_gb_owner_as_participant"();


--
-- Name: app_versions trg_app_versions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_app_versions_updated_at" BEFORE UPDATE ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "public"."billing_set_updated_at"();


--
-- Name: account_type_requests trg_apply_approved_account_type; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_apply_approved_account_type" AFTER UPDATE ON "public"."account_type_requests" FOR EACH ROW EXECUTE FUNCTION "public"."apply_approved_account_type"();


--
-- Name: boost_orders trg_boost_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_boost_orders_updated_at" BEFORE UPDATE ON "public"."boost_orders" FOR EACH ROW EXECUTE FUNCTION "public"."billing_set_updated_at"();


--
-- Name: business_declarations trg_business_declarations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_business_declarations_updated_at" BEFORE UPDATE ON "public"."business_declarations" FOR EACH ROW EXECUTE FUNCTION "public"."billing_set_updated_at"();


--
-- Name: commission_rates trg_commission_rates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_commission_rates_updated_at" BEFORE UPDATE ON "public"."commission_rates" FOR EACH ROW EXECUTE FUNCTION "public"."billing_set_updated_at"();


--
-- Name: commission_splits trg_commission_splits_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_commission_splits_updated_at" BEFORE UPDATE ON "public"."commission_splits" FOR EACH ROW EXECUTE FUNCTION "public"."billing_set_updated_at"();


--
-- Name: faqs trg_faqs_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_faqs_updated" BEFORE UPDATE ON "public"."faqs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: hero_banners trg_hero_banners_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_hero_banners_updated" BEFORE UPDATE ON "public"."hero_banners" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: notices trg_notices_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_notices_updated" BEFORE UPDATE ON "public"."notices" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: payments trg_payments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_payments_updated_at" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."billing_set_updated_at"();


--
-- Name: payouts trg_payouts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_payouts_updated_at" BEFORE UPDATE ON "public"."payouts" FOR EACH ROW EXECUTE FUNCTION "public"."billing_set_updated_at"();


--
-- Name: plaza_settings trg_plaza_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_plaza_settings_updated_at" BEFORE UPDATE ON "public"."plaza_settings" FOR EACH ROW EXECUTE FUNCTION "public"."billing_set_updated_at"();


--
-- Name: plaza_settlements trg_plaza_settlements_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_plaza_settlements_updated_at" BEFORE UPDATE ON "public"."plaza_settlements" FOR EACH ROW EXECUTE FUNCTION "public"."billing_set_updated_at"();


--
-- Name: point_redemption_settings trg_point_redemption_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_point_redemption_settings_updated_at" BEFORE UPDATE ON "public"."point_redemption_settings" FOR EACH ROW EXECUTE FUNCTION "public"."billing_set_updated_at"();


--
-- Name: point_rules trg_point_rules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_point_rules_updated_at" BEFORE UPDATE ON "public"."point_rules" FOR EACH ROW EXECUTE FUNCTION "public"."billing_set_updated_at"();


--
-- Name: popups trg_popups_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_popups_updated" BEFORE UPDATE ON "public"."popups" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: refund_requests trg_refund_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_refund_requests_updated_at" BEFORE UPDATE ON "public"."refund_requests" FOR EACH ROW EXECUTE FUNCTION "public"."billing_set_updated_at"();


--
-- Name: site_settings trg_site_settings_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_site_settings_updated" BEFORE UPDATE ON "public"."site_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: subscriptions trg_subscriptions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_subscriptions_updated_at" BEFORE UPDATE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."billing_set_updated_at"();


--
-- Name: transactions trg_transactions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_transactions_updated_at" BEFORE UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."billing_set_updated_at"();


--
-- Name: board_comments trg_update_comment_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_update_comment_count" AFTER INSERT OR DELETE ON "public"."board_comments" FOR EACH ROW EXECUTE FUNCTION "public"."update_post_comment_count"();


--
-- Name: board_post_likes trg_update_like_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_update_like_count" AFTER INSERT OR DELETE ON "public"."board_post_likes" FOR EACH ROW EXECUTE FUNCTION "public"."update_post_like_count"();


--
-- Name: user_flags trg_user_flags_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_user_flags_updated_at" BEFORE UPDATE ON "public"."user_flags" FOR EACH ROW EXECUTE FUNCTION "public"."billing_set_updated_at"();


--
-- Name: user_points trg_user_points_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_user_points_updated_at" BEFORE UPDATE ON "public"."user_points" FOR EACH ROW EXECUTE FUNCTION "public"."billing_set_updated_at"();


--
-- Name: reviews trigger_update_trust_score; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trigger_update_trust_score" AFTER INSERT OR DELETE OR UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."update_trust_score"();


--
-- Name: user_push_tokens user_push_tokens_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "user_push_tokens_touch" BEFORE UPDATE ON "public"."user_push_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."touch_user_push_tokens_updated_at"();


--
-- Name: account_type_requests account_type_requests_plaza_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."account_type_requests"
    ADD CONSTRAINT "account_type_requests_plaza_id_fkey" FOREIGN KEY ("plaza_id") REFERENCES "public"."plazas"("id") ON DELETE SET NULL;


--
-- Name: account_type_requests account_type_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."account_type_requests"
    ADD CONSTRAINT "account_type_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;


--
-- Name: account_type_requests account_type_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."account_type_requests"
    ADD CONSTRAINT "account_type_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: admin_actions admin_actions_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_actions"
    ADD CONSTRAINT "admin_actions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: admin_backup_logs admin_backup_logs_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_backup_logs"
    ADD CONSTRAINT "admin_backup_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: admin_mail_log admin_mail_log_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_mail_log"
    ADD CONSTRAINT "admin_mail_log_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: admin_permissions admin_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_permissions"
    ADD CONSTRAINT "admin_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: admin_permissions admin_permissions_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_permissions"
    ADD CONSTRAINT "admin_permissions_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: admin_user_memos admin_user_memos_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_user_memos"
    ADD CONSTRAINT "admin_user_memos_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."profiles"("id");


--
-- Name: admin_user_memos admin_user_memos_plaza_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_user_memos"
    ADD CONSTRAINT "admin_user_memos_plaza_id_fkey" FOREIGN KEY ("plaza_id") REFERENCES "public"."plazas"("id");


--
-- Name: admin_user_memos admin_user_memos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_user_memos"
    ADD CONSTRAINT "admin_user_memos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: ai_video_jobs ai_video_jobs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_video_jobs"
    ADD CONSTRAINT "ai_video_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: audit_log audit_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: block_users block_users_blocked_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."block_users"
    ADD CONSTRAINT "block_users_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: block_users block_users_blocker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."block_users"
    ADD CONSTRAINT "block_users_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: board_comments board_comments_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."board_comments"
    ADD CONSTRAINT "board_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."board_comments"("id") ON DELETE CASCADE;


--
-- Name: board_comments board_comments_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."board_comments"
    ADD CONSTRAINT "board_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."board_posts"("id") ON DELETE CASCADE;


--
-- Name: board_comments board_comments_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."board_comments"
    ADD CONSTRAINT "board_comments_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: board_post_likes board_post_likes_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."board_post_likes"
    ADD CONSTRAINT "board_post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."board_posts"("id") ON DELETE CASCADE;


--
-- Name: board_post_likes board_post_likes_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."board_post_likes"
    ADD CONSTRAINT "board_post_likes_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: board_posts board_posts_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."board_posts"
    ADD CONSTRAINT "board_posts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."board_categories"("id") ON DELETE CASCADE;


--
-- Name: board_posts board_posts_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."board_posts"
    ADD CONSTRAINT "board_posts_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE SET NULL;


--
-- Name: board_posts board_posts_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."board_posts"
    ADD CONSTRAINT "board_posts_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: boost_orders boost_orders_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."boost_orders"
    ADD CONSTRAINT "boost_orders_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE SET NULL;


--
-- Name: boost_orders boost_orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."boost_orders"
    ADD CONSTRAINT "boost_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: bump_daily bump_daily_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bump_daily"
    ADD CONSTRAINT "bump_daily_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: bump_history bump_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bump_history"
    ADD CONSTRAINT "bump_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: bump_ticket_orders bump_ticket_orders_pack_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bump_ticket_orders"
    ADD CONSTRAINT "bump_ticket_orders_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "public"."bump_ticket_packs"("id");


--
-- Name: bump_ticket_orders bump_ticket_orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bump_ticket_orders"
    ADD CONSTRAINT "bump_ticket_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: bump_tickets bump_tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bump_tickets"
    ADD CONSTRAINT "bump_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: business_declarations business_declarations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."business_declarations"
    ADD CONSTRAINT "business_declarations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: business_declarations business_declarations_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."business_declarations"
    ADD CONSTRAINT "business_declarations_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: categories categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id");


--
-- Name: chat_room_participants chat_room_participants_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chat_room_participants"
    ADD CONSTRAINT "chat_room_participants_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE CASCADE;


--
-- Name: chat_room_participants chat_room_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chat_room_participants"
    ADD CONSTRAINT "chat_room_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: chat_room_participants chat_room_participants_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chat_room_participants"
    ADD CONSTRAINT "chat_room_participants_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: chat_rooms chat_rooms_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chat_rooms"
    ADD CONSTRAINT "chat_rooms_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: chat_rooms chat_rooms_buyer_plaza_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chat_rooms"
    ADD CONSTRAINT "chat_rooms_buyer_plaza_id_fkey" FOREIGN KEY ("buyer_plaza_id") REFERENCES "public"."plazas"("id");


--
-- Name: chat_rooms chat_rooms_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chat_rooms"
    ADD CONSTRAINT "chat_rooms_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: cleaning_favorites cleaning_favorites_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cleaning_favorites"
    ADD CONSTRAINT "cleaning_favorites_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."cleaning_posts"("id") ON DELETE CASCADE;


--
-- Name: cleaning_favorites cleaning_favorites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cleaning_favorites"
    ADD CONSTRAINT "cleaning_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: cleaning_posts cleaning_posts_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cleaning_posts"
    ADD CONSTRAINT "cleaning_posts_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE SET NULL;


--
-- Name: cleaning_posts cleaning_posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cleaning_posts"
    ADD CONSTRAINT "cleaning_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: cleaning_posts cleaning_posts_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cleaning_posts"
    ADD CONSTRAINT "cleaning_posts_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: club_chat_messages club_chat_messages_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."club_chat_messages"
    ADD CONSTRAINT "club_chat_messages_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;


--
-- Name: club_chat_messages club_chat_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."club_chat_messages"
    ADD CONSTRAINT "club_chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: club_chat_messages club_chat_messages_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."club_chat_messages"
    ADD CONSTRAINT "club_chat_messages_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: club_likes club_likes_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."club_likes"
    ADD CONSTRAINT "club_likes_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;


--
-- Name: club_likes club_likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."club_likes"
    ADD CONSTRAINT "club_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: club_likes club_likes_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."club_likes"
    ADD CONSTRAINT "club_likes_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: club_members club_members_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."club_members"
    ADD CONSTRAINT "club_members_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;


--
-- Name: club_members club_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."club_members"
    ADD CONSTRAINT "club_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: club_members club_members_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."club_members"
    ADD CONSTRAINT "club_members_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: clubs clubs_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clubs"
    ADD CONSTRAINT "clubs_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE SET NULL;


--
-- Name: clubs clubs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clubs"
    ADD CONSTRAINT "clubs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: clubs clubs_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clubs"
    ADD CONSTRAINT "clubs_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: commission_rates commission_rates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."commission_rates"
    ADD CONSTRAINT "commission_rates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: commission_rates commission_rates_plaza_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."commission_rates"
    ADD CONSTRAINT "commission_rates_plaza_id_fkey" FOREIGN KEY ("plaza_id") REFERENCES "public"."plazas"("id") ON DELETE CASCADE;


--
-- Name: commission_splits commission_splits_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."commission_splits"
    ADD CONSTRAINT "commission_splits_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE CASCADE;


--
-- Name: credit_purchases credit_purchases_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."credit_purchases"
    ADD CONSTRAINT "credit_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: expert_invitations expert_invitations_chat_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."expert_invitations"
    ADD CONSTRAINT "expert_invitations_chat_room_id_fkey" FOREIGN KEY ("chat_room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE CASCADE;


--
-- Name: expert_invitations expert_invitations_expert_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."expert_invitations"
    ADD CONSTRAINT "expert_invitations_expert_id_fkey" FOREIGN KEY ("expert_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: expert_invitations expert_invitations_inviter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."expert_invitations"
    ADD CONSTRAINT "expert_invitations_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: expert_invitations expert_invitations_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."expert_invitations"
    ADD CONSTRAINT "expert_invitations_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE SET NULL;


--
-- Name: favorites favorites_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;


--
-- Name: favorites favorites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: favorites favorites_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: feature_flags feature_flags_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."feature_flags"
    ADD CONSTRAINT "feature_flags_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: group_buying_participants fk_group_buying_participants_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."group_buying_participants"
    ADD CONSTRAINT "fk_group_buying_participants_user" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: follows follows_follower_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: follows follows_following_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: follows follows_plaza_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_plaza_id_fkey" FOREIGN KEY ("plaza_id") REFERENCES "public"."plazas"("id");


--
-- Name: group_buying_chat_messages group_buying_chat_messages_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."group_buying_chat_messages"
    ADD CONSTRAINT "group_buying_chat_messages_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."group_buying_posts"("id") ON DELETE CASCADE;


--
-- Name: group_buying_chat_messages group_buying_chat_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."group_buying_chat_messages"
    ADD CONSTRAINT "group_buying_chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: group_buying_chat_messages group_buying_chat_messages_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."group_buying_chat_messages"
    ADD CONSTRAINT "group_buying_chat_messages_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: group_buying_orders group_buying_orders_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."group_buying_orders"
    ADD CONSTRAINT "group_buying_orders_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;


--
-- Name: group_buying_orders group_buying_orders_buyer_plaza_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."group_buying_orders"
    ADD CONSTRAINT "group_buying_orders_buyer_plaza_id_fkey" FOREIGN KEY ("buyer_plaza_id") REFERENCES "public"."plazas"("id");


--
-- Name: group_buying_orders group_buying_orders_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."group_buying_orders"
    ADD CONSTRAINT "group_buying_orders_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."group_buying_posts"("id") ON DELETE RESTRICT;


--
-- Name: group_buying_orders group_buying_orders_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."group_buying_orders"
    ADD CONSTRAINT "group_buying_orders_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;


--
-- Name: group_buying_participants group_buying_participants_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."group_buying_participants"
    ADD CONSTRAINT "group_buying_participants_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."group_buying_posts"("id") ON DELETE CASCADE;


--
-- Name: group_buying_participants group_buying_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."group_buying_participants"
    ADD CONSTRAINT "group_buying_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: group_buying_participants group_buying_participants_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."group_buying_participants"
    ADD CONSTRAINT "group_buying_participants_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: group_buying_posts group_buying_posts_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."group_buying_posts"
    ADD CONSTRAINT "group_buying_posts_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE SET NULL;


--
-- Name: group_buying_posts group_buying_posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."group_buying_posts"
    ADD CONSTRAINT "group_buying_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: group_buying_posts group_buying_posts_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."group_buying_posts"
    ADD CONSTRAINT "group_buying_posts_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: group_buying_wishlist group_buying_wishlist_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."group_buying_wishlist"
    ADD CONSTRAINT "group_buying_wishlist_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."group_buying_posts"("id") ON DELETE CASCADE;


--
-- Name: group_buying_wishlist group_buying_wishlist_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."group_buying_wishlist"
    ADD CONSTRAINT "group_buying_wishlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: group_buying_wishlist group_buying_wishlist_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."group_buying_wishlist"
    ADD CONSTRAINT "group_buying_wishlist_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: homepage_menu homepage_menu_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."homepage_menu"
    ADD CONSTRAINT "homepage_menu_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."homepage_menu"("id") ON DELETE CASCADE;


--
-- Name: interior_favorites interior_favorites_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."interior_favorites"
    ADD CONSTRAINT "interior_favorites_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."interior_posts"("id") ON DELETE CASCADE;


--
-- Name: interior_favorites interior_favorites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."interior_favorites"
    ADD CONSTRAINT "interior_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: interior_favorites interior_favorites_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."interior_favorites"
    ADD CONSTRAINT "interior_favorites_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: interior_posts interior_posts_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."interior_posts"
    ADD CONSTRAINT "interior_posts_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE SET NULL;


--
-- Name: interior_posts interior_posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."interior_posts"
    ADD CONSTRAINT "interior_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: interior_posts interior_posts_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."interior_posts"
    ADD CONSTRAINT "interior_posts_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: jobs_likes jobs_likes_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."jobs_likes"
    ADD CONSTRAINT "jobs_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."jobs_posts"("id") ON DELETE CASCADE;


--
-- Name: jobs_likes jobs_likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."jobs_likes"
    ADD CONSTRAINT "jobs_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: jobs_posts jobs_posts_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."jobs_posts"
    ADD CONSTRAINT "jobs_posts_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE SET NULL;


--
-- Name: jobs_posts jobs_posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."jobs_posts"
    ADD CONSTRAINT "jobs_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: local_food_likes local_food_likes_local_food_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_food_likes"
    ADD CONSTRAINT "local_food_likes_local_food_id_fkey" FOREIGN KEY ("local_food_id") REFERENCES "public"."local_food"("id") ON DELETE CASCADE;


--
-- Name: local_food_likes local_food_likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_food_likes"
    ADD CONSTRAINT "local_food_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: local_food_likes local_food_likes_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_food_likes"
    ADD CONSTRAINT "local_food_likes_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: local_food_order_items local_food_order_items_local_food_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_food_order_items"
    ADD CONSTRAINT "local_food_order_items_local_food_id_fkey" FOREIGN KEY ("local_food_id") REFERENCES "public"."local_food"("id") ON DELETE RESTRICT;


--
-- Name: local_food_order_items local_food_order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_food_order_items"
    ADD CONSTRAINT "local_food_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."local_food_orders"("id") ON DELETE CASCADE;


--
-- Name: local_food_orders local_food_orders_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_food_orders"
    ADD CONSTRAINT "local_food_orders_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;


--
-- Name: local_food_orders local_food_orders_buyer_plaza_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_food_orders"
    ADD CONSTRAINT "local_food_orders_buyer_plaza_id_fkey" FOREIGN KEY ("buyer_plaza_id") REFERENCES "public"."plazas"("id");


--
-- Name: local_food_orders local_food_orders_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_food_orders"
    ADD CONSTRAINT "local_food_orders_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;


--
-- Name: local_food local_food_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_food"
    ADD CONSTRAINT "local_food_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE SET NULL;


--
-- Name: local_food local_food_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_food"
    ADD CONSTRAINT "local_food_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: local_food local_food_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_food"
    ADD CONSTRAINT "local_food_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: messages messages_chat_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_chat_room_id_fkey" FOREIGN KEY ("chat_room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE CASCADE;


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: moderation_keywords moderation_keywords_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."moderation_keywords"
    ADD CONSTRAINT "moderation_keywords_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: moving_favorites moving_favorites_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."moving_favorites"
    ADD CONSTRAINT "moving_favorites_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."moving_posts"("id") ON DELETE CASCADE;


--
-- Name: moving_favorites moving_favorites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."moving_favorites"
    ADD CONSTRAINT "moving_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: moving_posts moving_posts_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."moving_posts"
    ADD CONSTRAINT "moving_posts_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE SET NULL;


--
-- Name: moving_posts moving_posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."moving_posts"
    ADD CONSTRAINT "moving_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: moving_posts moving_posts_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."moving_posts"
    ADD CONSTRAINT "moving_posts_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: new_store_likes new_store_likes_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."new_store_likes"
    ADD CONSTRAINT "new_store_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."new_store_posts"("id") ON DELETE CASCADE;


--
-- Name: new_store_likes new_store_likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."new_store_likes"
    ADD CONSTRAINT "new_store_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: new_store_posts new_store_posts_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."new_store_posts"
    ADD CONSTRAINT "new_store_posts_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE SET NULL;


--
-- Name: new_store_posts new_store_posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."new_store_posts"
    ADD CONSTRAINT "new_store_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: new_store_posts new_store_posts_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."new_store_posts"
    ADD CONSTRAINT "new_store_posts_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: notices notices_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notices"
    ADD CONSTRAINT "notices_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: notices notices_author_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notices"
    ADD CONSTRAINT "notices_author_id_profiles_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: notifications notifications_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;


--
-- Name: notifications notifications_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: page_heroes page_heroes_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."page_heroes"
    ADD CONSTRAINT "page_heroes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: payments payments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: payout_batches payout_batches_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payout_batches"
    ADD CONSTRAINT "payout_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: payouts payouts_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: payouts payouts_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."payout_batches"("id") ON DELETE CASCADE;


--
-- Name: payouts payouts_plaza_association_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_plaza_association_id_fkey" FOREIGN KEY ("plaza_association_id") REFERENCES "public"."plaza_associations"("id") ON DELETE RESTRICT;


--
-- Name: plaza_admins plaza_admins_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."plaza_admins"
    ADD CONSTRAINT "plaza_admins_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id");


--
-- Name: plaza_admins plaza_admins_plaza_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."plaza_admins"
    ADD CONSTRAINT "plaza_admins_plaza_id_fkey" FOREIGN KEY ("plaza_id") REFERENCES "public"."plazas"("id") ON DELETE CASCADE;


--
-- Name: plaza_admins plaza_admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."plaza_admins"
    ADD CONSTRAINT "plaza_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: plaza_associations plaza_associations_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."plaza_associations"
    ADD CONSTRAINT "plaza_associations_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: plaza_profiles plaza_profiles_plaza_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."plaza_profiles"
    ADD CONSTRAINT "plaza_profiles_plaza_id_fkey" FOREIGN KEY ("plaza_id") REFERENCES "public"."plazas"("id") ON DELETE CASCADE;


--
-- Name: plaza_profiles plaza_profiles_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."plaza_profiles"
    ADD CONSTRAINT "plaza_profiles_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id");


--
-- Name: plaza_profiles plaza_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."plaza_profiles"
    ADD CONSTRAINT "plaza_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: plaza_settlements plaza_settlements_plaza_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."plaza_settlements"
    ADD CONSTRAINT "plaza_settlements_plaza_id_fkey" FOREIGN KEY ("plaza_id") REFERENCES "public"."plazas"("id") ON DELETE CASCADE;


--
-- Name: plaza_settlements plaza_settlements_settled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."plaza_settlements"
    ADD CONSTRAINT "plaza_settlements_settled_by_fkey" FOREIGN KEY ("settled_by") REFERENCES "auth"."users"("id");


--
-- Name: point_daily_counters point_daily_counters_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."point_daily_counters"
    ADD CONSTRAINT "point_daily_counters_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "public"."point_rules"("id") ON DELETE CASCADE;


--
-- Name: point_daily_counters point_daily_counters_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."point_daily_counters"
    ADD CONSTRAINT "point_daily_counters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: point_history point_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."point_history"
    ADD CONSTRAINT "point_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: point_history point_history_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."point_history"
    ADD CONSTRAINT "point_history_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: point_transactions point_transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."point_transactions"
    ADD CONSTRAINT "point_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: point_transactions point_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."point_transactions"
    ADD CONSTRAINT "point_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: popular_searches popular_searches_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."popular_searches"
    ADD CONSTRAINT "popular_searches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: popular_searches popular_searches_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."popular_searches"
    ADD CONSTRAINT "popular_searches_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: post_reports post_reports_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."post_reports"
    ADD CONSTRAINT "post_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: post_reports post_reports_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."post_reports"
    ADD CONSTRAINT "post_reports_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id");


--
-- Name: producer_settlements producer_settlements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."producer_settlements"
    ADD CONSTRAINT "producer_settlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: profile_highlights profile_highlights_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profile_highlights"
    ADD CONSTRAINT "profile_highlights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: properties properties_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."properties"
    ADD CONSTRAINT "properties_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE SET NULL;


--
-- Name: properties properties_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."properties"
    ADD CONSTRAINT "properties_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: properties properties_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."properties"
    ADD CONSTRAINT "properties_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: property_highlights property_highlights_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."property_highlights"
    ADD CONSTRAINT "property_highlights_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: property_reports property_reports_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."property_reports"
    ADD CONSTRAINT "property_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: property_reports property_reports_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."property_reports"
    ADD CONSTRAINT "property_reports_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: property_request_responses property_request_responses_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."property_request_responses"
    ADD CONSTRAINT "property_request_responses_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE SET NULL;


--
-- Name: property_request_responses property_request_responses_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."property_request_responses"
    ADD CONSTRAINT "property_request_responses_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."property_requests"("id") ON DELETE CASCADE;


--
-- Name: property_request_responses property_request_responses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."property_request_responses"
    ADD CONSTRAINT "property_request_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: property_requests property_requests_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."property_requests"
    ADD CONSTRAINT "property_requests_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE SET NULL;


--
-- Name: property_requests property_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."property_requests"
    ADD CONSTRAINT "property_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: refund_requests refund_requests_processed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: refund_requests refund_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: regions regions_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."regions"
    ADD CONSTRAINT "regions_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."regions"("id");


--
-- Name: repair_favorites repair_favorites_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."repair_favorites"
    ADD CONSTRAINT "repair_favorites_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."repair_posts"("id") ON DELETE CASCADE;


--
-- Name: repair_favorites repair_favorites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."repair_favorites"
    ADD CONSTRAINT "repair_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: repair_posts repair_posts_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."repair_posts"
    ADD CONSTRAINT "repair_posts_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE SET NULL;


--
-- Name: repair_posts repair_posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."repair_posts"
    ADD CONSTRAINT "repair_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: repair_posts repair_posts_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."repair_posts"
    ADD CONSTRAINT "repair_posts_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: reviews reviews_chat_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_chat_room_id_fkey" FOREIGN KEY ("chat_room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE SET NULL;


--
-- Name: reviews reviews_plaza_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_plaza_id_fkey" FOREIGN KEY ("plaza_id") REFERENCES "public"."plazas"("id");


--
-- Name: reviews reviews_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE SET NULL;


--
-- Name: reviews reviews_reviewed_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_reviewed_user_id_fkey" FOREIGN KEY ("reviewed_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: reviews reviews_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: search_term_blacklist search_term_blacklist_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."search_term_blacklist"
    ADD CONSTRAINT "search_term_blacklist_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: secondhand_likes secondhand_likes_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."secondhand_likes"
    ADD CONSTRAINT "secondhand_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."secondhand_posts"("id") ON DELETE CASCADE;


--
-- Name: secondhand_likes secondhand_likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."secondhand_likes"
    ADD CONSTRAINT "secondhand_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: secondhand_posts secondhand_posts_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."secondhand_posts"
    ADD CONSTRAINT "secondhand_posts_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE SET NULL;


--
-- Name: secondhand_posts secondhand_posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."secondhand_posts"
    ADD CONSTRAINT "secondhand_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: service_request_responses service_request_responses_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."service_request_responses"
    ADD CONSTRAINT "service_request_responses_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."service_requests"("id") ON DELETE CASCADE;


--
-- Name: service_request_responses service_request_responses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."service_request_responses"
    ADD CONSTRAINT "service_request_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: service_requests service_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."service_requests"
    ADD CONSTRAINT "service_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: sharing_likes sharing_likes_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sharing_likes"
    ADD CONSTRAINT "sharing_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."sharing_posts"("id") ON DELETE CASCADE;


--
-- Name: sharing_likes sharing_likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sharing_likes"
    ADD CONSTRAINT "sharing_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: sharing_posts sharing_posts_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sharing_posts"
    ADD CONSTRAINT "sharing_posts_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE SET NULL;


--
-- Name: sharing_posts sharing_posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sharing_posts"
    ADD CONSTRAINT "sharing_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: sharing_posts sharing_posts_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sharing_posts"
    ADD CONSTRAINT "sharing_posts_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: site_settings site_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."site_settings"
    ADD CONSTRAINT "site_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");


--
-- Name: subscriptions subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id");


--
-- Name: subscriptions subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: support_inquiries support_inquiries_answered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."support_inquiries"
    ADD CONSTRAINT "support_inquiries_answered_by_fkey" FOREIGN KEY ("answered_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: support_inquiries support_inquiries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."support_inquiries"
    ADD CONSTRAINT "support_inquiries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: support_inquiries support_inquiries_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."support_inquiries"
    ADD CONSTRAINT "support_inquiries_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: transactions transactions_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: transactions transactions_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE SET NULL;


--
-- Name: transactions transactions_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: user_bans user_bans_banned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_bans"
    ADD CONSTRAINT "user_bans_banned_by_fkey" FOREIGN KEY ("banned_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: user_bans user_bans_lifted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_bans"
    ADD CONSTRAINT "user_bans_lifted_by_fkey" FOREIGN KEY ("lifted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: user_bans user_bans_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_bans"
    ADD CONSTRAINT "user_bans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: user_flags user_flags_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_flags"
    ADD CONSTRAINT "user_flags_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: user_flags user_flags_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_flags"
    ADD CONSTRAINT "user_flags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: user_points user_points_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_points"
    ADD CONSTRAINT "user_points_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: user_push_tokens user_push_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_push_tokens"
    ADD CONSTRAINT "user_push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: verification_requests verification_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."verification_requests"
    ADD CONSTRAINT "verification_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id");


--
-- Name: verification_requests verification_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."verification_requests"
    ADD CONSTRAINT "verification_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: verification_requests verification_requests_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."verification_requests"
    ADD CONSTRAINT "verification_requests_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: visitor_logs visitor_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."visitor_logs"
    ADD CONSTRAINT "visitor_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");


--
-- Name: visitor_logs visitor_logs_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."visitor_logs"
    ADD CONSTRAINT "visitor_logs_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: chuncheon_events Admin manage chuncheon_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin manage chuncheon_events" ON "public"."chuncheon_events" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: profiles Admins can delete profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete profiles" ON "public"."profiles" FOR DELETE USING ((("auth"."uid"() IN ( SELECT "profiles_1"."id"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))) AND ("auth"."uid"() <> "id")));


--
-- Name: hero_banners Admins can manage banners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage banners" ON "public"."hero_banners" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: page_heroes Admins can manage page_heroes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage page_heroes" ON "public"."page_heroes" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: profiles Admins can update all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update all profiles" ON "public"."profiles" FOR UPDATE USING ((("auth"."uid"() IN ( SELECT "profiles_1"."id"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))) OR (EXISTS ( SELECT 1
   FROM "public"."plaza_admins" "pa"
  WHERE (("pa"."user_id" = "auth"."uid"()) AND ("pa"."role" = 'super'::"text")))))) WITH CHECK ((("id" <> "auth"."uid"()) AND (("auth"."uid"() IN ( SELECT "profiles_1"."id"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."role" = 'superadmin'::"text"))) OR (EXISTS ( SELECT 1
   FROM "public"."plaza_admins" "pa"
  WHERE (("pa"."user_id" = "auth"."uid"()) AND ("pa"."role" = 'super'::"text")))) OR (("auth"."uid"() IN ( SELECT "profiles_1"."id"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."role" = 'admin'::"text"))) AND (NOT ("role" IS DISTINCT FROM ( SELECT "p2"."role"
   FROM "public"."profiles" "p2"
  WHERE ("p2"."id" = "profiles"."id"))))))));


--
-- Name: page_heroes Anyone can read page_heroes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read page_heroes" ON "public"."page_heroes" FOR SELECT USING (true);


--
-- Name: hero_banners Anyone can view active banners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active banners" ON "public"."hero_banners" FOR SELECT USING (true);


--
-- Name: board_categories Anyone can view board categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view board categories" ON "public"."board_categories" FOR SELECT USING (true);


--
-- Name: board_posts Anyone can view board posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view board posts" ON "public"."board_posts" FOR SELECT USING (true);


--
-- Name: club_likes Anyone can view club_likes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view club_likes" ON "public"."club_likes" FOR SELECT USING (true);


--
-- Name: clubs Anyone can view clubs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view clubs" ON "public"."clubs" FOR SELECT USING (true);


--
-- Name: group_buying_posts Anyone can view group buying posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view group buying posts" ON "public"."group_buying_posts" FOR SELECT USING (true);


--
-- Name: local_food Anyone can view local_food; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view local_food" ON "public"."local_food" FOR SELECT USING (true);


--
-- Name: local_food_likes Anyone can view local_food_likes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view local_food_likes" ON "public"."local_food_likes" FOR SELECT USING (true);


--
-- Name: new_store_posts Anyone can view new store posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view new store posts" ON "public"."new_store_posts" FOR SELECT USING (true);


--
-- Name: group_buying_participants Anyone can view participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view participants" ON "public"."group_buying_participants" FOR SELECT USING (true);


--
-- Name: sharing_posts Anyone can view sharing posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view sharing posts" ON "public"."sharing_posts" FOR SELECT USING (true);


--
-- Name: group_buying_wishlist Anyone can view wishlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view wishlist" ON "public"."group_buying_wishlist" FOR SELECT USING (true);


--
-- Name: board_posts Authenticated users can create posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create posts" ON "public"."board_posts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: sharing_posts Authenticated users can create sharing posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create sharing posts" ON "public"."sharing_posts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: clubs Authenticated users can insert clubs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert clubs" ON "public"."clubs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: local_food Authenticated users can insert local_food; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert local_food" ON "public"."local_food" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: group_buying_participants Authenticated users can join; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can join" ON "public"."group_buying_participants" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: expert_invitations Authenticated users can view invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view invitations" ON "public"."expert_invitations" FOR SELECT USING (("auth"."uid"() IS NOT NULL));


--
-- Name: clubs Authors can delete clubs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authors can delete clubs" ON "public"."clubs" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: local_food Authors can delete local_food; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authors can delete local_food" ON "public"."local_food" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: clubs Authors can update clubs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authors can update clubs" ON "public"."clubs" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: local_food Authors can update local_food; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authors can update local_food" ON "public"."local_food" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: group_buying_posts Business owners can create group buying posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Business owners can create group buying posts" ON "public"."group_buying_posts" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."account_type" = 'business'::"text"))))));


--
-- Name: new_store_posts Business owners can create new store posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Business owners can create new store posts" ON "public"."new_store_posts" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."account_type" = 'business'::"text"))))));


--
-- Name: cleaning_posts Cleaning posts viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Cleaning posts viewable by everyone" ON "public"."cleaning_posts" FOR SELECT USING (true);


--
-- Name: cleaning_posts Cleaning users can create posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Cleaning users can create posts" ON "public"."cleaning_posts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: expert_invitations Experts can respond to invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Experts can respond to invitations" ON "public"."expert_invitations" FOR UPDATE USING (("auth"."uid"() = "expert_id"));


--
-- Name: interior_posts Interior posts are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Interior posts are viewable by everyone" ON "public"."interior_posts" FOR SELECT USING (true);


--
-- Name: interior_posts Interior users can create posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Interior users can create posts" ON "public"."interior_posts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: club_chat_messages Members insert club_chat_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members insert club_chat_messages" ON "public"."club_chat_messages" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."club_members" "cm"
  WHERE (("cm"."club_id" = "club_chat_messages"."club_id") AND ("cm"."user_id" = "auth"."uid"()))))));


--
-- Name: group_buying_chat_messages Members insert gb_chat_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members insert gb_chat_messages" ON "public"."group_buying_chat_messages" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND ((EXISTS ( SELECT 1
   FROM "public"."group_buying_participants" "p"
  WHERE (("p"."post_id" = "group_buying_chat_messages"."post_id") AND ("p"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."group_buying_posts" "gp"
  WHERE (("gp"."id" = "group_buying_chat_messages"."post_id") AND ("gp"."user_id" = "auth"."uid"())))))));


--
-- Name: club_chat_messages Members read club_chat_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members read club_chat_messages" ON "public"."club_chat_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."club_members" "cm"
  WHERE (("cm"."club_id" = "club_chat_messages"."club_id") AND ("cm"."user_id" = "auth"."uid"())))));


--
-- Name: group_buying_chat_messages Members read gb_chat_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members read gb_chat_messages" ON "public"."group_buying_chat_messages" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."group_buying_participants" "p"
  WHERE (("p"."post_id" = "group_buying_chat_messages"."post_id") AND ("p"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."group_buying_posts" "gp"
  WHERE (("gp"."id" = "group_buying_chat_messages"."post_id") AND ("gp"."user_id" = "auth"."uid"()))))));


--
-- Name: moving_posts Moving posts viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Moving posts viewable by everyone" ON "public"."moving_posts" FOR SELECT USING (true);


--
-- Name: moving_posts Moving users can create posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Moving users can create posts" ON "public"."moving_posts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: chuncheon_events Public read chuncheon_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read chuncheon_events" ON "public"."chuncheon_events" FOR SELECT USING (("is_active" = true));


--
-- Name: club_members Public read club_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read club_members" ON "public"."club_members" FOR SELECT USING (true);


--
-- Name: repair_posts Repair posts viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Repair posts viewable by everyone" ON "public"."repair_posts" FOR SELECT USING (true);


--
-- Name: repair_posts Repair users can create posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Repair users can create posts" ON "public"."repair_posts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: reviews Reviews are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Reviews are viewable by everyone" ON "public"."reviews" FOR SELECT USING (true);


--
-- Name: chat_room_participants Room owners can add participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Room owners can add participants" ON "public"."chat_room_participants" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."chat_room_participants" "crp"
  WHERE (("crp"."room_id" = "crp"."room_id") AND ("crp"."user_id" = "auth"."uid"()) AND ("crp"."role" = 'owner'::"text")))) OR ("auth"."uid"() = "user_id")));


--
-- Name: club_chat_messages Self delete club_chat_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Self delete club_chat_messages" ON "public"."club_chat_messages" FOR DELETE USING (("user_id" = "auth"."uid"()));


--
-- Name: club_members Self delete club_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Self delete club_members" ON "public"."club_members" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: group_buying_chat_messages Self delete gb_chat_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Self delete gb_chat_messages" ON "public"."group_buying_chat_messages" FOR DELETE USING (("user_id" = "auth"."uid"()));


--
-- Name: club_members Self update club_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Self update club_members" ON "public"."club_members" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: group_buying_wishlist Users can add to wishlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can add to wishlist" ON "public"."group_buying_wishlist" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: interior_favorites Users can create interior favorites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create interior favorites" ON "public"."interior_favorites" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: expert_invitations Users can create invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create invitations" ON "public"."expert_invitations" FOR INSERT WITH CHECK (("auth"."uid"() = "inviter_id"));


--
-- Name: reviews Users can create reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create reviews" ON "public"."reviews" FOR INSERT WITH CHECK (("auth"."uid"() = "reviewer_id"));


--
-- Name: cleaning_posts Users can delete own cleaning posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own cleaning posts" ON "public"."cleaning_posts" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: group_buying_posts Users can delete own group buying posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own group buying posts" ON "public"."group_buying_posts" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: interior_favorites Users can delete own interior favorites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own interior favorites" ON "public"."interior_favorites" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: interior_posts Users can delete own interior posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own interior posts" ON "public"."interior_posts" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: moving_posts Users can delete own moving posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own moving posts" ON "public"."moving_posts" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: new_store_posts Users can delete own new store posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own new store posts" ON "public"."new_store_posts" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: board_posts Users can delete own posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own posts" ON "public"."board_posts" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: repair_posts Users can delete own repair posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own repair posts" ON "public"."repair_posts" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: reviews Users can delete own reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own reviews" ON "public"."reviews" FOR DELETE USING (("auth"."uid"() = "reviewer_id"));


--
-- Name: sharing_posts Users can delete own sharing posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own sharing posts" ON "public"."sharing_posts" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: messages Users can insert own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own messages" ON "public"."messages" FOR INSERT WITH CHECK (("sender_id" = "auth"."uid"()));


--
-- Name: group_buying_participants Users can leave; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can leave" ON "public"."group_buying_participants" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: club_likes Users can manage their own club_likes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own club_likes" ON "public"."club_likes" USING (("user_id" = "auth"."uid"()));


--
-- Name: local_food_likes Users can manage their own local_food_likes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own local_food_likes" ON "public"."local_food_likes" USING (("user_id" = "auth"."uid"()));


--
-- Name: group_buying_wishlist Users can remove from wishlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can remove from wishlist" ON "public"."group_buying_wishlist" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: cleaning_posts Users can update own cleaning posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own cleaning posts" ON "public"."cleaning_posts" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: group_buying_posts Users can update own group buying posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own group buying posts" ON "public"."group_buying_posts" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: interior_posts Users can update own interior posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own interior posts" ON "public"."interior_posts" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: moving_posts Users can update own moving posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own moving posts" ON "public"."moving_posts" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: new_store_posts Users can update own new store posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own new store posts" ON "public"."new_store_posts" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: board_posts Users can update own posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own posts" ON "public"."board_posts" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: repair_posts Users can update own repair posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own repair posts" ON "public"."repair_posts" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: reviews Users can update own reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own reviews" ON "public"."reviews" FOR UPDATE USING (("auth"."uid"() = "reviewer_id"));


--
-- Name: sharing_posts Users can update own sharing posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own sharing posts" ON "public"."sharing_posts" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: messages Users can view all messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view all messages" ON "public"."messages" FOR SELECT USING (true);


--
-- Name: interior_favorites Users can view own interior favorites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own interior favorites" ON "public"."interior_favorites" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: chat_room_participants Users can view room participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view room participants" ON "public"."chat_room_participants" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."chat_room_participants" "crp"
  WHERE (("crp"."room_id" = "chat_room_participants"."room_id") AND ("crp"."user_id" = "auth"."uid"())))));


--
-- Name: expert_invitations Users can view their invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their invitations" ON "public"."expert_invitations" FOR SELECT USING ((("auth"."uid"() = "inviter_id") OR ("auth"."uid"() = "expert_id")));


--
-- Name: admin_backup_logs abl_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "abl_admin_all" ON "public"."admin_backup_logs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: account_type_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."account_type_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: account_type_requests account_type_requests_insert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account_type_requests_insert_self" ON "public"."account_type_requests" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND ("status" = 'pending'::"text")));


--
-- Name: account_type_requests account_type_requests_select_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account_type_requests_select_self" ON "public"."account_type_requests" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: account_type_requests account_type_requests_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account_type_requests_update" ON "public"."account_type_requests" FOR UPDATE USING (((("user_id" = "auth"."uid"()) AND ("status" = 'pending'::"text")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))))) WITH CHECK (((("user_id" = "auth"."uid"()) AND ("status" = ANY (ARRAY['pending'::"text", 'cancelled'::"text"]))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: admin_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."admin_actions" ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_actions admin_actions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin_actions_select" ON "public"."admin_actions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: admin_backup_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."admin_backup_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: properties admin_can_update_all_properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin_can_update_all_properties" ON "public"."properties" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = 'admin'::"text") OR ("profiles"."role" = 'superadmin'::"text")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = 'admin'::"text") OR ("profiles"."role" = 'superadmin'::"text"))))));


--
-- Name: admin_mail_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."admin_mail_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."admin_permissions" ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_permissions admin_permissions_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin_permissions_all" ON "public"."admin_permissions" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: admin_user_memos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."admin_user_memos" ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_user_memos admin_user_memos_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin_user_memos_delete" ON "public"."admin_user_memos" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."plaza_admins" "pa"
  WHERE (("pa"."user_id" = "auth"."uid"()) AND (("pa"."plaza_id" = "admin_user_memos"."plaza_id") OR ("admin_user_memos"."plaza_id" IS NULL))))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['superadmin'::"text", 'admin'::"text"])))))));


--
-- Name: admin_user_memos admin_user_memos_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin_user_memos_insert" ON "public"."admin_user_memos" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."plaza_admins" "pa"
  WHERE (("pa"."user_id" = "auth"."uid"()) AND (("pa"."plaza_id" = "admin_user_memos"."plaza_id") OR ("admin_user_memos"."plaza_id" IS NULL))))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['superadmin'::"text", 'admin'::"text"])))))));


--
-- Name: admin_user_memos admin_user_memos_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin_user_memos_select" ON "public"."admin_user_memos" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."plaza_admins" "pa"
  WHERE (("pa"."user_id" = "auth"."uid"()) AND (("pa"."plaza_id" = "admin_user_memos"."plaza_id") OR ("admin_user_memos"."plaza_id" IS NULL))))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['superadmin'::"text", 'admin'::"text"])))))));


--
-- Name: admin_user_memos admin_user_memos_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin_user_memos_update" ON "public"."admin_user_memos" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."plaza_admins" "pa"
  WHERE (("pa"."user_id" = "auth"."uid"()) AND (("pa"."plaza_id" = "admin_user_memos"."plaza_id") OR ("admin_user_memos"."plaza_id" IS NULL))))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['superadmin'::"text", 'admin'::"text"])))))));


--
-- Name: ai_video_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ai_video_jobs" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_video_jobs ai_video_jobs_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_video_jobs_insert_own" ON "public"."ai_video_jobs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: ai_video_jobs ai_video_jobs_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_video_jobs_select_own" ON "public"."ai_video_jobs" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: admin_mail_log aml_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aml_admin_all" ON "public"."admin_mail_log" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: site_settings anon_read_maintenance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon_read_maintenance" ON "public"."site_settings" FOR SELECT USING (("key" = ANY (ARRAY['maintenance_mode'::"text", 'maintenance_settings'::"text"])));


--
-- Name: app_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."app_versions" ENABLE ROW LEVEL SECURITY;

--
-- Name: app_versions app_versions admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "app_versions admin manage" ON "public"."app_versions" TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."plaza_admins" "pa"
  WHERE (("pa"."user_id" = "auth"."uid"()) AND ("pa"."plaza_id" = "app_versions"."plaza_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."plaza_admins" "pa"
  WHERE (("pa"."user_id" = "auth"."uid"()) AND ("pa"."plaza_id" = "app_versions"."plaza_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: app_versions app_versions read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "app_versions read" ON "public"."app_versions" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."plaza_admins" "pa"
  WHERE (("pa"."user_id" = "auth"."uid"()) AND ("pa"."plaza_id" = "app_versions"."plaza_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: account_type_requests atr_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "atr_admin_write" ON "public"."account_type_requests" TO "authenticated" USING (("public"."is_app_admin"("auth"."uid"()) OR ("auth"."uid"() = "user_id"))) WITH CHECK (("public"."is_app_admin"("auth"."uid"()) OR ("auth"."uid"() = "user_id")));


--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log audit_log_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "audit_log_admin_read" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ("public"."is_plaza_admin"("auth"."uid"(), "plaza_id"));


--
-- Name: audit_log audit_log_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "audit_log_admin_write" ON "public"."audit_log" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_plaza_admin"("auth"."uid"(), "plaza_id") AND ("actor_id" = "auth"."uid"())));


--
-- Name: block_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."block_users" ENABLE ROW LEVEL SECURITY;

--
-- Name: block_users block_users_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "block_users_delete_own" ON "public"."block_users" FOR DELETE USING (("auth"."uid"() = "blocker_id"));


--
-- Name: block_users block_users_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "block_users_insert_own" ON "public"."block_users" FOR INSERT WITH CHECK (("auth"."uid"() = "blocker_id"));


--
-- Name: block_users block_users_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "block_users_select_own" ON "public"."block_users" FOR SELECT USING (("auth"."uid"() = "blocker_id"));


--
-- Name: board_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."board_categories" ENABLE ROW LEVEL SECURITY;

--
-- Name: board_categories board_categories_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_categories_select" ON "public"."board_categories" FOR SELECT USING (true);


--
-- Name: board_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."board_comments" ENABLE ROW LEVEL SECURITY;

--
-- Name: board_comments board_comments_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_comments_admin_delete" ON "public"."board_comments" FOR DELETE USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: board_comments board_comments_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_comments_admin_select" ON "public"."board_comments" FOR SELECT USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: board_comments board_comments_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_comments_admin_update" ON "public"."board_comments" FOR UPDATE USING ("public"."is_admin_for_plaza"("plaza_id")) WITH CHECK ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: board_comments board_comments_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_comments_delete" ON "public"."board_comments" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: board_comments board_comments_delete_owner_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_comments_delete_owner_or_admin" ON "public"."board_comments" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'superadmin'::"text")))) OR (EXISTS ( SELECT 1
   FROM ("public"."plaza_admins" "pa"
     JOIN "public"."board_comments" "bc" ON (("bc"."id" = "board_comments"."id")))
  WHERE (("pa"."user_id" = "auth"."uid"()) AND ("pa"."plaza_id" = "bc"."plaza_id"))))));


--
-- Name: board_comments board_comments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_comments_insert" ON "public"."board_comments" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: board_comments board_comments_insert_plaza_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_comments_insert_plaza_scoped" ON "public"."board_comments" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND (("plaza_id" IS NULL) OR "public"."user_in_plaza"("plaza_id"))));


--
-- Name: board_comments board_comments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_comments_select" ON "public"."board_comments" FOR SELECT USING ((("status" = 'active'::"text") OR ("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: board_comments board_comments_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_comments_update" ON "public"."board_comments" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))))) WITH CHECK ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: board_comments board_comments_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_comments_update_owner" ON "public"."board_comments" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: board_post_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."board_post_likes" ENABLE ROW LEVEL SECURITY;

--
-- Name: board_post_likes board_post_likes_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_post_likes_delete" ON "public"."board_post_likes" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: board_post_likes board_post_likes_delete_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_post_likes_delete_owner" ON "public"."board_post_likes" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));


--
-- Name: board_post_likes board_post_likes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_post_likes_insert" ON "public"."board_post_likes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: board_post_likes board_post_likes_insert_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_post_likes_insert_owner" ON "public"."board_post_likes" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: board_post_likes board_post_likes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_post_likes_select" ON "public"."board_post_likes" FOR SELECT USING (true);


--
-- Name: board_post_likes board_post_likes_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_post_likes_select_own" ON "public"."board_post_likes" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: board_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."board_posts" ENABLE ROW LEVEL SECURITY;

--
-- Name: board_posts board_posts_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_posts_admin_delete" ON "public"."board_posts" FOR DELETE USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: board_posts board_posts_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_posts_admin_select" ON "public"."board_posts" FOR SELECT USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: board_posts board_posts_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_posts_admin_update" ON "public"."board_posts" FOR UPDATE USING ("public"."is_admin_for_plaza"("plaza_id")) WITH CHECK ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: board_posts board_posts_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_posts_delete" ON "public"."board_posts" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: board_posts board_posts_delete_owner_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_posts_delete_owner_or_admin" ON "public"."board_posts" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'superadmin'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."plaza_admins"
  WHERE (("plaza_admins"."user_id" = "auth"."uid"()) AND ("plaza_admins"."plaza_id" = "board_posts"."plaza_id"))))));


--
-- Name: board_posts board_posts_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_posts_insert" ON "public"."board_posts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: board_posts board_posts_insert_plaza_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_posts_insert_plaza_scoped" ON "public"."board_posts" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."user_in_plaza"("plaza_id")));


--
-- Name: board_posts board_posts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_posts_select" ON "public"."board_posts" FOR SELECT USING ((("status" <> 'hidden'::"text") OR ("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: board_posts board_posts_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_posts_update" ON "public"."board_posts" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))))) WITH CHECK ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: board_posts board_posts_update_owner_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board_posts_update_owner_or_admin" ON "public"."board_posts" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'superadmin'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."plaza_admins"
  WHERE (("plaza_admins"."user_id" = "auth"."uid"()) AND ("plaza_admins"."plaza_id" = "board_posts"."plaza_id")))))) WITH CHECK ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'superadmin'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."plaza_admins"
  WHERE (("plaza_admins"."user_id" = "auth"."uid"()) AND ("plaza_admins"."plaza_id" = "board_posts"."plaza_id"))))));


--
-- Name: boost_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."boost_orders" ENABLE ROW LEVEL SECURITY;

--
-- Name: boost_orders boost_orders admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "boost_orders admin manage" ON "public"."boost_orders" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: boost_orders boost_orders read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "boost_orders read own" ON "public"."boost_orders" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: boost_orders boost_orders self insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "boost_orders self insert" ON "public"."boost_orders" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: boost_pricing; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."boost_pricing" ENABLE ROW LEVEL SECURITY;

--
-- Name: boost_pricing boost_pricing admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "boost_pricing admin write" ON "public"."boost_pricing" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: boost_pricing boost_pricing read all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "boost_pricing read all" ON "public"."boost_pricing" FOR SELECT USING (true);


--
-- Name: bump_daily; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."bump_daily" ENABLE ROW LEVEL SECURITY;

--
-- Name: bump_daily bump_daily own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bump_daily own" ON "public"."bump_daily" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


--
-- Name: bump_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."bump_history" ENABLE ROW LEVEL SECURITY;

--
-- Name: bump_history bump_history own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bump_history own" ON "public"."bump_history" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


--
-- Name: bump_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."bump_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: bump_settings bump_settings admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bump_settings admin write" ON "public"."bump_settings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: bump_settings bump_settings read all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bump_settings read all" ON "public"."bump_settings" FOR SELECT USING (true);


--
-- Name: bump_ticket_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."bump_ticket_orders" ENABLE ROW LEVEL SECURITY;

--
-- Name: bump_ticket_orders bump_ticket_orders own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bump_ticket_orders own" ON "public"."bump_ticket_orders" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


--
-- Name: bump_ticket_packs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."bump_ticket_packs" ENABLE ROW LEVEL SECURITY;

--
-- Name: bump_ticket_packs bump_ticket_packs admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bump_ticket_packs admin write" ON "public"."bump_ticket_packs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: bump_ticket_packs bump_ticket_packs read all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bump_ticket_packs read all" ON "public"."bump_ticket_packs" FOR SELECT USING (true);


--
-- Name: bump_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."bump_tickets" ENABLE ROW LEVEL SECURITY;

--
-- Name: bump_tickets bump_tickets own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bump_tickets own" ON "public"."bump_tickets" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


--
-- Name: business_declarations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."business_declarations" ENABLE ROW LEVEL SECURITY;

--
-- Name: business_declarations business_declarations admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "business_declarations admin manage" ON "public"."business_declarations" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: business_declarations business_declarations read verified or own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "business_declarations read verified or own" ON "public"."business_declarations" FOR SELECT USING ((("status" = 'verified'::"text") OR ("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: business_declarations business_declarations self update pending; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "business_declarations self update pending" ON "public"."business_declarations" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND ("status" = 'pending'::"text"))) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("status" = 'pending'::"text")));


--
-- Name: business_declarations business_declarations self upsert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "business_declarations self upsert" ON "public"."business_declarations" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;

--
-- Name: categories categories_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "categories_admin_write" ON "public"."categories" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: categories categories_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "categories_read" ON "public"."categories" FOR SELECT USING (true);


--
-- Name: categories categories_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "categories_select_all" ON "public"."categories" FOR SELECT USING (true);


--
-- Name: categories categories_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "categories_write" ON "public"."categories" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: chat_room_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."chat_room_participants" ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_rooms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."chat_rooms" ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_rooms chat_rooms_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "chat_rooms_insert" ON "public"."chat_rooms" FOR INSERT WITH CHECK (("auth"."uid"() = "buyer_id"));


--
-- Name: chat_rooms chat_rooms_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "chat_rooms_select_own" ON "public"."chat_rooms" FOR SELECT USING ((("auth"."uid"() = "buyer_id") OR ("auth"."uid"() = "seller_id")));


--
-- Name: chat_rooms chat_rooms_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "chat_rooms_select_policy" ON "public"."chat_rooms" FOR SELECT USING ((("buyer_id" = "auth"."uid"()) OR ("seller_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."expert_invitations"
  WHERE (("expert_invitations"."chat_room_id" = "chat_rooms"."id") AND ("expert_invitations"."expert_id" = "auth"."uid"()) AND ("expert_invitations"."status" = 'accepted'::"text"))))));


--
-- Name: chat_rooms chat_rooms_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "chat_rooms_update_own" ON "public"."chat_rooms" FOR UPDATE USING ((("auth"."uid"() = "buyer_id") OR ("auth"."uid"() = "seller_id")));


--
-- Name: chuncheon_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."chuncheon_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: cleaning_favorites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."cleaning_favorites" ENABLE ROW LEVEL SECURITY;

--
-- Name: cleaning_favorites cleaning_favorites_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cleaning_favorites_delete_own" ON "public"."cleaning_favorites" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: cleaning_favorites cleaning_favorites_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cleaning_favorites_insert_own" ON "public"."cleaning_favorites" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: cleaning_favorites cleaning_favorites_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cleaning_favorites_select_own" ON "public"."cleaning_favorites" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: cleaning_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."cleaning_posts" ENABLE ROW LEVEL SECURITY;

--
-- Name: cleaning_posts cleaning_posts_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cleaning_posts_admin_delete" ON "public"."cleaning_posts" FOR DELETE USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: cleaning_posts cleaning_posts_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cleaning_posts_admin_select" ON "public"."cleaning_posts" FOR SELECT USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: cleaning_posts cleaning_posts_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cleaning_posts_admin_update" ON "public"."cleaning_posts" FOR UPDATE USING ("public"."is_admin_for_plaza"("plaza_id")) WITH CHECK ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: cleaning_posts cleaning_posts_insert_plaza_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cleaning_posts_insert_plaza_scoped" ON "public"."cleaning_posts" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND (("plaza_id" IS NULL) OR "public"."user_in_plaza"("plaza_id"))));


--
-- Name: club_chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."club_chat_messages" ENABLE ROW LEVEL SECURITY;

--
-- Name: club_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."club_likes" ENABLE ROW LEVEL SECURITY;

--
-- Name: club_likes club_likes_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "club_likes_delete_own" ON "public"."club_likes" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: club_likes club_likes_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "club_likes_insert_own" ON "public"."club_likes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: club_likes club_likes_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "club_likes_select_own" ON "public"."club_likes" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: club_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."club_members" ENABLE ROW LEVEL SECURITY;

--
-- Name: clubs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."clubs" ENABLE ROW LEVEL SECURITY;

--
-- Name: clubs clubs_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "clubs_admin_delete" ON "public"."clubs" FOR DELETE USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: clubs clubs_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "clubs_admin_select" ON "public"."clubs" FOR SELECT USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: clubs clubs_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "clubs_admin_update" ON "public"."clubs" FOR UPDATE USING ("public"."is_admin_for_plaza"("plaza_id")) WITH CHECK ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: clubs clubs_insert_plaza_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "clubs_insert_plaza_scoped" ON "public"."clubs" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND (("plaza_id" IS NULL) OR "public"."user_in_plaza"("plaza_id"))));


--
-- Name: commission_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."commission_rates" ENABLE ROW LEVEL SECURITY;

--
-- Name: commission_rates commission_rates admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "commission_rates admin manage" ON "public"."commission_rates" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: commission_rates commission_rates read all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "commission_rates read all" ON "public"."commission_rates" FOR SELECT TO "authenticated" USING (true);


--
-- Name: commission_rates commission_rates_plaza_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "commission_rates_plaza_read" ON "public"."commission_rates" FOR SELECT TO "authenticated" USING ((("plaza_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."plaza_admins" "pa"
  WHERE (("pa"."user_id" = "auth"."uid"()) AND ("pa"."plaza_id" = "commission_rates"."plaza_id"))))));


--
-- Name: commission_rates commission_rates_super_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "commission_rates_super_all" ON "public"."commission_rates" TO "authenticated" USING ("public"."is_super_plaza_admin"()) WITH CHECK ("public"."is_super_plaza_admin"());


--
-- Name: commission_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."commission_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: commission_settings commission_settings admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "commission_settings admin write" ON "public"."commission_settings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: commission_settings commission_settings read all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "commission_settings read all" ON "public"."commission_settings" FOR SELECT USING (true);


--
-- Name: commission_splits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."commission_splits" ENABLE ROW LEVEL SECURITY;

--
-- Name: commission_splits commission_splits admin only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "commission_splits admin only" ON "public"."commission_splits" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: credit_purchases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."credit_purchases" ENABLE ROW LEVEL SECURITY;

--
-- Name: credit_purchases credit_purchases_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "credit_purchases_select_own" ON "public"."credit_purchases" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: cron_run_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."cron_run_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: cron_run_log cron_run_log_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cron_run_log_select_admin" ON "public"."cron_run_log" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."plaza_admins" "pa"
  WHERE (("pa"."user_id" = "auth"."uid"()) AND ("pa"."role" = 'super'::"text"))))));


--
-- Name: expert_invitations ei_delete_inviter; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ei_delete_inviter" ON "public"."expert_invitations" FOR DELETE USING (("auth"."uid"() = "inviter_id"));


--
-- Name: expert_invitations ei_insert_inviter; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ei_insert_inviter" ON "public"."expert_invitations" FOR INSERT WITH CHECK (("auth"."uid"() = "inviter_id"));


--
-- Name: expert_invitations ei_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ei_select_own" ON "public"."expert_invitations" FOR SELECT USING ((("auth"."uid"() = "inviter_id") OR ("auth"."uid"() = "expert_id")));


--
-- Name: expert_invitations ei_update_parties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ei_update_parties" ON "public"."expert_invitations" FOR UPDATE USING ((("auth"."uid"() = "inviter_id") OR ("auth"."uid"() = "expert_id")));


--
-- Name: expert_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."expert_invitations" ENABLE ROW LEVEL SECURITY;

--
-- Name: faqs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."faqs" ENABLE ROW LEVEL SECURITY;

--
-- Name: faqs faqs_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "faqs_admin_write" ON "public"."faqs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: faqs faqs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "faqs_select" ON "public"."faqs" FOR SELECT USING ((("is_active" = true) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: favorites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."favorites" ENABLE ROW LEVEL SECURITY;

--
-- Name: favorites favorites_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "favorites_delete_own" ON "public"."favorites" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: favorites favorites_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "favorites_insert_own" ON "public"."favorites" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: favorites favorites_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "favorites_select_own" ON "public"."favorites" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: feature_flags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."feature_flags" ENABLE ROW LEVEL SECURITY;

--
-- Name: feature_flags feature_flags admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "feature_flags admin write" ON "public"."feature_flags" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: feature_flags feature_flags read all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "feature_flags read all" ON "public"."feature_flags" FOR SELECT USING (true);


--
-- Name: follows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."follows" ENABLE ROW LEVEL SECURITY;

--
-- Name: follows follows delete own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "follows delete own" ON "public"."follows" FOR DELETE USING (("auth"."uid"() = "follower_id"));


--
-- Name: follows follows insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "follows insert own" ON "public"."follows" FOR INSERT WITH CHECK (("auth"."uid"() = "follower_id"));


--
-- Name: follows follows select all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "follows select all" ON "public"."follows" FOR SELECT USING (true);


--
-- Name: follows follows_delete_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "follows_delete_self" ON "public"."follows" FOR DELETE USING (("auth"."uid"() = "follower_id"));


--
-- Name: follows follows_insert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "follows_insert_self" ON "public"."follows" FOR INSERT WITH CHECK (("auth"."uid"() = "follower_id"));


--
-- Name: follows follows_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "follows_select_all" ON "public"."follows" FOR SELECT USING (true);


--
-- Name: faqs fq_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fq_admin_write" ON "public"."faqs" TO "authenticated" USING ("public"."is_plaza_admin"("auth"."uid"(), "plaza_id")) WITH CHECK ("public"."is_plaza_admin"("auth"."uid"(), "plaza_id"));


--
-- Name: group_buying_orders gb_orders_insert_buyer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "gb_orders_insert_buyer" ON "public"."group_buying_orders" FOR INSERT WITH CHECK (("auth"."uid"() = "buyer_id"));


--
-- Name: group_buying_orders gb_orders_select_party; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "gb_orders_select_party" ON "public"."group_buying_orders" FOR SELECT USING ((("auth"."uid"() = "buyer_id") OR ("auth"."uid"() = "seller_id")));


--
-- Name: group_buying_orders gb_orders_update_party; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "gb_orders_update_party" ON "public"."group_buying_orders" FOR UPDATE USING ((("auth"."uid"() = "buyer_id") OR ("auth"."uid"() = "seller_id")));


--
-- Name: group_buying_chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."group_buying_chat_messages" ENABLE ROW LEVEL SECURITY;

--
-- Name: group_buying_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."group_buying_orders" ENABLE ROW LEVEL SECURITY;

--
-- Name: group_buying_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."group_buying_participants" ENABLE ROW LEVEL SECURITY;

--
-- Name: group_buying_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."group_buying_posts" ENABLE ROW LEVEL SECURITY;

--
-- Name: group_buying_posts group_buying_posts_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "group_buying_posts_admin_delete" ON "public"."group_buying_posts" FOR DELETE USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: group_buying_posts group_buying_posts_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "group_buying_posts_admin_select" ON "public"."group_buying_posts" FOR SELECT USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: group_buying_posts group_buying_posts_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "group_buying_posts_admin_update" ON "public"."group_buying_posts" FOR UPDATE USING ("public"."is_admin_for_plaza"("plaza_id")) WITH CHECK ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: group_buying_posts group_buying_posts_insert_plaza_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "group_buying_posts_insert_plaza_scoped" ON "public"."group_buying_posts" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND (("plaza_id" IS NULL) OR "public"."user_in_plaza"("plaza_id"))));


--
-- Name: group_buying_wishlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."group_buying_wishlist" ENABLE ROW LEVEL SECURITY;

--
-- Name: group_buying_wishlist group_buying_wishlist_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "group_buying_wishlist_select_own" ON "public"."group_buying_wishlist" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: hero_banners hb_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hb_admin_write" ON "public"."hero_banners" TO "authenticated" USING ("public"."is_plaza_admin"("auth"."uid"(), "plaza_id")) WITH CHECK ("public"."is_plaza_admin"("auth"."uid"(), "plaza_id"));


--
-- Name: hero_banners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."hero_banners" ENABLE ROW LEVEL SECURITY;

--
-- Name: hero_banners hero_banners_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hero_banners_admin_write" ON "public"."hero_banners" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: hero_banners hero_banners_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hero_banners_select_all" ON "public"."hero_banners" FOR SELECT USING (true);


--
-- Name: profile_highlights highlights manage own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "highlights manage own" ON "public"."profile_highlights" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: profile_highlights highlights select all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "highlights select all" ON "public"."profile_highlights" FOR SELECT USING (true);


--
-- Name: homepage_menu hm_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hm_admin_write" ON "public"."homepage_menu" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: homepage_menu hm_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hm_select" ON "public"."homepage_menu" FOR SELECT USING (true);


--
-- Name: homepage_menu; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."homepage_menu" ENABLE ROW LEVEL SECURITY;

--
-- Name: homepage_slider; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."homepage_slider" ENABLE ROW LEVEL SECURITY;

--
-- Name: homepage_slider hs_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hs_admin_write" ON "public"."homepage_slider" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: homepage_slider hs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hs_select" ON "public"."homepage_slider" FOR SELECT USING (true);


--
-- Name: interior_favorites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."interior_favorites" ENABLE ROW LEVEL SECURITY;

--
-- Name: interior_favorites interior_favorites_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "interior_favorites_delete_own" ON "public"."interior_favorites" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: interior_favorites interior_favorites_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "interior_favorites_insert_own" ON "public"."interior_favorites" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: interior_favorites interior_favorites_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "interior_favorites_select_own" ON "public"."interior_favorites" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: interior_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."interior_posts" ENABLE ROW LEVEL SECURITY;

--
-- Name: interior_posts interior_posts_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "interior_posts_admin_delete" ON "public"."interior_posts" FOR DELETE USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: interior_posts interior_posts_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "interior_posts_admin_select" ON "public"."interior_posts" FOR SELECT USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: interior_posts interior_posts_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "interior_posts_admin_update" ON "public"."interior_posts" FOR UPDATE USING ("public"."is_admin_for_plaza"("plaza_id")) WITH CHECK ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: interior_posts interior_posts_insert_plaza_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "interior_posts_insert_plaza_scoped" ON "public"."interior_posts" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND (("plaza_id" IS NULL) OR "public"."user_in_plaza"("plaza_id"))));


--
-- Name: jobs_posts jobs_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "jobs_delete_own" ON "public"."jobs_posts" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: jobs_posts jobs_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "jobs_insert_own" ON "public"."jobs_posts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: jobs_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."jobs_likes" ENABLE ROW LEVEL SECURITY;

--
-- Name: jobs_likes jobs_likes_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "jobs_likes_delete_own" ON "public"."jobs_likes" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: jobs_likes jobs_likes_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "jobs_likes_insert_own" ON "public"."jobs_likes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: jobs_likes jobs_likes_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "jobs_likes_select_own" ON "public"."jobs_likes" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: jobs_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."jobs_posts" ENABLE ROW LEVEL SECURITY;

--
-- Name: jobs_posts jobs_posts_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "jobs_posts_admin_delete" ON "public"."jobs_posts" FOR DELETE USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: jobs_posts jobs_posts_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "jobs_posts_admin_select" ON "public"."jobs_posts" FOR SELECT USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: jobs_posts jobs_posts_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "jobs_posts_admin_update" ON "public"."jobs_posts" FOR UPDATE USING ("public"."is_admin_for_plaza"("plaza_id")) WITH CHECK ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: jobs_posts jobs_posts_insert_plaza_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "jobs_posts_insert_plaza_scoped" ON "public"."jobs_posts" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND (("plaza_id" IS NULL) OR "public"."user_in_plaza"("plaza_id"))));


--
-- Name: jobs_posts jobs_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "jobs_select_all" ON "public"."jobs_posts" FOR SELECT USING ((("status" <> 'hidden'::"text") OR ("auth"."uid"() = "user_id")));


--
-- Name: jobs_posts jobs_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "jobs_update_own" ON "public"."jobs_posts" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: local_food; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."local_food" ENABLE ROW LEVEL SECURITY;

--
-- Name: local_food local_food_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "local_food_admin_delete" ON "public"."local_food" FOR DELETE USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: local_food local_food_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "local_food_admin_select" ON "public"."local_food" FOR SELECT USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: local_food local_food_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "local_food_admin_update" ON "public"."local_food" FOR UPDATE USING ("public"."is_admin_for_plaza"("plaza_id")) WITH CHECK ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: local_food local_food_insert_plaza_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "local_food_insert_plaza_scoped" ON "public"."local_food" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND (("plaza_id" IS NULL) OR "public"."user_in_plaza"("plaza_id"))));


--
-- Name: local_food_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."local_food_likes" ENABLE ROW LEVEL SECURITY;

--
-- Name: local_food_likes local_food_likes_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "local_food_likes_select_own" ON "public"."local_food_likes" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: local_food_order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."local_food_order_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: local_food_order_items local_food_order_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "local_food_order_items_insert" ON "public"."local_food_order_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."local_food_orders" "o"
  WHERE (("o"."id" = "local_food_order_items"."order_id") AND ("auth"."uid"() = "o"."buyer_id")))));


--
-- Name: local_food_order_items local_food_order_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "local_food_order_items_select" ON "public"."local_food_order_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."local_food_orders" "o"
  WHERE (("o"."id" = "local_food_order_items"."order_id") AND (("auth"."uid"() = "o"."buyer_id") OR ("auth"."uid"() = "o"."seller_id"))))));


--
-- Name: local_food_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."local_food_orders" ENABLE ROW LEVEL SECURITY;

--
-- Name: local_food_orders local_food_orders_insert_buyer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "local_food_orders_insert_buyer" ON "public"."local_food_orders" FOR INSERT WITH CHECK (("auth"."uid"() = "buyer_id"));


--
-- Name: local_food_orders local_food_orders_select_party; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "local_food_orders_select_party" ON "public"."local_food_orders" FOR SELECT USING ((("auth"."uid"() = "buyer_id") OR ("auth"."uid"() = "seller_id")));


--
-- Name: local_food_orders local_food_orders_update_party; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "local_food_orders_update_party" ON "public"."local_food_orders" FOR UPDATE USING ((("auth"."uid"() = "buyer_id") OR ("auth"."uid"() = "seller_id")));


--
-- Name: maintenance_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."maintenance_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: maintenance_settings maintenance_settings_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "maintenance_settings_all" ON "public"."maintenance_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;

--
-- Name: messages messages_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "messages_insert_own" ON "public"."messages" FOR INSERT WITH CHECK (("auth"."uid"() = "sender_id"));


--
-- Name: messages messages_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "messages_select_own" ON "public"."messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."chat_rooms"
  WHERE (("chat_rooms"."id" = "messages"."chat_room_id") AND (("chat_rooms"."buyer_id" = "auth"."uid"()) OR ("chat_rooms"."seller_id" = "auth"."uid"()))))));


--
-- Name: messages messages_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "messages_update_own" ON "public"."messages" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."chat_rooms"
  WHERE (("chat_rooms"."id" = "messages"."chat_room_id") AND (("chat_rooms"."buyer_id" = "auth"."uid"()) OR ("chat_rooms"."seller_id" = "auth"."uid"()))))));


--
-- Name: moderation_keywords mk_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mk_admin_write" ON "public"."moderation_keywords" TO "authenticated" USING ("public"."is_plaza_admin"("auth"."uid"(), "plaza_id")) WITH CHECK ("public"."is_plaza_admin"("auth"."uid"(), "plaza_id"));


--
-- Name: moderation_keywords; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."moderation_keywords" ENABLE ROW LEVEL SECURITY;

--
-- Name: moderation_keywords moderation_keywords_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "moderation_keywords_delete_admin" ON "public"."moderation_keywords" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."plaza_admins"
  WHERE (("plaza_admins"."user_id" = "auth"."uid"()) AND ("plaza_admins"."role" = ANY (ARRAY['admin'::"text", 'super'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: moderation_keywords moderation_keywords_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "moderation_keywords_insert_admin" ON "public"."moderation_keywords" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."plaza_admins"
  WHERE (("plaza_admins"."user_id" = "auth"."uid"()) AND ("plaza_admins"."role" = ANY (ARRAY['admin'::"text", 'super'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: moderation_keywords moderation_keywords_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "moderation_keywords_select_admin" ON "public"."moderation_keywords" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: moderation_keywords moderation_keywords_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "moderation_keywords_update_admin" ON "public"."moderation_keywords" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."plaza_admins"
  WHERE (("plaza_admins"."user_id" = "auth"."uid"()) AND ("plaza_admins"."role" = ANY (ARRAY['admin'::"text", 'super'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: moving_favorites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."moving_favorites" ENABLE ROW LEVEL SECURITY;

--
-- Name: moving_favorites moving_favorites_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "moving_favorites_delete_own" ON "public"."moving_favorites" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: moving_favorites moving_favorites_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "moving_favorites_insert_own" ON "public"."moving_favorites" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: moving_favorites moving_favorites_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "moving_favorites_select_own" ON "public"."moving_favorites" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: moving_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."moving_posts" ENABLE ROW LEVEL SECURITY;

--
-- Name: moving_posts moving_posts_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "moving_posts_admin_delete" ON "public"."moving_posts" FOR DELETE USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: moving_posts moving_posts_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "moving_posts_admin_select" ON "public"."moving_posts" FOR SELECT USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: moving_posts moving_posts_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "moving_posts_admin_update" ON "public"."moving_posts" FOR UPDATE USING ("public"."is_admin_for_plaza"("plaza_id")) WITH CHECK ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: moving_posts moving_posts_insert_plaza_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "moving_posts_insert_plaza_scoped" ON "public"."moving_posts" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND (("plaza_id" IS NULL) OR "public"."user_in_plaza"("plaza_id"))));


--
-- Name: new_store_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."new_store_likes" ENABLE ROW LEVEL SECURITY;

--
-- Name: new_store_likes new_store_likes_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "new_store_likes_delete_own" ON "public"."new_store_likes" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: new_store_likes new_store_likes_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "new_store_likes_insert_own" ON "public"."new_store_likes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: new_store_likes new_store_likes_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "new_store_likes_select_own" ON "public"."new_store_likes" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: new_store_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."new_store_posts" ENABLE ROW LEVEL SECURITY;

--
-- Name: new_store_posts new_store_posts_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "new_store_posts_admin_delete" ON "public"."new_store_posts" FOR DELETE USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: new_store_posts new_store_posts_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "new_store_posts_admin_select" ON "public"."new_store_posts" FOR SELECT USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: new_store_posts new_store_posts_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "new_store_posts_admin_update" ON "public"."new_store_posts" FOR UPDATE USING ("public"."is_admin_for_plaza"("plaza_id")) WITH CHECK ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: new_store_posts new_store_posts_insert_plaza_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "new_store_posts_insert_plaza_scoped" ON "public"."new_store_posts" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND (("plaza_id" IS NULL) OR "public"."user_in_plaza"("plaza_id"))));


--
-- Name: notices no_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "no_admin_write" ON "public"."notices" TO "authenticated" USING ("public"."is_plaza_admin"("auth"."uid"(), "plaza_id")) WITH CHECK ("public"."is_plaza_admin"("auth"."uid"(), "plaza_id"));


--
-- Name: notices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."notices" ENABLE ROW LEVEL SECURITY;

--
-- Name: notices notices_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notices_admin_write" ON "public"."notices" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: notices notices_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notices_select" ON "public"."notices" FOR SELECT USING ((("is_published" = true) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications_delete_own" ON "public"."notifications" FOR DELETE USING ((("auth"."uid"() IS NOT NULL) AND ("user_id" = "auth"."uid"())));


--
-- Name: notifications notifications_insert_as_actor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications_insert_as_actor" ON "public"."notifications" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("actor_id" = "auth"."uid"())));


--
-- Name: notifications notifications_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications_insert_own" ON "public"."notifications" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("user_id" = "auth"."uid"())));


--
-- Name: notifications notifications_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND ("user_id" = "auth"."uid"())));


--
-- Name: notifications notifications_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications_update_own" ON "public"."notifications" FOR UPDATE USING ((("auth"."uid"() IS NOT NULL) AND ("user_id" = "auth"."uid"()))) WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("user_id" = "auth"."uid"())));


--
-- Name: plaza_associations pa_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pa_admin_write" ON "public"."plaza_associations" TO "authenticated" USING ("public"."is_app_admin"("auth"."uid"())) WITH CHECK ("public"."is_app_admin"("auth"."uid"()));


--
-- Name: plaza_associations pa_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pa_select_admin" ON "public"."plaza_associations" FOR SELECT TO "authenticated" USING ("public"."is_app_admin"("auth"."uid"()));


--
-- Name: page_heroes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."page_heroes" ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_webhooks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."payment_webhooks" ENABLE ROW LEVEL SECURITY;

--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;

--
-- Name: payments payments admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "payments admin manage" ON "public"."payments" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: payments payments read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "payments read own" ON "public"."payments" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: payout_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."payout_batches" ENABLE ROW LEVEL SECURITY;

--
-- Name: payout_batches payout_batches admin only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "payout_batches admin only" ON "public"."payout_batches" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: payouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."payouts" ENABLE ROW LEVEL SECURITY;

--
-- Name: payouts payouts admin only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "payouts admin only" ON "public"."payouts" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: property_highlights ph_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ph_admin_write" ON "public"."property_highlights" TO "authenticated" USING ("public"."is_plaza_admin"("auth"."uid"(), "plaza_id")) WITH CHECK ("public"."is_plaza_admin"("auth"."uid"(), "plaza_id"));


--
-- Name: property_highlights ph_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ph_select" ON "public"."property_highlights" FOR SELECT USING (true);


--
-- Name: plaza_admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."plaza_admins" ENABLE ROW LEVEL SECURITY;

--
-- Name: plaza_admins plaza_admins_select_v2; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plaza_admins_select_v2" ON "public"."plaza_admins" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_super_plaza_admin"()));


--
-- Name: plaza_admins plaza_admins_super_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plaza_admins_super_write" ON "public"."plaza_admins" TO "authenticated" USING ("public"."is_super_plaza_admin"()) WITH CHECK ("public"."is_super_plaza_admin"());


--
-- Name: plaza_associations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."plaza_associations" ENABLE ROW LEVEL SECURITY;

--
-- Name: plaza_associations plaza_associations admin only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plaza_associations admin only" ON "public"."plaza_associations" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: properties plaza_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plaza_isolation" ON "public"."properties" FOR SELECT USING ((("plaza_id" = "current_setting"('app.current_plaza'::"text", true)) OR "public"."is_super_admin"()));


--
-- Name: plaza_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."plaza_profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: plaza_profiles plaza_profiles_select_v2; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plaza_profiles_select_v2" ON "public"."plaza_profiles" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."user_in_plaza"("plaza_id") OR (EXISTS ( SELECT 1
   FROM "public"."chat_rooms" "cr"
  WHERE (("cr"."post_type" = ANY (ARRAY['group_buying'::"text", 'local_food'::"text"])) AND ("cr"."plaza_id" = "plaza_profiles"."plaza_id") AND ((("cr"."buyer_id" = "auth"."uid"()) AND ("cr"."seller_id" = "plaza_profiles"."user_id")) OR (("cr"."seller_id" = "auth"."uid"()) AND ("cr"."buyer_id" = "plaza_profiles"."user_id"))))))));


--
-- Name: plaza_profiles plaza_profiles_self_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plaza_profiles_self_write" ON "public"."plaza_profiles" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: plaza_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."plaza_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: plaza_settings plaza_settings admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plaza_settings admin manage" ON "public"."plaza_settings" TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."plaza_admins" "pa"
  WHERE (("pa"."user_id" = "auth"."uid"()) AND ("pa"."plaza_id" = "plaza_settings"."plaza_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."plaza_admins" "pa"
  WHERE (("pa"."user_id" = "auth"."uid"()) AND ("pa"."plaza_id" = "plaza_settings"."plaza_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: plaza_settings plaza_settings read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plaza_settings read" ON "public"."plaza_settings" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."plaza_admins" "pa"
  WHERE (("pa"."user_id" = "auth"."uid"()) AND ("pa"."plaza_id" = "plaza_settings"."plaza_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: plaza_settlements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."plaza_settlements" ENABLE ROW LEVEL SECURITY;

--
-- Name: plaza_settlements plaza_settlements admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plaza_settlements admin manage" ON "public"."plaza_settlements" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: plaza_settlements plaza_settlements read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plaza_settlements read" ON "public"."plaza_settlements" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."plaza_admins" "pa"
  WHERE (("pa"."user_id" = "auth"."uid"()) AND ("pa"."plaza_id" = "plaza_settlements"."plaza_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: plaza_settlements plaza_settlements_plaza_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plaza_settlements_plaza_admin_read" ON "public"."plaza_settlements" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."plaza_admins" "pa"
  WHERE (("pa"."user_id" = "auth"."uid"()) AND ("pa"."plaza_id" = "plaza_settlements"."plaza_id") AND ("pa"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'finance'::"text"]))))));


--
-- Name: plaza_settlements plaza_settlements_super_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plaza_settlements_super_read" ON "public"."plaza_settlements" FOR SELECT TO "authenticated" USING ("public"."is_super_plaza_admin"());


--
-- Name: plaza_settlements plaza_settlements_super_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plaza_settlements_super_write" ON "public"."plaza_settlements" TO "authenticated" USING ("public"."is_super_plaza_admin"()) WITH CHECK ("public"."is_super_plaza_admin"());


--
-- Name: plazas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."plazas" ENABLE ROW LEVEL SECURITY;

--
-- Name: plazas plazas_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plazas_admin_delete" ON "public"."plazas" FOR DELETE TO "authenticated" USING ("public"."is_plaza_admin_for"("id"));


--
-- Name: plazas plazas_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plazas_admin_insert" ON "public"."plazas" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_plaza_admin_for"("id"));


--
-- Name: plazas plazas_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plazas_admin_update" ON "public"."plazas" FOR UPDATE TO "authenticated" USING ("public"."is_plaza_admin_for"("id")) WITH CHECK ("public"."is_plaza_admin_for"("id"));


--
-- Name: plazas plazas_plaza_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plazas_plaza_admin_update" ON "public"."plazas" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."plaza_admins"
  WHERE (("plaza_admins"."plaza_id" = "plazas"."id") AND ("plaza_admins"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."plaza_admins"
  WHERE (("plaza_admins"."plaza_id" = "plazas"."id") AND ("plaza_admins"."user_id" = "auth"."uid"())))));


--
-- Name: plazas plazas_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plazas_select_all" ON "public"."plazas" FOR SELECT USING (true);


--
-- Name: point_daily_counters point_counters admin only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "point_counters admin only" ON "public"."point_daily_counters" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: point_daily_counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."point_daily_counters" ENABLE ROW LEVEL SECURITY;

--
-- Name: point_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."point_history" ENABLE ROW LEVEL SECURITY;

--
-- Name: point_history point_history_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "point_history_admin_write" ON "public"."point_history" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: point_history point_history_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "point_history_read" ON "public"."point_history" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: point_history point_history_select_own_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "point_history_select_own_or_admin" ON "public"."point_history" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: point_history point_history_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "point_history_write" ON "public"."point_history" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: point_redemption_settings point_redemption admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "point_redemption admin write" ON "public"."point_redemption_settings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: point_redemption_settings point_redemption read all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "point_redemption read all" ON "public"."point_redemption_settings" FOR SELECT USING (true);


--
-- Name: point_redemption_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."point_redemption_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: point_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."point_rules" ENABLE ROW LEVEL SECURITY;

--
-- Name: point_rules point_rules admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "point_rules admin write" ON "public"."point_rules" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: point_rules point_rules read all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "point_rules read all" ON "public"."point_rules" FOR SELECT USING (true);


--
-- Name: point_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."point_transactions" ENABLE ROW LEVEL SECURITY;

--
-- Name: point_transactions point_tx admin only write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "point_tx admin only write" ON "public"."point_transactions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: point_transactions point_tx read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "point_tx read own" ON "public"."point_transactions" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: popups pop_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pop_admin_write" ON "public"."popups" TO "authenticated" USING ("public"."is_plaza_admin"("auth"."uid"(), "plaza_id")) WITH CHECK ("public"."is_plaza_admin"("auth"."uid"(), "plaza_id"));


--
-- Name: popular_searches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."popular_searches" ENABLE ROW LEVEL SECURITY;

--
-- Name: popups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."popups" ENABLE ROW LEVEL SECURITY;

--
-- Name: popups popups_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "popups_admin_write" ON "public"."popups" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: popups popups_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "popups_read" ON "public"."popups" FOR SELECT USING (true);


--
-- Name: popups popups_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "popups_select_all" ON "public"."popups" FOR SELECT USING (true);


--
-- Name: popups popups_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "popups_write" ON "public"."popups" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: post_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."post_reports" ENABLE ROW LEVEL SECURITY;

--
-- Name: post_reports pr_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pr_admin_read" ON "public"."post_reports" FOR SELECT TO "authenticated" USING ("public"."is_plaza_admin"("auth"."uid"(), "plaza_id"));


--
-- Name: property_reports pr_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pr_admin_update" ON "public"."property_reports" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: post_reports pr_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pr_admin_write" ON "public"."post_reports" FOR UPDATE TO "authenticated" USING ("public"."is_plaza_admin"("auth"."uid"(), "plaza_id")) WITH CHECK ("public"."is_plaza_admin"("auth"."uid"(), "plaza_id"));


--
-- Name: property_requests pr_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pr_delete_own" ON "public"."property_requests" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: property_reports pr_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pr_insert" ON "public"."property_reports" FOR INSERT TO "authenticated" WITH CHECK ((("reporter_id" = "auth"."uid"()) OR ("reporter_id" IS NULL)));


--
-- Name: property_requests pr_insert_non_agent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pr_insert_non_agent" ON "public"."property_requests" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (NOT (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."account_type" = 'agent'::"text")))))));


--
-- Name: property_reports pr_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pr_select" ON "public"."property_reports" FOR SELECT TO "authenticated" USING ((("reporter_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: property_requests pr_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pr_select_authenticated" ON "public"."property_requests" FOR SELECT USING (("auth"."uid"() IS NOT NULL));


--
-- Name: property_requests pr_select_owner_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pr_select_owner_admin" ON "public"."property_requests" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: property_requests pr_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pr_update_own" ON "public"."property_requests" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: producer_settlements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."producer_settlements" ENABLE ROW LEVEL SECURITY;

--
-- Name: producer_settlements producer_settlements_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "producer_settlements_self" ON "public"."producer_settlements" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: profile_highlights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."profile_highlights" ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles_delete_own" ON "public"."profiles" FOR DELETE USING (("auth"."uid"() = "id"));


--
-- Name: profiles profiles_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));


--
-- Name: profiles profiles_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles_select_all" ON "public"."profiles" FOR SELECT USING (true);


--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));


--
-- Name: properties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."properties" ENABLE ROW LEVEL SECURITY;

--
-- Name: properties properties_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "properties_admin_delete" ON "public"."properties" FOR DELETE USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: properties properties_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "properties_admin_select" ON "public"."properties" FOR SELECT USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: properties properties_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "properties_admin_update" ON "public"."properties" FOR UPDATE USING ("public"."is_admin_for_plaza"("plaza_id")) WITH CHECK ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: properties properties_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "properties_delete_own" ON "public"."properties" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: properties properties_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "properties_insert_own" ON "public"."properties" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: properties properties_insert_plaza_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "properties_insert_plaza_scoped" ON "public"."properties" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND (("plaza_id" IS NULL) OR "public"."user_in_plaza"("plaza_id"))));


--
-- Name: properties properties_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "properties_select_all" ON "public"."properties" FOR SELECT USING (true);


--
-- Name: properties properties_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "properties_update_own" ON "public"."properties" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: property_highlights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."property_highlights" ENABLE ROW LEVEL SECURITY;

--
-- Name: property_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."property_reports" ENABLE ROW LEVEL SECURITY;

--
-- Name: property_request_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."property_request_responses" ENABLE ROW LEVEL SECURITY;

--
-- Name: property_request_responses property_request_responses_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "property_request_responses_admin_delete" ON "public"."property_request_responses" FOR DELETE USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: property_request_responses property_request_responses_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "property_request_responses_admin_select" ON "public"."property_request_responses" FOR SELECT USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: property_request_responses property_request_responses_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "property_request_responses_admin_update" ON "public"."property_request_responses" FOR UPDATE USING ("public"."is_admin_for_plaza"("plaza_id")) WITH CHECK ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: property_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."property_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: property_requests property_requests_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "property_requests_admin_delete" ON "public"."property_requests" FOR DELETE USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: property_requests property_requests_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "property_requests_admin_select" ON "public"."property_requests" FOR SELECT USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: property_requests property_requests_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "property_requests_admin_update" ON "public"."property_requests" FOR UPDATE USING ("public"."is_admin_for_plaza"("plaza_id")) WITH CHECK ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: property_requests property_requests_insert_plaza_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "property_requests_insert_plaza_scoped" ON "public"."property_requests" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND (("plaza_id" IS NULL) OR "public"."user_in_plaza"("plaza_id"))));


--
-- Name: property_request_responses prr_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "prr_delete_own" ON "public"."property_request_responses" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: property_request_responses prr_insert_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "prr_insert_auth" ON "public"."property_request_responses" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: property_request_responses prr_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "prr_select_authenticated" ON "public"."property_request_responses" FOR SELECT USING (("auth"."uid"() IS NOT NULL));


--
-- Name: property_request_responses prr_select_owner_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "prr_select_owner_admin" ON "public"."property_request_responses" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: property_request_responses prr_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "prr_update_own" ON "public"."property_request_responses" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: popular_searches ps_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ps_admin_select" ON "public"."popular_searches" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: popular_searches ps_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ps_insert" ON "public"."popular_searches" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));


--
-- Name: user_push_tokens push_tokens_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "push_tokens_delete_own" ON "public"."user_push_tokens" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: user_push_tokens push_tokens_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "push_tokens_insert_own" ON "public"."user_push_tokens" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: user_push_tokens push_tokens_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "push_tokens_select_own" ON "public"."user_push_tokens" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: user_push_tokens push_tokens_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "push_tokens_update_own" ON "public"."user_push_tokens" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: refund_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."refund_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: refund_requests refund_requests admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "refund_requests admin manage" ON "public"."refund_requests" TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."plaza_admins" "pa"
  WHERE (("pa"."user_id" = "auth"."uid"()) AND ("pa"."plaza_id" = "refund_requests"."plaza_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."plaza_admins" "pa"
  WHERE (("pa"."user_id" = "auth"."uid"()) AND ("pa"."plaza_id" = "refund_requests"."plaza_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: refund_requests refund_requests read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "refund_requests read" ON "public"."refund_requests" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."plaza_admins" "pa"
  WHERE (("pa"."user_id" = "auth"."uid"()) AND ("pa"."plaza_id" = "refund_requests"."plaza_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: refund_requests refund_requests user insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "refund_requests user insert" ON "public"."refund_requests" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: regions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."regions" ENABLE ROW LEVEL SECURITY;

--
-- Name: regions regions_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "regions_admin_write" ON "public"."regions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: regions regions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "regions_read" ON "public"."regions" FOR SELECT USING (true);


--
-- Name: regions regions_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "regions_select_all" ON "public"."regions" FOR SELECT USING (true);


--
-- Name: regions regions_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "regions_write" ON "public"."regions" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: repair_favorites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."repair_favorites" ENABLE ROW LEVEL SECURITY;

--
-- Name: repair_favorites repair_favorites_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "repair_favorites_delete_own" ON "public"."repair_favorites" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: repair_favorites repair_favorites_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "repair_favorites_insert_own" ON "public"."repair_favorites" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: repair_favorites repair_favorites_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "repair_favorites_select_own" ON "public"."repair_favorites" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: repair_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."repair_posts" ENABLE ROW LEVEL SECURITY;

--
-- Name: repair_posts repair_posts_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "repair_posts_admin_delete" ON "public"."repair_posts" FOR DELETE USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: repair_posts repair_posts_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "repair_posts_admin_select" ON "public"."repair_posts" FOR SELECT USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: repair_posts repair_posts_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "repair_posts_admin_update" ON "public"."repair_posts" FOR UPDATE USING ("public"."is_admin_for_plaza"("plaza_id")) WITH CHECK ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: repair_posts repair_posts_insert_plaza_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "repair_posts_insert_plaza_scoped" ON "public"."repair_posts" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND (("plaza_id" IS NULL) OR "public"."user_in_plaza"("plaza_id"))));


--
-- Name: post_reports reports_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "reports_insert_own" ON "public"."post_reports" FOR INSERT WITH CHECK (("auth"."uid"() = "reporter_id"));


--
-- Name: post_reports reports_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "reports_select_own" ON "public"."post_reports" FOR SELECT USING (("auth"."uid"() = "reporter_id"));


--
-- Name: reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;

--
-- Name: reviews reviews_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "reviews_delete_own" ON "public"."reviews" FOR DELETE USING (("auth"."uid"() = "reviewer_id"));


--
-- Name: reviews reviews_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "reviews_insert_own" ON "public"."reviews" FOR INSERT WITH CHECK ((("auth"."uid"() = "reviewer_id") AND ("reviewer_id" <> "reviewed_user_id")));


--
-- Name: reviews reviews_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "reviews_select_all" ON "public"."reviews" FOR SELECT USING (true);


--
-- Name: reviews reviews_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "reviews_update_own" ON "public"."reviews" FOR UPDATE USING ((("auth"."uid"() = "reviewer_id") AND ("created_at" > ("now"() - '7 days'::interval)))) WITH CHECK ((("auth"."uid"() = "reviewer_id") AND ("reviewer_id" <> "reviewed_user_id")));


--
-- Name: search_queries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."search_queries" ENABLE ROW LEVEL SECURITY;

--
-- Name: search_queries search_queries_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "search_queries_admin_delete" ON "public"."search_queries" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: search_queries search_queries_no_direct_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "search_queries_no_direct_write" ON "public"."search_queries" FOR INSERT WITH CHECK (false);


--
-- Name: search_queries search_queries_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "search_queries_select_all" ON "public"."search_queries" FOR SELECT USING (true);


--
-- Name: search_term_blacklist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."search_term_blacklist" ENABLE ROW LEVEL SECURITY;

--
-- Name: search_term_blacklist search_term_blacklist_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "search_term_blacklist_admin_write" ON "public"."search_term_blacklist" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: search_term_blacklist search_term_blacklist_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "search_term_blacklist_select_all" ON "public"."search_term_blacklist" FOR SELECT USING (true);


--
-- Name: secondhand_posts secondhand_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "secondhand_delete_own" ON "public"."secondhand_posts" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: secondhand_posts secondhand_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "secondhand_insert_own" ON "public"."secondhand_posts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: secondhand_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."secondhand_likes" ENABLE ROW LEVEL SECURITY;

--
-- Name: secondhand_likes secondhand_likes_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "secondhand_likes_delete_own" ON "public"."secondhand_likes" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: secondhand_likes secondhand_likes_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "secondhand_likes_insert_own" ON "public"."secondhand_likes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: secondhand_likes secondhand_likes_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "secondhand_likes_select_own" ON "public"."secondhand_likes" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: secondhand_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."secondhand_posts" ENABLE ROW LEVEL SECURITY;

--
-- Name: secondhand_posts secondhand_posts_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "secondhand_posts_admin_delete" ON "public"."secondhand_posts" FOR DELETE USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: secondhand_posts secondhand_posts_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "secondhand_posts_admin_select" ON "public"."secondhand_posts" FOR SELECT USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: secondhand_posts secondhand_posts_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "secondhand_posts_admin_update" ON "public"."secondhand_posts" FOR UPDATE USING ("public"."is_admin_for_plaza"("plaza_id")) WITH CHECK ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: secondhand_posts secondhand_posts_insert_plaza_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "secondhand_posts_insert_plaza_scoped" ON "public"."secondhand_posts" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND (("plaza_id" IS NULL) OR "public"."user_in_plaza"("plaza_id"))));


--
-- Name: secondhand_posts secondhand_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "secondhand_select_all" ON "public"."secondhand_posts" FOR SELECT USING ((("status" <> 'hidden'::"text") OR ("auth"."uid"() = "user_id")));


--
-- Name: secondhand_posts secondhand_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "secondhand_update_own" ON "public"."secondhand_posts" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: service_request_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."service_request_responses" ENABLE ROW LEVEL SECURITY;

--
-- Name: service_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."service_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: sharing_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."sharing_likes" ENABLE ROW LEVEL SECURITY;

--
-- Name: sharing_likes sharing_likes_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sharing_likes_delete_own" ON "public"."sharing_likes" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: sharing_likes sharing_likes_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sharing_likes_insert_own" ON "public"."sharing_likes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: sharing_likes sharing_likes_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sharing_likes_select_own" ON "public"."sharing_likes" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: sharing_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."sharing_posts" ENABLE ROW LEVEL SECURITY;

--
-- Name: sharing_posts sharing_posts_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sharing_posts_admin_delete" ON "public"."sharing_posts" FOR DELETE USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: sharing_posts sharing_posts_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sharing_posts_admin_select" ON "public"."sharing_posts" FOR SELECT USING ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: sharing_posts sharing_posts_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sharing_posts_admin_update" ON "public"."sharing_posts" FOR UPDATE USING ("public"."is_admin_for_plaza"("plaza_id")) WITH CHECK ("public"."is_admin_for_plaza"("plaza_id"));


--
-- Name: sharing_posts sharing_posts_insert_plaza_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sharing_posts_insert_plaza_scoped" ON "public"."sharing_posts" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND (("plaza_id" IS NULL) OR "public"."user_in_plaza"("plaza_id"))));


--
-- Name: support_inquiries si_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "si_admin_update" ON "public"."support_inquiries" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: support_inquiries si_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "si_insert" ON "public"."support_inquiries" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: support_inquiries si_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "si_select" ON "public"."support_inquiries" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: site_labels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."site_labels" ENABLE ROW LEVEL SECURITY;

--
-- Name: site_labels site_labels_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "site_labels_read" ON "public"."site_labels" FOR SELECT USING (true);


--
-- Name: site_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."site_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: site_settings site_settings_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "site_settings_admin_write" ON "public"."site_settings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: site_settings site_settings_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "site_settings_read" ON "public"."site_settings" FOR SELECT USING (true);


--
-- Name: site_settings site_settings_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "site_settings_select_all" ON "public"."site_settings" FOR SELECT USING (true);


--
-- Name: site_settings site_settings_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "site_settings_write" ON "public"."site_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: site_labels sl_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sl_admin_write" ON "public"."site_labels" TO "authenticated" USING ("public"."is_app_admin"("auth"."uid"())) WITH CHECK ("public"."is_app_admin"("auth"."uid"()));


--
-- Name: site_labels sl_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sl_select_all" ON "public"."site_labels" FOR SELECT USING (true);


--
-- Name: service_requests sr_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sr_delete_own" ON "public"."service_requests" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: service_requests sr_insert_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sr_insert_auth" ON "public"."service_requests" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: service_requests sr_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sr_select_all" ON "public"."service_requests" FOR SELECT USING (true);


--
-- Name: service_requests sr_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sr_update_own" ON "public"."service_requests" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: service_request_responses srr_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "srr_delete_own" ON "public"."service_request_responses" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: service_request_responses srr_insert_expert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "srr_insert_expert" ON "public"."service_request_responses" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND ((EXISTS ( SELECT 1
   FROM ("public"."service_requests" "sr"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("sr"."id" = "service_request_responses"."request_id") AND ("p"."account_type" = "sr"."service_type")))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))))));


--
-- Name: service_request_responses srr_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "srr_select_all" ON "public"."service_request_responses" FOR SELECT USING (true);


--
-- Name: service_request_responses srr_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "srr_update_own" ON "public"."service_request_responses" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: search_term_blacklist stb_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "stb_admin_write" ON "public"."search_term_blacklist" TO "authenticated" USING ("public"."is_app_admin"("auth"."uid"())) WITH CHECK ("public"."is_app_admin"("auth"."uid"()));


--
-- Name: search_term_blacklist stb_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "stb_select_all" ON "public"."search_term_blacklist" FOR SELECT USING (true);


--
-- Name: subscription_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."subscription_plans" ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_plans subscription_plans admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "subscription_plans admin write" ON "public"."subscription_plans" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: subscription_plans subscription_plans read active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "subscription_plans read active" ON "public"."subscription_plans" FOR SELECT USING ((("is_active" = true) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions subscriptions admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "subscriptions admin manage" ON "public"."subscriptions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: subscriptions subscriptions read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "subscriptions read own" ON "public"."subscriptions" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ((EXISTS ( SELECT 1
   FROM "information_schema"."tables"
  WHERE (("tables"."table_name")::"name" = 'plaza_admins'::"name"))) AND (EXISTS ( SELECT 1
   FROM "public"."plaza_admins" "pa"
  WHERE (("pa"."user_id" = "auth"."uid"()) AND ("pa"."plaza_id" = "subscriptions"."plaza_id"))))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: subscriptions subscriptions self insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "subscriptions self insert" ON "public"."subscriptions" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("status" = ANY (ARRAY['pending'::"text", 'free_period'::"text"]))));


--
-- Name: subscriptions subscriptions self update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "subscriptions self update" ON "public"."subscriptions" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: support_inquiries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."support_inquiries" ENABLE ROW LEVEL SECURITY;

--
-- Name: transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;

--
-- Name: transactions transactions admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "transactions admin manage" ON "public"."transactions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: transactions transactions read parties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "transactions read parties" ON "public"."transactions" FOR SELECT TO "authenticated" USING ((("buyer_id" = "auth"."uid"()) OR ("seller_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: user_bans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_bans" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_bans user_bans_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_bans_admin_write" ON "public"."user_bans" TO "authenticated" USING ("public"."is_plaza_admin"("auth"."uid"(), "plaza_id")) WITH CHECK ("public"."is_plaza_admin"("auth"."uid"(), "plaza_id"));


--
-- Name: user_bans user_bans_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_bans_select" ON "public"."user_bans" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_plaza_admin"("auth"."uid"(), "plaza_id")));


--
-- Name: user_flags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_flags" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_flags user_flags admin only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_flags admin only" ON "public"."user_flags" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: user_flags user_flags_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_flags_admin_read" ON "public"."user_flags" FOR SELECT TO "authenticated" USING ("public"."is_app_admin"("auth"."uid"()));


--
-- Name: user_flags user_flags_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_flags_admin_write" ON "public"."user_flags" TO "authenticated" USING ("public"."is_app_admin"("auth"."uid"())) WITH CHECK ("public"."is_app_admin"("auth"."uid"()));


--
-- Name: user_points; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_points" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_points user_points admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_points admin manage" ON "public"."user_points" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: user_points user_points read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_points read own" ON "public"."user_points" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: user_push_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_push_tokens" ENABLE ROW LEVEL SECURITY;

--
-- Name: verification_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."verification_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: verification_requests verification_requests_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "verification_requests_read" ON "public"."verification_requests" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: verification_requests verification_requests_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "verification_requests_write" ON "public"."verification_requests" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: visitor_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."visitor_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: visitor_logs visitor_logs_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "visitor_logs_admin_select" ON "public"."visitor_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: verification_requests vr_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "vr_admin_update" ON "public"."verification_requests" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));


--
-- Name: verification_requests vr_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "vr_insert_own" ON "public"."verification_requests" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: verification_requests vr_select_own_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "vr_select_own_or_admin" ON "public"."verification_requests" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))))));


--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "_create_index_if_cols"("p_index_name" "text", "p_table_name" "text", "p_cols" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."_create_index_if_cols"("p_index_name" "text", "p_table_name" "text", "p_cols" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_create_index_if_cols"("p_index_name" "text", "p_table_name" "text", "p_cols" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_create_index_if_cols"("p_index_name" "text", "p_table_name" "text", "p_cols" "text") TO "service_role";


--
-- Name: FUNCTION "add_club_owner_as_member"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."add_club_owner_as_member"() TO "anon";
GRANT ALL ON FUNCTION "public"."add_club_owner_as_member"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_club_owner_as_member"() TO "service_role";


--
-- Name: FUNCTION "add_gb_owner_as_participant"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."add_gb_owner_as_participant"() TO "anon";
GRANT ALL ON FUNCTION "public"."add_gb_owner_as_participant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_gb_owner_as_participant"() TO "service_role";


--
-- Name: FUNCTION "admin_adjust_points"("p_user_id" "uuid", "p_amount" integer, "p_reason" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."admin_adjust_points"("p_user_id" "uuid", "p_amount" integer, "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_adjust_points"("p_user_id" "uuid", "p_amount" integer, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_adjust_points"("p_user_id" "uuid", "p_amount" integer, "p_reason" "text") TO "service_role";


--
-- Name: FUNCTION "admin_adjust_points"("p_user_id" "uuid", "p_plaza_id" "text", "p_delta" bigint, "p_admin_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."admin_adjust_points"("p_user_id" "uuid", "p_plaza_id" "text", "p_delta" bigint, "p_admin_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_adjust_points"("p_user_id" "uuid", "p_plaza_id" "text", "p_delta" bigint, "p_admin_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_adjust_points"("p_user_id" "uuid", "p_plaza_id" "text", "p_delta" bigint, "p_admin_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "apply_approved_account_type"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."apply_approved_account_type"() TO "anon";
GRANT ALL ON FUNCTION "public"."apply_approved_account_type"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_approved_account_type"() TO "service_role";


--
-- Name: FUNCTION "apply_high_volume_flags"("threshold" integer, "days_back" integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."apply_high_volume_flags"("threshold" integer, "days_back" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."apply_high_volume_flags"("threshold" integer, "days_back" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_high_volume_flags"("threshold" integer, "days_back" integer) TO "service_role";


--
-- Name: FUNCTION "auto_complete_orders"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."auto_complete_orders"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_complete_orders"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_complete_orders"() TO "service_role";


--
-- Name: FUNCTION "billing_set_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."billing_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."billing_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."billing_set_updated_at"() TO "service_role";


--
-- Name: FUNCTION "board_posts_enforce_region"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."board_posts_enforce_region"() TO "anon";
GRANT ALL ON FUNCTION "public"."board_posts_enforce_region"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."board_posts_enforce_region"() TO "service_role";


--
-- Name: FUNCTION "board_stats_aggregate"("p_plaza_id" "text", "p_region" "text", "p_days" integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."board_stats_aggregate"("p_plaza_id" "text", "p_region" "text", "p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."board_stats_aggregate"("p_plaza_id" "text", "p_region" "text", "p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."board_stats_aggregate"("p_plaza_id" "text", "p_region" "text", "p_days" integer) TO "service_role";


--
-- Name: FUNCTION "bump_atomic"("p_user_id" "uuid", "p_plaza_id" "text", "p_target_type" "text", "p_target_id" "uuid", "p_payment" "text", "p_points_cost" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."bump_atomic"("p_user_id" "uuid", "p_plaza_id" "text", "p_target_type" "text", "p_target_id" "uuid", "p_payment" "text", "p_points_cost" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bump_atomic"("p_user_id" "uuid", "p_plaza_id" "text", "p_target_type" "text", "p_target_id" "uuid", "p_payment" "text", "p_points_cost" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."bump_atomic"("p_user_id" "uuid", "p_plaza_id" "text", "p_target_type" "text", "p_target_id" "uuid", "p_payment" "text", "p_points_cost" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."bump_atomic"("p_user_id" "uuid", "p_plaza_id" "text", "p_target_type" "text", "p_target_id" "uuid", "p_payment" "text", "p_points_cost" integer) TO "service_role";


--
-- Name: FUNCTION "bump_inc_daily"("p_user_id" "uuid", "p_plaza_id" "text", "p_target_type" "text", "p_date" "date", "p_col" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."bump_inc_daily"("p_user_id" "uuid", "p_plaza_id" "text", "p_target_type" "text", "p_date" "date", "p_col" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bump_inc_daily"("p_user_id" "uuid", "p_plaza_id" "text", "p_target_type" "text", "p_date" "date", "p_col" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."bump_inc_daily"("p_user_id" "uuid", "p_plaza_id" "text", "p_target_type" "text", "p_date" "date", "p_col" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bump_inc_daily"("p_user_id" "uuid", "p_plaza_id" "text", "p_target_type" "text", "p_date" "date", "p_col" "text") TO "service_role";


--
-- Name: FUNCTION "bump_purchase_ticket_atomic"("p_user_id" "uuid", "p_plaza_id" "text", "p_pack_id" "text", "p_payment" "text", "p_payment_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."bump_purchase_ticket_atomic"("p_user_id" "uuid", "p_plaza_id" "text", "p_pack_id" "text", "p_payment" "text", "p_payment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bump_purchase_ticket_atomic"("p_user_id" "uuid", "p_plaza_id" "text", "p_pack_id" "text", "p_payment" "text", "p_payment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."bump_purchase_ticket_atomic"("p_user_id" "uuid", "p_plaza_id" "text", "p_pack_id" "text", "p_payment" "text", "p_payment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bump_purchase_ticket_atomic"("p_user_id" "uuid", "p_plaza_id" "text", "p_pack_id" "text", "p_payment" "text", "p_payment_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "change_like_count"("p_table" "text", "p_id" "uuid", "p_column" "text", "p_delta" integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."change_like_count"("p_table" "text", "p_id" "uuid", "p_column" "text", "p_delta" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."change_like_count"("p_table" "text", "p_id" "uuid", "p_column" "text", "p_delta" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."change_like_count"("p_table" "text", "p_id" "uuid", "p_column" "text", "p_delta" integer) TO "service_role";


--
-- Name: FUNCTION "chat_unread_counts"("p_room_ids" "uuid"[], "p_user_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."chat_unread_counts"("p_room_ids" "uuid"[], "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."chat_unread_counts"("p_room_ids" "uuid"[], "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."chat_unread_counts"("p_room_ids" "uuid"[], "p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "club_join_atomic"("p_club_id" "uuid", "p_user_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."club_join_atomic"("p_club_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."club_join_atomic"("p_club_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."club_join_atomic"("p_club_id" "uuid", "p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "count_user_posts_today"("p_user_id" "uuid", "p_table" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."count_user_posts_today"("p_user_id" "uuid", "p_table" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."count_user_posts_today"("p_user_id" "uuid", "p_table" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_user_posts_today"("p_user_id" "uuid", "p_table" "text") TO "service_role";


--
-- Name: FUNCTION "current_plaza"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."current_plaza"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_plaza"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_plaza"() TO "service_role";


--
-- Name: FUNCTION "decrement_point_daily_counter"("p_user_id" "uuid", "p_rule_id" "text", "p_date" "date"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."decrement_point_daily_counter"("p_user_id" "uuid", "p_rule_id" "text", "p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."decrement_point_daily_counter"("p_user_id" "uuid", "p_rule_id" "text", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrement_point_daily_counter"("p_user_id" "uuid", "p_rule_id" "text", "p_date" "date") TO "service_role";


--
-- Name: FUNCTION "decrement_reputation"("p_user_id" "uuid", "p_amount" integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."decrement_reputation"("p_user_id" "uuid", "p_amount" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."decrement_reputation"("p_user_id" "uuid", "p_amount" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrement_reputation"("p_user_id" "uuid", "p_amount" integer) TO "service_role";


--
-- Name: FUNCTION "deduct_video_credits"("p_user_id" "uuid", "p_points" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."deduct_video_credits"("p_user_id" "uuid", "p_points" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."deduct_video_credits"("p_user_id" "uuid", "p_points" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."deduct_video_credits"("p_user_id" "uuid", "p_points" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."deduct_video_credits"("p_user_id" "uuid", "p_points" integer) TO "service_role";


--
-- Name: FUNCTION "detect_high_volume_users"("threshold" integer, "days_back" integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."detect_high_volume_users"("threshold" integer, "days_back" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."detect_high_volume_users"("threshold" integer, "days_back" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."detect_high_volume_users"("threshold" integer, "days_back" integer) TO "service_role";


--
-- Name: FUNCTION "favorites_no_self"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."favorites_no_self"() TO "anon";
GRANT ALL ON FUNCTION "public"."favorites_no_self"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."favorites_no_self"() TO "service_role";


--
-- Name: FUNCTION "gb_join_atomic"("p_post_id" "uuid", "p_user_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."gb_join_atomic"("p_post_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."gb_join_atomic"("p_post_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gb_join_atomic"("p_post_id" "uuid", "p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "gb_join_atomic_v2"("p_post_id" "uuid", "p_user_id" "uuid", "p_quantity" integer, "p_receive_method" "text", "p_recipient_name" "text", "p_recipient_phone" "text", "p_recipient_address" "text", "p_recipient_address_detail" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."gb_join_atomic_v2"("p_post_id" "uuid", "p_user_id" "uuid", "p_quantity" integer, "p_receive_method" "text", "p_recipient_name" "text", "p_recipient_phone" "text", "p_recipient_address" "text", "p_recipient_address_detail" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gb_join_atomic_v2"("p_post_id" "uuid", "p_user_id" "uuid", "p_quantity" integer, "p_receive_method" "text", "p_recipient_name" "text", "p_recipient_phone" "text", "p_recipient_address" "text", "p_recipient_address_detail" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."gb_join_atomic_v2"("p_post_id" "uuid", "p_user_id" "uuid", "p_quantity" integer, "p_receive_method" "text", "p_recipient_name" "text", "p_recipient_phone" "text", "p_recipient_address" "text", "p_recipient_address_detail" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gb_join_atomic_v2"("p_post_id" "uuid", "p_user_id" "uuid", "p_quantity" integer, "p_receive_method" "text", "p_recipient_name" "text", "p_recipient_phone" "text", "p_recipient_address" "text", "p_recipient_address_detail" "text") TO "service_role";


--
-- Name: FUNCTION "get_email_by_username"("input_username" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."get_email_by_username"("input_username" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_email_by_username"("input_username" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_email_by_username"("input_username" "text") TO "service_role";


--
-- Name: FUNCTION "get_property_favorite_counts"("p_plaza_id" "text", "p_property_ids" "uuid"[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."get_property_favorite_counts"("p_plaza_id" "text", "p_property_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_property_favorite_counts"("p_plaza_id" "text", "p_property_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_property_favorite_counts"("p_plaza_id" "text", "p_property_ids" "uuid"[]) TO "service_role";


--
-- Name: FUNCTION "grant_points_atomic"("p_user" "uuid", "p_plaza" "text", "p_amount" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."grant_points_atomic"("p_user" "uuid", "p_plaza" "text", "p_amount" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."grant_points_atomic"("p_user" "uuid", "p_plaza" "text", "p_amount" integer) TO "service_role";


--
-- Name: FUNCTION "grant_super_admins_to_new_plaza"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."grant_super_admins_to_new_plaza"() TO "anon";
GRANT ALL ON FUNCTION "public"."grant_super_admins_to_new_plaza"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."grant_super_admins_to_new_plaza"() TO "service_role";


--
-- Name: FUNCTION "grant_video_credits"("p_user_id" "uuid", "p_points" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."grant_video_credits"("p_user_id" "uuid", "p_points" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."grant_video_credits"("p_user_id" "uuid", "p_points" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."grant_video_credits"("p_user_id" "uuid", "p_points" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."grant_video_credits"("p_user_id" "uuid", "p_points" integer) TO "service_role";


--
-- Name: FUNCTION "group_buying_auto_process"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."group_buying_auto_process"() TO "anon";
GRANT ALL ON FUNCTION "public"."group_buying_auto_process"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."group_buying_auto_process"() TO "service_role";


--
-- Name: FUNCTION "handle_new_user"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";


--
-- Name: FUNCTION "increment_point_daily_counter"("p_user_id" "uuid", "p_rule_id" "text", "p_date" "date"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."increment_point_daily_counter"("p_user_id" "uuid", "p_rule_id" "text", "p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_point_daily_counter"("p_user_id" "uuid", "p_rule_id" "text", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_point_daily_counter"("p_user_id" "uuid", "p_rule_id" "text", "p_date" "date") TO "service_role";


--
-- Name: FUNCTION "increment_user_points"("p_user_id" "uuid", "p_available_delta" bigint, "p_pending_delta" bigint, "p_lifetime_earned_delta" bigint, "p_lifetime_spent_delta" bigint, "p_lifetime_reverted_delta" bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."increment_user_points"("p_user_id" "uuid", "p_available_delta" bigint, "p_pending_delta" bigint, "p_lifetime_earned_delta" bigint, "p_lifetime_spent_delta" bigint, "p_lifetime_reverted_delta" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_user_points"("p_user_id" "uuid", "p_available_delta" bigint, "p_pending_delta" bigint, "p_lifetime_earned_delta" bigint, "p_lifetime_spent_delta" bigint, "p_lifetime_reverted_delta" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_user_points"("p_user_id" "uuid", "p_available_delta" bigint, "p_pending_delta" bigint, "p_lifetime_earned_delta" bigint, "p_lifetime_spent_delta" bigint, "p_lifetime_reverted_delta" bigint) TO "service_role";


--
-- Name: FUNCTION "increment_view_count"("p_table" "text", "p_id" "uuid", "p_column" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."increment_view_count"("p_table" "text", "p_id" "uuid", "p_column" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_view_count"("p_table" "text", "p_id" "uuid", "p_column" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_view_count"("p_table" "text", "p_id" "uuid", "p_column" "text") TO "service_role";


--
-- Name: FUNCTION "is_admin_for_plaza"("p_plaza_id" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."is_admin_for_plaza"("p_plaza_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_for_plaza"("p_plaza_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_for_plaza"("p_plaza_id" "text") TO "service_role";


--
-- Name: FUNCTION "is_app_admin"("p_uid" "uuid"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."is_app_admin"("p_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_app_admin"("p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_app_admin"("p_uid" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_plaza_admin"("plaza" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."is_plaza_admin"("plaza" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_plaza_admin"("plaza" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_plaza_admin"("plaza" "text") TO "service_role";


--
-- Name: FUNCTION "is_plaza_admin"("p_uid" "uuid", "p_plaza" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."is_plaza_admin"("p_uid" "uuid", "p_plaza" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_plaza_admin"("p_uid" "uuid", "p_plaza" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_plaza_admin"("p_uid" "uuid", "p_plaza" "text") TO "service_role";


--
-- Name: FUNCTION "is_plaza_admin_for"("check_plaza_id" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."is_plaza_admin_for"("check_plaza_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_plaza_admin_for"("check_plaza_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_plaza_admin_for"("check_plaza_id" "text") TO "service_role";


--
-- Name: FUNCTION "is_super_admin"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";


--
-- Name: FUNCTION "is_super_plaza_admin"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."is_super_plaza_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_plaza_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_plaza_admin"() TO "service_role";


--
-- Name: FUNCTION "is_user_banned"("p_uid" "uuid", "p_plaza" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."is_user_banned"("p_uid" "uuid", "p_plaza" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_user_banned"("p_uid" "uuid", "p_plaza" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_banned"("p_uid" "uuid", "p_plaza" "text") TO "service_role";


--
-- Name: FUNCTION "log_search_query"("p_term" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."log_search_query"("p_term" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."log_search_query"("p_term" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_search_query"("p_term" "text") TO "service_role";


--
-- Name: FUNCTION "points_confirm_one"("p_tx_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."points_confirm_one"("p_tx_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."points_confirm_one"("p_tx_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."points_confirm_one"("p_tx_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "points_refund_spend"("p_tx_id" "uuid", "p_reason" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."points_refund_spend"("p_tx_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."points_refund_spend"("p_tx_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."points_refund_spend"("p_tx_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."points_refund_spend"("p_tx_id" "uuid", "p_reason" "text") TO "service_role";


--
-- Name: FUNCTION "points_revert_one"("p_tx_id" "uuid", "p_reason" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."points_revert_one"("p_tx_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."points_revert_one"("p_tx_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."points_revert_one"("p_tx_id" "uuid", "p_reason" "text") TO "service_role";


--
-- Name: FUNCTION "points_spend_atomic"("p_user_id" "uuid", "p_plaza_id" "text", "p_category" "text", "p_amount" integer, "p_payment_total" integer, "p_source_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."points_spend_atomic"("p_user_id" "uuid", "p_plaza_id" "text", "p_category" "text", "p_amount" integer, "p_payment_total" integer, "p_source_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."points_spend_atomic"("p_user_id" "uuid", "p_plaza_id" "text", "p_category" "text", "p_amount" integer, "p_payment_total" integer, "p_source_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."points_spend_atomic"("p_user_id" "uuid", "p_plaza_id" "text", "p_category" "text", "p_amount" integer, "p_payment_total" integer, "p_source_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."points_spend_atomic"("p_user_id" "uuid", "p_plaza_id" "text", "p_category" "text", "p_amount" integer, "p_payment_total" integer, "p_source_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "property_requests_touch_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."property_requests_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."property_requests_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."property_requests_touch_updated_at"() TO "service_role";


--
-- Name: FUNCTION "service_requests_touch_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."service_requests_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."service_requests_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."service_requests_touch_updated_at"() TO "service_role";


--
-- Name: FUNCTION "set_account_type_requests_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."set_account_type_requests_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_account_type_requests_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_account_type_requests_updated_at"() TO "service_role";


--
-- Name: FUNCTION "set_current_plaza"("plaza" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."set_current_plaza"("plaza" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_current_plaza"("plaza" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_current_plaza"("plaza" "text") TO "service_role";


--
-- Name: FUNCTION "set_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";


--
-- Name: FUNCTION "suggest_search_terms"("p_term" "text", "p_limit" integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."suggest_search_terms"("p_term" "text", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."suggest_search_terms"("p_term" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."suggest_search_terms"("p_term" "text", "p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "touch_ai_video_jobs_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."touch_ai_video_jobs_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_ai_video_jobs_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_ai_video_jobs_updated_at"() TO "service_role";


--
-- Name: FUNCTION "touch_user_push_tokens_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."touch_user_push_tokens_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_user_push_tokens_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_user_push_tokens_updated_at"() TO "service_role";


--
-- Name: FUNCTION "trg_local_food_orders_freeze_critical"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."trg_local_food_orders_freeze_critical"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_local_food_orders_freeze_critical"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_local_food_orders_freeze_critical"() TO "service_role";


--
-- Name: FUNCTION "trg_reviews_after_change"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."trg_reviews_after_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_reviews_after_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_reviews_after_change"() TO "service_role";


--
-- Name: FUNCTION "trg_set_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."trg_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_set_updated_at"() TO "service_role";


--
-- Name: FUNCTION "trg_sync_properties_on_account_type_change"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."trg_sync_properties_on_account_type_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_sync_properties_on_account_type_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_sync_properties_on_account_type_change"() TO "service_role";


--
-- Name: FUNCTION "update_neighbor_star"("p_user_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."update_neighbor_star"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_neighbor_star"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_neighbor_star"("p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "update_plaza_business_info"("p_plaza_id" "text", "p_info" "jsonb"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."update_plaza_business_info"("p_plaza_id" "text", "p_info" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_plaza_business_info"("p_plaza_id" "text", "p_info" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_plaza_business_info"("p_plaza_id" "text", "p_info" "jsonb") TO "service_role";


--
-- Name: FUNCTION "update_post_comment_count"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."update_post_comment_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_post_comment_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_post_comment_count"() TO "service_role";


--
-- Name: FUNCTION "update_post_like_count"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."update_post_like_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_post_like_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_post_like_count"() TO "service_role";


--
-- Name: FUNCTION "update_trust_score"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."update_trust_score"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_trust_score"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_trust_score"() TO "service_role";


--
-- Name: FUNCTION "update_trust_score"("p_user_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."update_trust_score"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_trust_score"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_trust_score"("p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "update_updated_at_column"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


--
-- Name: FUNCTION "user_in_plaza"("p_plaza_id" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."user_in_plaza"("p_plaza_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."user_in_plaza"("p_plaza_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_in_plaza"("p_plaza_id" "text") TO "service_role";


--
-- Name: TABLE "account_type_requests"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."account_type_requests" TO "anon";
GRANT ALL ON TABLE "public"."account_type_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."account_type_requests" TO "service_role";


--
-- Name: TABLE "admin_actions"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."admin_actions" TO "anon";
GRANT ALL ON TABLE "public"."admin_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_actions" TO "service_role";


--
-- Name: SEQUENCE "admin_actions_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."admin_actions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."admin_actions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."admin_actions_id_seq" TO "service_role";


--
-- Name: TABLE "admin_backup_logs"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."admin_backup_logs" TO "anon";
GRANT ALL ON TABLE "public"."admin_backup_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_backup_logs" TO "service_role";


--
-- Name: TABLE "admin_mail_log"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."admin_mail_log" TO "anon";
GRANT ALL ON TABLE "public"."admin_mail_log" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_mail_log" TO "service_role";


--
-- Name: TABLE "admin_permissions"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."admin_permissions" TO "anon";
GRANT ALL ON TABLE "public"."admin_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_permissions" TO "service_role";


--
-- Name: TABLE "admin_user_memos"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."admin_user_memos" TO "anon";
GRANT ALL ON TABLE "public"."admin_user_memos" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_user_memos" TO "service_role";


--
-- Name: TABLE "ai_video_jobs"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ai_video_jobs" TO "anon";
GRANT ALL ON TABLE "public"."ai_video_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_video_jobs" TO "service_role";


--
-- Name: TABLE "app_versions"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."app_versions" TO "anon";
GRANT ALL ON TABLE "public"."app_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."app_versions" TO "service_role";


--
-- Name: TABLE "audit_log"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";


--
-- Name: SEQUENCE "audit_log_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "service_role";


--
-- Name: TABLE "block_users"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."block_users" TO "anon";
GRANT ALL ON TABLE "public"."block_users" TO "authenticated";
GRANT ALL ON TABLE "public"."block_users" TO "service_role";


--
-- Name: TABLE "board_categories"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."board_categories" TO "anon";
GRANT ALL ON TABLE "public"."board_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."board_categories" TO "service_role";


--
-- Name: TABLE "board_comments"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."board_comments" TO "anon";
GRANT ALL ON TABLE "public"."board_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."board_comments" TO "service_role";


--
-- Name: TABLE "board_post_likes"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."board_post_likes" TO "anon";
GRANT ALL ON TABLE "public"."board_post_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."board_post_likes" TO "service_role";


--
-- Name: TABLE "board_posts"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."board_posts" TO "anon";
GRANT ALL ON TABLE "public"."board_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."board_posts" TO "service_role";


--
-- Name: TABLE "boost_orders"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."boost_orders" TO "anon";
GRANT ALL ON TABLE "public"."boost_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."boost_orders" TO "service_role";


--
-- Name: TABLE "boost_pricing"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."boost_pricing" TO "anon";
GRANT ALL ON TABLE "public"."boost_pricing" TO "authenticated";
GRANT ALL ON TABLE "public"."boost_pricing" TO "service_role";


--
-- Name: TABLE "bump_daily"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."bump_daily" TO "anon";
GRANT ALL ON TABLE "public"."bump_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."bump_daily" TO "service_role";


--
-- Name: TABLE "bump_history"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."bump_history" TO "anon";
GRANT ALL ON TABLE "public"."bump_history" TO "authenticated";
GRANT ALL ON TABLE "public"."bump_history" TO "service_role";


--
-- Name: TABLE "bump_settings"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."bump_settings" TO "anon";
GRANT ALL ON TABLE "public"."bump_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."bump_settings" TO "service_role";


--
-- Name: TABLE "bump_ticket_orders"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."bump_ticket_orders" TO "anon";
GRANT ALL ON TABLE "public"."bump_ticket_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."bump_ticket_orders" TO "service_role";


--
-- Name: TABLE "bump_ticket_packs"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."bump_ticket_packs" TO "anon";
GRANT ALL ON TABLE "public"."bump_ticket_packs" TO "authenticated";
GRANT ALL ON TABLE "public"."bump_ticket_packs" TO "service_role";


--
-- Name: TABLE "bump_tickets"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."bump_tickets" TO "anon";
GRANT ALL ON TABLE "public"."bump_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."bump_tickets" TO "service_role";


--
-- Name: TABLE "business_declarations"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."business_declarations" TO "anon";
GRANT ALL ON TABLE "public"."business_declarations" TO "authenticated";
GRANT ALL ON TABLE "public"."business_declarations" TO "service_role";


--
-- Name: TABLE "categories"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";


--
-- Name: TABLE "chat_room_participants"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."chat_room_participants" TO "anon";
GRANT ALL ON TABLE "public"."chat_room_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_room_participants" TO "service_role";


--
-- Name: TABLE "chat_rooms"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."chat_rooms" TO "anon";
GRANT ALL ON TABLE "public"."chat_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_rooms" TO "service_role";


--
-- Name: TABLE "chuncheon_events"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."chuncheon_events" TO "anon";
GRANT ALL ON TABLE "public"."chuncheon_events" TO "authenticated";
GRANT ALL ON TABLE "public"."chuncheon_events" TO "service_role";


--
-- Name: TABLE "cleaning_favorites"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."cleaning_favorites" TO "anon";
GRANT ALL ON TABLE "public"."cleaning_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."cleaning_favorites" TO "service_role";


--
-- Name: TABLE "cleaning_posts"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."cleaning_posts" TO "anon";
GRANT ALL ON TABLE "public"."cleaning_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."cleaning_posts" TO "service_role";


--
-- Name: TABLE "club_chat_messages"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."club_chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."club_chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."club_chat_messages" TO "service_role";


--
-- Name: TABLE "club_likes"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."club_likes" TO "anon";
GRANT ALL ON TABLE "public"."club_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."club_likes" TO "service_role";


--
-- Name: TABLE "club_members"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."club_members" TO "anon";
GRANT ALL ON TABLE "public"."club_members" TO "authenticated";
GRANT ALL ON TABLE "public"."club_members" TO "service_role";


--
-- Name: TABLE "clubs"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."clubs" TO "anon";
GRANT ALL ON TABLE "public"."clubs" TO "authenticated";
GRANT ALL ON TABLE "public"."clubs" TO "service_role";


--
-- Name: TABLE "commission_rates"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."commission_rates" TO "anon";
GRANT ALL ON TABLE "public"."commission_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."commission_rates" TO "service_role";


--
-- Name: TABLE "commission_settings"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."commission_settings" TO "anon";
GRANT ALL ON TABLE "public"."commission_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."commission_settings" TO "service_role";


--
-- Name: TABLE "commission_splits"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."commission_splits" TO "anon";
GRANT ALL ON TABLE "public"."commission_splits" TO "authenticated";
GRANT ALL ON TABLE "public"."commission_splits" TO "service_role";


--
-- Name: TABLE "credit_purchases"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."credit_purchases" TO "anon";
GRANT ALL ON TABLE "public"."credit_purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_purchases" TO "service_role";


--
-- Name: TABLE "cron_run_log"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."cron_run_log" TO "anon";
GRANT ALL ON TABLE "public"."cron_run_log" TO "authenticated";
GRANT ALL ON TABLE "public"."cron_run_log" TO "service_role";


--
-- Name: TABLE "expert_invitations"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."expert_invitations" TO "anon";
GRANT ALL ON TABLE "public"."expert_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."expert_invitations" TO "service_role";


--
-- Name: TABLE "faqs"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."faqs" TO "anon";
GRANT ALL ON TABLE "public"."faqs" TO "authenticated";
GRANT ALL ON TABLE "public"."faqs" TO "service_role";


--
-- Name: TABLE "favorites"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."favorites" TO "anon";
GRANT ALL ON TABLE "public"."favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."favorites" TO "service_role";


--
-- Name: TABLE "feature_flags"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."feature_flags" TO "anon";
GRANT ALL ON TABLE "public"."feature_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."feature_flags" TO "service_role";


--
-- Name: TABLE "follows"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."follows" TO "anon";
GRANT ALL ON TABLE "public"."follows" TO "authenticated";
GRANT ALL ON TABLE "public"."follows" TO "service_role";


--
-- Name: TABLE "group_buying_chat_messages"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."group_buying_chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."group_buying_chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."group_buying_chat_messages" TO "service_role";


--
-- Name: TABLE "group_buying_posts"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."group_buying_posts" TO "anon";
GRANT ALL ON TABLE "public"."group_buying_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."group_buying_posts" TO "service_role";


--
-- Name: TABLE "group_buying_host_stats"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."group_buying_host_stats" TO "anon";
GRANT ALL ON TABLE "public"."group_buying_host_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."group_buying_host_stats" TO "service_role";


--
-- Name: TABLE "group_buying_orders"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."group_buying_orders" TO "anon";
GRANT ALL ON TABLE "public"."group_buying_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."group_buying_orders" TO "service_role";


--
-- Name: TABLE "group_buying_participants"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."group_buying_participants" TO "anon";
GRANT ALL ON TABLE "public"."group_buying_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."group_buying_participants" TO "service_role";


--
-- Name: TABLE "group_buying_wishlist"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."group_buying_wishlist" TO "anon";
GRANT ALL ON TABLE "public"."group_buying_wishlist" TO "authenticated";
GRANT ALL ON TABLE "public"."group_buying_wishlist" TO "service_role";


--
-- Name: TABLE "hero_banners"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."hero_banners" TO "anon";
GRANT ALL ON TABLE "public"."hero_banners" TO "authenticated";
GRANT ALL ON TABLE "public"."hero_banners" TO "service_role";


--
-- Name: TABLE "homepage_menu"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."homepage_menu" TO "anon";
GRANT ALL ON TABLE "public"."homepage_menu" TO "authenticated";
GRANT ALL ON TABLE "public"."homepage_menu" TO "service_role";


--
-- Name: TABLE "homepage_slider"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."homepage_slider" TO "anon";
GRANT ALL ON TABLE "public"."homepage_slider" TO "authenticated";
GRANT ALL ON TABLE "public"."homepage_slider" TO "service_role";


--
-- Name: TABLE "interior_favorites"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."interior_favorites" TO "anon";
GRANT ALL ON TABLE "public"."interior_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."interior_favorites" TO "service_role";


--
-- Name: TABLE "interior_posts"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."interior_posts" TO "anon";
GRANT ALL ON TABLE "public"."interior_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."interior_posts" TO "service_role";


--
-- Name: TABLE "jobs_likes"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."jobs_likes" TO "anon";
GRANT ALL ON TABLE "public"."jobs_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."jobs_likes" TO "service_role";


--
-- Name: TABLE "jobs_posts"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."jobs_posts" TO "anon";
GRANT ALL ON TABLE "public"."jobs_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."jobs_posts" TO "service_role";


--
-- Name: TABLE "local_food"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."local_food" TO "anon";
GRANT ALL ON TABLE "public"."local_food" TO "authenticated";
GRANT ALL ON TABLE "public"."local_food" TO "service_role";


--
-- Name: TABLE "local_food_likes"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."local_food_likes" TO "anon";
GRANT ALL ON TABLE "public"."local_food_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."local_food_likes" TO "service_role";


--
-- Name: TABLE "local_food_order_items"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."local_food_order_items" TO "anon";
GRANT ALL ON TABLE "public"."local_food_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."local_food_order_items" TO "service_role";


--
-- Name: TABLE "local_food_orders"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."local_food_orders" TO "anon";
GRANT ALL ON TABLE "public"."local_food_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."local_food_orders" TO "service_role";


--
-- Name: TABLE "maintenance_settings"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."maintenance_settings" TO "anon";
GRANT ALL ON TABLE "public"."maintenance_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."maintenance_settings" TO "service_role";


--
-- Name: TABLE "messages"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";


--
-- Name: TABLE "moderation_keywords"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."moderation_keywords" TO "anon";
GRANT ALL ON TABLE "public"."moderation_keywords" TO "authenticated";
GRANT ALL ON TABLE "public"."moderation_keywords" TO "service_role";


--
-- Name: TABLE "moving_favorites"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."moving_favorites" TO "anon";
GRANT ALL ON TABLE "public"."moving_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."moving_favorites" TO "service_role";


--
-- Name: TABLE "moving_posts"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."moving_posts" TO "anon";
GRANT ALL ON TABLE "public"."moving_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."moving_posts" TO "service_role";


--
-- Name: TABLE "my_club_chat_rooms"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."my_club_chat_rooms" TO "anon";
GRANT ALL ON TABLE "public"."my_club_chat_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."my_club_chat_rooms" TO "service_role";


--
-- Name: TABLE "my_group_buying_chat_rooms"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."my_group_buying_chat_rooms" TO "anon";
GRANT ALL ON TABLE "public"."my_group_buying_chat_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."my_group_buying_chat_rooms" TO "service_role";


--
-- Name: TABLE "new_store_likes"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."new_store_likes" TO "anon";
GRANT ALL ON TABLE "public"."new_store_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."new_store_likes" TO "service_role";


--
-- Name: TABLE "new_store_posts"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."new_store_posts" TO "anon";
GRANT ALL ON TABLE "public"."new_store_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."new_store_posts" TO "service_role";


--
-- Name: TABLE "notices"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."notices" TO "anon";
GRANT ALL ON TABLE "public"."notices" TO "authenticated";
GRANT ALL ON TABLE "public"."notices" TO "service_role";


--
-- Name: TABLE "notifications"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";


--
-- Name: TABLE "page_heroes"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."page_heroes" TO "anon";
GRANT ALL ON TABLE "public"."page_heroes" TO "authenticated";
GRANT ALL ON TABLE "public"."page_heroes" TO "service_role";


--
-- Name: TABLE "payment_webhooks"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."payment_webhooks" TO "anon";
GRANT ALL ON TABLE "public"."payment_webhooks" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_webhooks" TO "service_role";


--
-- Name: TABLE "payments"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";


--
-- Name: TABLE "payout_batches"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."payout_batches" TO "anon";
GRANT ALL ON TABLE "public"."payout_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."payout_batches" TO "service_role";


--
-- Name: TABLE "payouts"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."payouts" TO "anon";
GRANT ALL ON TABLE "public"."payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."payouts" TO "service_role";


--
-- Name: TABLE "plaza_admins"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."plaza_admins" TO "anon";
GRANT ALL ON TABLE "public"."plaza_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."plaza_admins" TO "service_role";


--
-- Name: TABLE "plaza_associations"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."plaza_associations" TO "anon";
GRANT ALL ON TABLE "public"."plaza_associations" TO "authenticated";
GRANT ALL ON TABLE "public"."plaza_associations" TO "service_role";


--
-- Name: TABLE "plaza_profiles"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."plaza_profiles" TO "anon";
GRANT ALL ON TABLE "public"."plaza_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."plaza_profiles" TO "service_role";


--
-- Name: TABLE "plaza_settings"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."plaza_settings" TO "anon";
GRANT ALL ON TABLE "public"."plaza_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."plaza_settings" TO "service_role";


--
-- Name: TABLE "plaza_settlements"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."plaza_settlements" TO "anon";
GRANT ALL ON TABLE "public"."plaza_settlements" TO "authenticated";
GRANT ALL ON TABLE "public"."plaza_settlements" TO "service_role";


--
-- Name: TABLE "plazas"; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."plazas" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."plazas" TO "authenticated";
GRANT ALL ON TABLE "public"."plazas" TO "service_role";


--
-- Name: COLUMN "plazas"."id"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("id") ON TABLE "public"."plazas" TO "anon";
GRANT SELECT("id") ON TABLE "public"."plazas" TO "authenticated";


--
-- Name: COLUMN "plazas"."name"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("name") ON TABLE "public"."plazas" TO "anon";
GRANT SELECT("name") ON TABLE "public"."plazas" TO "authenticated";


--
-- Name: COLUMN "plazas"."parent_region"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("parent_region") ON TABLE "public"."plazas" TO "anon";
GRANT SELECT("parent_region") ON TABLE "public"."plazas" TO "authenticated";


--
-- Name: COLUMN "plazas"."center_lat"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("center_lat") ON TABLE "public"."plazas" TO "anon";
GRANT SELECT("center_lat") ON TABLE "public"."plazas" TO "authenticated";


--
-- Name: COLUMN "plazas"."center_lng"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("center_lng") ON TABLE "public"."plazas" TO "anon";
GRANT SELECT("center_lng") ON TABLE "public"."plazas" TO "authenticated";


--
-- Name: COLUMN "plazas"."bounds"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("bounds") ON TABLE "public"."plazas" TO "anon";
GRANT SELECT("bounds") ON TABLE "public"."plazas" TO "authenticated";


--
-- Name: COLUMN "plazas"."theme"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("theme") ON TABLE "public"."plazas" TO "anon";
GRANT SELECT("theme") ON TABLE "public"."plazas" TO "authenticated";


--
-- Name: COLUMN "plazas"."is_active"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("is_active") ON TABLE "public"."plazas" TO "anon";
GRANT SELECT("is_active") ON TABLE "public"."plazas" TO "authenticated";


--
-- Name: COLUMN "plazas"."is_open_soon"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("is_open_soon") ON TABLE "public"."plazas" TO "anon";
GRANT SELECT("is_open_soon") ON TABLE "public"."plazas" TO "authenticated";


--
-- Name: COLUMN "plazas"."sort_order"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("sort_order") ON TABLE "public"."plazas" TO "anon";
GRANT SELECT("sort_order") ON TABLE "public"."plazas" TO "authenticated";


--
-- Name: COLUMN "plazas"."created_at"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("created_at") ON TABLE "public"."plazas" TO "anon";
GRANT SELECT("created_at") ON TABLE "public"."plazas" TO "authenticated";


--
-- Name: COLUMN "plazas"."updated_at"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("updated_at") ON TABLE "public"."plazas" TO "anon";
GRANT SELECT("updated_at") ON TABLE "public"."plazas" TO "authenticated";


--
-- Name: COLUMN "plazas"."coverage"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("coverage") ON TABLE "public"."plazas" TO "anon";
GRANT SELECT("coverage") ON TABLE "public"."plazas" TO "authenticated";


--
-- Name: COLUMN "plazas"."tour_area_code"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("tour_area_code") ON TABLE "public"."plazas" TO "anon";
GRANT SELECT("tour_area_code") ON TABLE "public"."plazas" TO "authenticated";


--
-- Name: COLUMN "plazas"."tour_sigungu_code"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("tour_sigungu_code") ON TABLE "public"."plazas" TO "anon";
GRANT SELECT("tour_sigungu_code") ON TABLE "public"."plazas" TO "authenticated";


--
-- Name: COLUMN "plazas"."pg_provider"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("pg_provider") ON TABLE "public"."plazas" TO "anon";
GRANT SELECT("pg_provider") ON TABLE "public"."plazas" TO "authenticated";


--
-- Name: COLUMN "plazas"."payments_enabled"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("payments_enabled") ON TABLE "public"."plazas" TO "anon";
GRANT SELECT("payments_enabled") ON TABLE "public"."plazas" TO "authenticated";


--
-- Name: TABLE "point_daily_counters"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."point_daily_counters" TO "anon";
GRANT ALL ON TABLE "public"."point_daily_counters" TO "authenticated";
GRANT ALL ON TABLE "public"."point_daily_counters" TO "service_role";


--
-- Name: TABLE "point_history"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."point_history" TO "anon";
GRANT ALL ON TABLE "public"."point_history" TO "authenticated";
GRANT ALL ON TABLE "public"."point_history" TO "service_role";


--
-- Name: TABLE "point_redemption_settings"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."point_redemption_settings" TO "anon";
GRANT ALL ON TABLE "public"."point_redemption_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."point_redemption_settings" TO "service_role";


--
-- Name: TABLE "point_rules"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."point_rules" TO "anon";
GRANT ALL ON TABLE "public"."point_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."point_rules" TO "service_role";


--
-- Name: TABLE "point_transactions"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."point_transactions" TO "anon";
GRANT ALL ON TABLE "public"."point_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."point_transactions" TO "service_role";


--
-- Name: TABLE "popular_searches"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."popular_searches" TO "anon";
GRANT ALL ON TABLE "public"."popular_searches" TO "authenticated";
GRANT ALL ON TABLE "public"."popular_searches" TO "service_role";


--
-- Name: TABLE "popups"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."popups" TO "anon";
GRANT ALL ON TABLE "public"."popups" TO "authenticated";
GRANT ALL ON TABLE "public"."popups" TO "service_role";


--
-- Name: TABLE "post_reports"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."post_reports" TO "anon";
GRANT ALL ON TABLE "public"."post_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."post_reports" TO "service_role";


--
-- Name: TABLE "producer_settlements"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."producer_settlements" TO "anon";
GRANT ALL ON TABLE "public"."producer_settlements" TO "authenticated";
GRANT ALL ON TABLE "public"."producer_settlements" TO "service_role";


--
-- Name: TABLE "profile_highlights"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."profile_highlights" TO "anon";
GRANT ALL ON TABLE "public"."profile_highlights" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_highlights" TO "service_role";


--
-- Name: TABLE "profiles"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";


--
-- Name: TABLE "profile_stats"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."profile_stats" TO "anon";
GRANT ALL ON TABLE "public"."profile_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_stats" TO "service_role";


--
-- Name: TABLE "properties"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."properties" TO "anon";
GRANT ALL ON TABLE "public"."properties" TO "authenticated";
GRANT ALL ON TABLE "public"."properties" TO "service_role";


--
-- Name: TABLE "property_highlights"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."property_highlights" TO "anon";
GRANT ALL ON TABLE "public"."property_highlights" TO "authenticated";
GRANT ALL ON TABLE "public"."property_highlights" TO "service_role";


--
-- Name: TABLE "property_reports"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."property_reports" TO "anon";
GRANT ALL ON TABLE "public"."property_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."property_reports" TO "service_role";


--
-- Name: TABLE "property_request_responses"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."property_request_responses" TO "anon";
GRANT ALL ON TABLE "public"."property_request_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."property_request_responses" TO "service_role";


--
-- Name: TABLE "property_requests"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."property_requests" TO "anon";
GRANT ALL ON TABLE "public"."property_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."property_requests" TO "service_role";


--
-- Name: TABLE "refund_requests"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."refund_requests" TO "anon";
GRANT ALL ON TABLE "public"."refund_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."refund_requests" TO "service_role";


--
-- Name: TABLE "regions"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."regions" TO "anon";
GRANT ALL ON TABLE "public"."regions" TO "authenticated";
GRANT ALL ON TABLE "public"."regions" TO "service_role";


--
-- Name: TABLE "repair_favorites"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."repair_favorites" TO "anon";
GRANT ALL ON TABLE "public"."repair_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."repair_favorites" TO "service_role";


--
-- Name: TABLE "repair_posts"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."repair_posts" TO "anon";
GRANT ALL ON TABLE "public"."repair_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."repair_posts" TO "service_role";


--
-- Name: TABLE "reviews"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";


--
-- Name: TABLE "search_queries"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."search_queries" TO "anon";
GRANT ALL ON TABLE "public"."search_queries" TO "authenticated";
GRANT ALL ON TABLE "public"."search_queries" TO "service_role";


--
-- Name: TABLE "search_term_blacklist"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."search_term_blacklist" TO "anon";
GRANT ALL ON TABLE "public"."search_term_blacklist" TO "authenticated";
GRANT ALL ON TABLE "public"."search_term_blacklist" TO "service_role";


--
-- Name: TABLE "secondhand_likes"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."secondhand_likes" TO "anon";
GRANT ALL ON TABLE "public"."secondhand_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."secondhand_likes" TO "service_role";


--
-- Name: TABLE "secondhand_posts"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."secondhand_posts" TO "anon";
GRANT ALL ON TABLE "public"."secondhand_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."secondhand_posts" TO "service_role";


--
-- Name: TABLE "service_request_responses"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."service_request_responses" TO "anon";
GRANT ALL ON TABLE "public"."service_request_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."service_request_responses" TO "service_role";


--
-- Name: TABLE "service_requests"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."service_requests" TO "anon";
GRANT ALL ON TABLE "public"."service_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."service_requests" TO "service_role";


--
-- Name: TABLE "sharing_likes"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."sharing_likes" TO "anon";
GRANT ALL ON TABLE "public"."sharing_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."sharing_likes" TO "service_role";


--
-- Name: TABLE "sharing_posts"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."sharing_posts" TO "anon";
GRANT ALL ON TABLE "public"."sharing_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."sharing_posts" TO "service_role";


--
-- Name: TABLE "site_labels"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."site_labels" TO "anon";
GRANT ALL ON TABLE "public"."site_labels" TO "authenticated";
GRANT ALL ON TABLE "public"."site_labels" TO "service_role";


--
-- Name: TABLE "site_settings"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."site_settings" TO "anon";
GRANT ALL ON TABLE "public"."site_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."site_settings" TO "service_role";


--
-- Name: TABLE "subscription_plans"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."subscription_plans" TO "anon";
GRANT ALL ON TABLE "public"."subscription_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_plans" TO "service_role";


--
-- Name: TABLE "subscriptions"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";


--
-- Name: TABLE "support_inquiries"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."support_inquiries" TO "anon";
GRANT ALL ON TABLE "public"."support_inquiries" TO "authenticated";
GRANT ALL ON TABLE "public"."support_inquiries" TO "service_role";


--
-- Name: TABLE "transactions"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";


--
-- Name: TABLE "user_bans"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."user_bans" TO "anon";
GRANT ALL ON TABLE "public"."user_bans" TO "authenticated";
GRANT ALL ON TABLE "public"."user_bans" TO "service_role";


--
-- Name: SEQUENCE "user_bans_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."user_bans_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_bans_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_bans_id_seq" TO "service_role";


--
-- Name: TABLE "user_flags"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."user_flags" TO "anon";
GRANT ALL ON TABLE "public"."user_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."user_flags" TO "service_role";


--
-- Name: TABLE "user_points"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."user_points" TO "anon";
GRANT ALL ON TABLE "public"."user_points" TO "authenticated";
GRANT ALL ON TABLE "public"."user_points" TO "service_role";


--
-- Name: TABLE "user_push_tokens"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."user_push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."user_push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."user_push_tokens" TO "service_role";


--
-- Name: TABLE "verification_requests"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."verification_requests" TO "anon";
GRANT ALL ON TABLE "public"."verification_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."verification_requests" TO "service_role";


--
-- Name: TABLE "visitor_logs"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."visitor_logs" TO "anon";
GRANT ALL ON TABLE "public"."visitor_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."visitor_logs" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--

\unrestrict NSeIVCkDGtxKEoc8UVUl9MGiecfJuA4P5P0GQqhKVlof0khFZI4q357Cy339Qx0

