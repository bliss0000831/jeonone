-- ============================================================================
-- group-buying / clubs join atomic RPC — race condition (max 초과) 차단
--
-- 기존: route 가 SELECT count → check → INSERT 의 3단계라 동시성 시 max 초과 가능
-- 신규: 단일 트랜잭션 + advisory lock 으로 보장
-- ============================================================================

-- ─── group_buying join atomic ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gb_join_atomic(
  p_post_id UUID,
  p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

-- ─── clubs join atomic ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.club_join_atomic(
  p_club_id UUID,
  p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

NOTIFY pgrst, 'reload schema';
