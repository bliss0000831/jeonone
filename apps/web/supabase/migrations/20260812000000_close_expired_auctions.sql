-- ════════════════════════════════════════════════════════════════════════════
-- 경매 마감/낙찰 자동 정산 RPC
--
-- 배경:
--   Hobby 플랜이라 서버 cron 불가 → 만료된 경매를 "정리"할 주체가 없음.
--   해결: 경매장/경매 상세 진입 시 클라이언트가 본 함수를 호출(idempotent).
--   SECURITY DEFINER 로 RLS 우회하여 모든 만료 경매를 정산.
--
-- 동작:
--   status='active' AND end_at <= now() 인 경매를
--     - status='ended', winner_id = current_bidder_id(최종 최고 입찰자) 로 마감
--     - 낙찰자/판매자에게 알림 생성 (입찰 없으면 판매자에게 유찰 알림)
--   반환: 이번 호출에서 마감 처리된 경매 수
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.close_expired_auctions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec     RECORD;
  v_title TEXT;
  v_price TEXT;
  n       INTEGER := 0;
BEGIN
  FOR rec IN
    SELECT a.id, a.seller_id, a.current_bidder_id, a.current_price, a.plaza_id, a.post_id
    FROM public.auction_listings a
    WHERE a.status = 'active' AND a.end_at <= NOW()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.auction_listings
      SET status = 'ended', winner_id = rec.current_bidder_id, updated_at = NOW()
      WHERE id = rec.id;

    SELECT title INTO v_title FROM public.secondhand_posts WHERE id = rec.post_id;
    v_title := COALESCE(v_title, '경매 물품');
    v_price := to_char(rec.current_price, 'FM999,999,999');

    IF rec.current_bidder_id IS NOT NULL THEN
      -- 낙찰자에게
      INSERT INTO public.notifications (user_id, type, title, message, link, actor_id, plaza_id)
      VALUES (rec.current_bidder_id, 'auction_won', '경매 낙찰 🎉',
              v_title || ' · 낙찰가 ' || v_price || '원',
              '/auction/' || rec.id, rec.seller_id, rec.plaza_id);
      -- 판매자에게
      INSERT INTO public.notifications (user_id, type, title, message, link, actor_id, plaza_id)
      VALUES (rec.seller_id, 'auction_sold', '경매 종료 (낙찰)',
              v_title || ' · ' || v_price || '원에 낙찰되었습니다',
              '/auction/' || rec.id, rec.current_bidder_id, rec.plaza_id);
    ELSE
      -- 입찰 없이 종료 (유찰)
      INSERT INTO public.notifications (user_id, type, title, message, link, actor_id, plaza_id)
      VALUES (rec.seller_id, 'auction_ended', '경매 종료 (유찰)',
              v_title || ' · 입찰자가 없어 종료되었습니다',
              '/auction/' || rec.id, rec.seller_id, rec.plaza_id);
    END IF;

    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_expired_auctions() TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
