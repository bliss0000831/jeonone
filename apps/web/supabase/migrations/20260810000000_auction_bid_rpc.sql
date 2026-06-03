-- ============================================================================
-- 전원일기 — 경매 입찰 원자적 RPC
--   최고가 검증 + 입찰 기록 + 현재가/입찰수 갱신 + 마감임박 자동연장(5분)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.place_auction_bid(p_auction UUID, p_amount INTEGER)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a   public.auction_listings%ROWTYPE;
  uid UUID := auth.uid();
  min_bid INTEGER;
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
