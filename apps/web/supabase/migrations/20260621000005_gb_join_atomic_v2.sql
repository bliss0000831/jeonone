-- ============================================================================
-- gb_join_atomic_v2 — 공동구매 참여 (수량 합산 모델)
--
-- 배경: 기존 gb_join_atomic 은 "1명 = 1슬롯" 가정인데, 실제 group_buying 은
--       사용자별 quantity 를 합산해서 max_participants 와 비교하는 모델.
--       라우트의 SELECT count → INSERT 사이에 TOCTOU 가능 → 정원 초과 우려.
--
-- 동작:
--   1) post_id 단위 advisory_xact_lock
--   2) group_buying_posts FOR UPDATE
--   3) 마감/본인/모집상태/마감일 검증
--   4) 기존 참여 여부 확인
--   5) 주최자 제외 quantity 합 + 신규 quantity ≤ max_participants 검증
--   6) participants INSERT + posts.current_participants 갱신
--
-- 인자: 라우트가 받는 모든 필드 그대로 전달
-- 반환: { ok, error?, status?, current_participants? }
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.gb_join_atomic_v2(...);
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.gb_join_atomic_v2(
  p_post_id UUID,
  p_user_id UUID,
  p_quantity INTEGER,
  p_receive_method TEXT,
  p_recipient_name TEXT,
  p_recipient_phone TEXT,
  p_recipient_address TEXT,
  p_recipient_address_detail TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

REVOKE ALL ON FUNCTION public.gb_join_atomic_v2(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gb_join_atomic_v2(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
