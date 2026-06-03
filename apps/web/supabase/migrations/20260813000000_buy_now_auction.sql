-- ════════════════════════════════════════════════════════════════════════════
-- 경매 즉시구매(buy-now) RPC
--   buy_now_price 가 설정된 경매를 즉시 낙찰 처리.
--   원자적: 잠금 → 검증 → 입찰기록 → 즉시 종료(winner=구매자) → 판매자 알림
-- ════════════════════════════════════════════════════════════════════════════

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
BEGIN
  IF uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', '로그인이 필요합니다');
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

  -- 판매자에게 즉시구매 알림
  INSERT INTO public.notifications (user_id, type, title, message, link, actor_id, plaza_id)
  VALUES (a.seller_id, 'auction_sold', '경매 즉시구매 완료',
          v_title || ' · ' || to_char(a.buy_now_price, 'FM999,999,999') || '원에 즉시구매되었습니다',
          '/auction/' || a.id, uid, a.plaza_id);

  RETURN json_build_object('ok', true, 'price', a.buy_now_price);
END;
$$;

GRANT EXECUTE ON FUNCTION public.buy_now_auction(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
