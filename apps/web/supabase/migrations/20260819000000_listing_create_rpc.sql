-- ════════════════════════════════════════════════════════════════════════════
-- 전원일기 — 경매/대여 매물 등록 원자성 (H3)
--
-- 문제:
--   경매/대여 등록이 2단계 비원자였다.
--     ① POST /api/secondhand 가 secondhand_posts(listing_type='auction'|'rental') 생성
--     ② 클라이언트가 별도로 auction_listings / rental_listings 를 INSERT
--   ②가 실패하면 post 만 남고 listing 이 없는 "고아 post"(입찰/대여신청 불가) 발생.
--
-- 해결:
--   이미 생성된 secondhand_posts 행에 대해 매칭되는 listing 행을 단일 트랜잭션으로
--   생성하는 SECURITY DEFINER RPC. /api/secondhand 라우트가 post 생성 직후 같은
--   요청에서 호출한다. RPC 가 실패하면 라우트가 post 를 삭제(롤백)하여 고아 post 를
--   원천 차단한다.
--
-- 안전장치:
--   - p_owner(호출자 user id) 가 post.user_id 와 일치해야만 listing 생성 (소유자 보장).
--   - post.listing_type 이 p_kind 와 일치해야만 생성 (sale 글에는 listing 안 만듦).
--   - 동일 post 에 이미 listing 이 있으면 그 id 를 그대로 반환(멱등 — 재시도 안전).
--   - plaza_id 는 post 의 plaza_id 를 그대로 사용(클라 입력 무시 — 위변조 방지).
--
-- service_role 전용: GRANT EXECUTE 를 service_role 에만 부여(라우트가 admin write
--   클라이언트 또는 RLS-우회 service_role 로 호출). authenticated 직접 호출 불가.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_secondhand_listing(
  p_post_id        UUID,
  p_owner          UUID,
  p_kind           TEXT,                 -- 'auction' | 'rental'
  -- 경매 파라미터
  p_start_price    INTEGER DEFAULT NULL,
  p_bid_increment  INTEGER DEFAULT NULL,
  p_end_at         TIMESTAMPTZ DEFAULT NULL,
  -- 대여 파라미터
  p_daily_price    INTEGER DEFAULT NULL,
  p_deposit        INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post     public.secondhand_posts%ROWTYPE;
  v_id       UUID;
  v_existing UUID;
  v_start    INTEGER;
  v_inc      INTEGER;
  v_daily    INTEGER;
  v_dep      INTEGER;
BEGIN
  IF p_owner IS NULL THEN
    RETURN json_build_object('ok', false, 'error', '소유자 정보가 없습니다');
  END IF;
  IF p_kind NOT IN ('auction', 'rental') THEN
    RETURN json_build_object('ok', false, 'error', '잘못된 거래방식입니다');
  END IF;

  -- post 잠금 + 소유자/타입 검증
  SELECT * INTO v_post FROM public.secondhand_posts WHERE id = p_post_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', '게시글을 찾을 수 없습니다');
  END IF;
  IF v_post.user_id <> p_owner THEN
    RETURN json_build_object('ok', false, 'error', '본인 게시글만 등록할 수 있습니다');
  END IF;
  IF v_post.listing_type <> p_kind THEN
    RETURN json_build_object('ok', false, 'error', '게시글의 거래방식이 일치하지 않습니다');
  END IF;

  -- ───── 경매 ─────
  IF p_kind = 'auction' THEN
    -- 멱등: 이미 listing 이 있으면 그 id 반환
    SELECT id INTO v_existing FROM public.auction_listings WHERE post_id = p_post_id LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN json_build_object('ok', true, 'id', v_existing, 'existing', true);
    END IF;

    v_start := GREATEST(COALESCE(p_start_price, 0), 0);
    v_inc   := GREATEST(COALESCE(p_bid_increment, 1000), 1);

    INSERT INTO public.auction_listings (
      post_id, seller_id, plaza_id,
      start_price, current_price, bid_increment, end_at
    ) VALUES (
      p_post_id, p_owner, v_post.plaza_id,
      v_start, v_start, v_inc,
      COALESCE(p_end_at, NOW() + INTERVAL '7 days')
    )
    RETURNING id INTO v_id;

    RETURN json_build_object('ok', true, 'id', v_id);

  -- ───── 대여 ─────
  ELSE
    SELECT id INTO v_existing FROM public.rental_listings WHERE post_id = p_post_id LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN json_build_object('ok', true, 'id', v_existing, 'existing', true);
    END IF;

    v_daily := GREATEST(COALESCE(p_daily_price, 0), 0);
    v_dep   := GREATEST(COALESCE(p_deposit, 0), 0);

    INSERT INTO public.rental_listings (
      post_id, owner_id, plaza_id, daily_price, deposit
    ) VALUES (
      p_post_id, p_owner, v_post.plaza_id, v_daily, v_dep
    )
    RETURNING id INTO v_id;

    RETURN json_build_object('ok', true, 'id', v_id);
  END IF;
END;
$$;

-- service_role 전용 — 서버 라우트(admin write 클라이언트)에서만 호출.
REVOKE ALL ON FUNCTION public.create_secondhand_listing(
  UUID, UUID, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, INTEGER, INTEGER
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_secondhand_listing(
  UUID, UUID, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, INTEGER, INTEGER
) TO service_role;

NOTIFY pgrst, 'reload schema';
