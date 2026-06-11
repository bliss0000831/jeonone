-- ════════════════════════════════════════════════════════════════════════════
-- 경매 노쇼(거래 불이행) 방지 — 결제/예치금 없이 신뢰로 운영
--
-- 방식(2안): 입찰 시 돈을 받지 않되, 낙찰 후 판매자가 거래 결과를 기록.
--   - 거래완료: 정상 종료
--   - 거래 불이행(노쇼): 낙찰자가 잠수/약속 불이행 → 누적 카운트 + 입찰 제한
--     누적 1회 = 경고만, 2회 = 7일 입찰 제한, 3회 이상 = 30일 입찰 제한
--   제한 중에는 place_auction_bid / buy_now_auction 이 거부.
--
-- 전부 멱등(IF NOT EXISTS / CREATE OR REPLACE) — 재실행 안전.
-- 적용: Supabase 대시보드 SQL Editor 에 붙여넣고 1회 Run.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) profiles: 노쇼 누적 + 입찰 제한 기한
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auction_no_show_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auction_blocked_until TIMESTAMPTZ;

-- 2) auction_listings: 낙찰 후 거래 결과
ALTER TABLE public.auction_listings
  ADD COLUMN IF NOT EXISTS deal_status    TEXT NOT NULL DEFAULT 'pending',  -- pending | completed | no_show
  ADD COLUMN IF NOT EXISTS deal_marked_at TIMESTAMPTZ;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) 판매자가 낙찰 후 거래 결과 기록 (거래완료 / 불이행)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_auction_deal(p_auction UUID, p_status TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a       public.auction_listings%ROWTYPE;
  uid     UUID := auth.uid();
  v_count INTEGER;
  v_days  INTEGER;
  v_title TEXT;
BEGIN
  IF uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', '로그인이 필요합니다');
  END IF;
  IF p_status NOT IN ('completed', 'no_show') THEN
    RETURN json_build_object('ok', false, 'error', '잘못된 요청입니다');
  END IF;

  SELECT * INTO a FROM public.auction_listings WHERE id = p_auction FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', '경매를 찾을 수 없습니다');
  END IF;
  IF a.seller_id <> uid THEN
    RETURN json_build_object('ok', false, 'error', '판매자만 거래 결과를 기록할 수 있습니다');
  END IF;
  IF a.status <> 'ended' OR a.winner_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', '낙찰된 경매만 기록할 수 있습니다');
  END IF;
  IF a.deal_status <> 'pending' THEN
    RETURN json_build_object('ok', false, 'error', '이미 거래 결과가 기록되었습니다');
  END IF;

  UPDATE public.auction_listings
    SET deal_status = p_status, deal_marked_at = NOW(), updated_at = NOW()
    WHERE id = p_auction;

  SELECT title INTO v_title FROM public.secondhand_posts WHERE id = a.post_id;
  v_title := COALESCE(v_title, '경매 물품');

  IF p_status = 'no_show' THEN
    UPDATE public.profiles
      SET auction_no_show_count = auction_no_show_count + 1
      WHERE id = a.winner_id
      RETURNING auction_no_show_count INTO v_count;

    -- 누적 1회=경고, 2회=7일, 3회 이상=30일
    v_days := CASE WHEN v_count <= 1 THEN 0 WHEN v_count = 2 THEN 7 ELSE 30 END;

    IF v_days > 0 THEN
      UPDATE public.profiles
        SET auction_blocked_until = GREATEST(COALESCE(auction_blocked_until, NOW()), NOW() + (v_days || ' days')::INTERVAL)
        WHERE id = a.winner_id;
    END IF;

    -- 낙찰자에게 경고/제한 알림
    INSERT INTO public.notifications (user_id, type, title, message, link, actor_id, plaza_id)
    VALUES (
      a.winner_id, 'auction_no_show',
      CASE WHEN v_days > 0 THEN '거래 불이행 신고 — 입찰 제한' ELSE '거래 불이행 신고 — 경고' END,
      v_title || ' · ' || CASE WHEN v_days > 0
        THEN '거래 불이행이 누적되어 ' || v_days || '일간 입찰이 제한됩니다'
        ELSE '다음에 또 불이행하면 입찰이 제한됩니다' END,
      '/auction/' || a.id, a.seller_id, a.plaza_id
    );

    RETURN json_build_object('ok', true, 'no_show_count', v_count, 'blocked_days', v_days);
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_auction_deal(UUID, TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) 입찰 RPC — 제한 검사 추가 (기존 로직 동일 + 맨 앞 차단 체크)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.place_auction_bid(p_auction UUID, p_amount INTEGER)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a       public.auction_listings%ROWTYPE;
  uid     UUID := auth.uid();
  min_bid INTEGER;
  v_until TIMESTAMPTZ;
BEGIN
  IF uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', '로그인이 필요합니다');
  END IF;

  -- 노쇼 누적으로 입찰 제한 중인지 확인
  SELECT auction_blocked_until INTO v_until FROM public.profiles WHERE id = uid;
  IF v_until IS NOT NULL AND v_until > NOW() THEN
    RETURN json_build_object('ok', false,
      'error', '거래 불이행(노쇼)이 누적되어 ' || to_char(v_until, 'YYYY-MM-DD') || '까지 입찰이 제한됩니다');
  END IF;

  SELECT * INTO a FROM public.auction_listings WHERE id = p_auction FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', '경매를 찾을 수 없습니다');
  END IF;
  IF a.status <> 'active' OR a.end_at <= NOW() THEN
    RETURN json_build_object('ok', false, 'error', '종료된 경매입니다');
  END IF;
  IF a.seller_id = uid THEN
    RETURN json_build_object('ok', false, 'error', '본인 경매에는 입찰할 수 없습니다');
  END IF;

  min_bid := GREATEST(a.start_price, a.current_price + a.bid_increment);
  IF p_amount < min_bid THEN
    RETURN json_build_object('ok', false, 'error', '최소 입찰가는 ' || min_bid || '원 입니다');
  END IF;

  INSERT INTO public.auction_bids(auction_id, bidder_id, amount)
  VALUES (p_auction, uid, p_amount);

  UPDATE public.auction_listings
  SET current_price     = p_amount,
      current_bidder_id = uid,
      bid_count         = bid_count + 1,
      end_at            = CASE WHEN auto_extend AND end_at - NOW() < INTERVAL '5 minutes'
                               THEN NOW() + INTERVAL '5 minutes' ELSE end_at END,
      updated_at        = NOW()
  WHERE id = p_auction;

  RETURN json_build_object('ok', true, 'current_price', p_amount);
END;
$$;
GRANT EXECUTE ON FUNCTION public.place_auction_bid(UUID, INTEGER) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5) 즉시구매 RPC — 동일하게 제한 검사 추가
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.buy_now_auction(p_auction UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a       public.auction_listings%ROWTYPE;
  uid     UUID := auth.uid();
  v_title TEXT;
  v_until TIMESTAMPTZ;
BEGIN
  IF uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', '로그인이 필요합니다');
  END IF;

  SELECT auction_blocked_until INTO v_until FROM public.profiles WHERE id = uid;
  IF v_until IS NOT NULL AND v_until > NOW() THEN
    RETURN json_build_object('ok', false,
      'error', '거래 불이행(노쇼)이 누적되어 ' || to_char(v_until, 'YYYY-MM-DD') || '까지 구매가 제한됩니다');
  END IF;

  SELECT * INTO a FROM public.auction_listings WHERE id = p_auction FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', '경매를 찾을 수 없습니다');
  END IF;
  IF a.status <> 'active' OR a.end_at <= NOW() THEN
    RETURN json_build_object('ok', false, 'error', '종료된 경매입니다');
  END IF;
  IF a.buy_now_price IS NULL THEN
    RETURN json_build_object('ok', false, 'error', '즉시구매가 불가한 경매입니다');
  END IF;
  IF a.seller_id = uid THEN
    RETURN json_build_object('ok', false, 'error', '본인 경매는 구매할 수 없습니다');
  END IF;

  INSERT INTO public.auction_bids(auction_id, bidder_id, amount)
  VALUES (p_auction, uid, a.buy_now_price);

  UPDATE public.auction_listings
  SET current_price     = a.buy_now_price,
      current_bidder_id = uid,
      winner_id         = uid,
      bid_count         = bid_count + 1,
      status            = 'ended',
      updated_at        = NOW()
  WHERE id = p_auction;

  SELECT title INTO v_title FROM public.secondhand_posts WHERE id = a.post_id;
  v_title := COALESCE(v_title, '경매 물품');

  INSERT INTO public.notifications (user_id, type, title, message, link, actor_id, plaza_id)
  VALUES (a.seller_id, 'auction_sold', '경매 즉시구매 완료',
          v_title || ' · ' || to_char(a.buy_now_price, 'FM999,999,999') || '원에 즉시구매되었습니다',
          '/auction/' || a.id, uid, a.plaza_id);

  RETURN json_build_object('ok', true, 'price', a.buy_now_price);
END;
$$;
GRANT EXECUTE ON FUNCTION public.buy_now_auction(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
