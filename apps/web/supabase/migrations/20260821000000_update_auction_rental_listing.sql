-- ════════════════════════════════════════════════════════════════════════════
-- 경매/대여 거래조건 수정 RPC
--   소유자(또는 관리자)만, 입찰 없는 경매만 수정 허용 → 기존 입찰/예약 무결성 보호.
--   · 경매: bid_count = 0 AND status = 'active' 일 때만. 시작가 변경 시 current_price
--           동기화, 입찰단위 자동 재산정(시작가*5%), 기간(일) → end_at = now + days.
--   · 대여: 일 대여료/보증금 수정. 기존 예약은 booking 시점에 total_amount/deposit 을
--           스냅샷으로 저장하므로(create_rental_booking) 과거 예약에 영향 없음.
--
--   SECURITY DEFINER 로 RLS 우회하되 auth.uid() / 소유자·관리자 / 상태 를 명시 검증.
--   멱등(CREATE OR REPLACE). 적용: Supabase 대시보드 SQL Editor 에 붙여넣고 1회 Run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 경매 수정 ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_auction_listing(
  p_post_id       UUID,
  p_start_price   INTEGER,
  p_buy_now_price INTEGER,
  p_days          INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a      public.auction_listings%ROWTYPE;
  uid    UUID := auth.uid();
  v_inc  INTEGER;
  v_days INTEGER;
BEGIN
  IF uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', '로그인이 필요합니다');
  END IF;

  SELECT * INTO a FROM public.auction_listings WHERE post_id = p_post_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', '경매를 찾을 수 없습니다');
  END IF;
  IF a.seller_id <> uid AND NOT public.is_admin_for_plaza(a.plaza_id) THEN
    RETURN json_build_object('ok', false, 'error', '수정 권한이 없습니다');
  END IF;
  IF a.status <> 'active' THEN
    RETURN json_build_object('ok', false, 'error', '종료된 경매는 수정할 수 없습니다');
  END IF;
  IF a.bid_count > 0 THEN
    RETURN json_build_object('ok', false, 'error', '이미 입찰이 있어 거래 조건을 수정할 수 없습니다');
  END IF;
  IF p_start_price IS NULL OR p_start_price <= 0 THEN
    RETURN json_build_object('ok', false, 'error', '시작가를 입력해주세요');
  END IF;
  IF p_buy_now_price IS NOT NULL AND p_buy_now_price > 0 AND p_buy_now_price < p_start_price THEN
    RETURN json_build_object('ok', false, 'error', '즉시구매가는 시작가보다 높아야 합니다');
  END IF;

  v_days := GREATEST(1, COALESCE(p_days, 7));
  v_inc  := GREATEST(1000, ROUND((p_start_price * 0.05) / 1000) * 1000);

  UPDATE public.auction_listings SET
    start_price   = p_start_price,
    current_price = p_start_price,
    buy_now_price = CASE WHEN p_buy_now_price IS NOT NULL AND p_buy_now_price > 0 THEN p_buy_now_price ELSE NULL END,
    bid_increment = v_inc,
    end_at        = NOW() + (v_days || ' days')::INTERVAL,
    updated_at    = NOW()
  WHERE id = a.id;

  RETURN json_build_object('ok', true, 'bid_increment', v_inc);
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_auction_listing(UUID, INTEGER, INTEGER, INTEGER) TO authenticated;

-- ── 대여 수정 ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_rental_listing(
  p_post_id     UUID,
  p_daily_price INTEGER,
  p_deposit     INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r   public.rental_listings%ROWTYPE;
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', '로그인이 필요합니다');
  END IF;

  SELECT * INTO r FROM public.rental_listings WHERE post_id = p_post_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', '대여 상품을 찾을 수 없습니다');
  END IF;
  IF r.owner_id <> uid AND NOT public.is_admin_for_plaza(r.plaza_id) THEN
    RETURN json_build_object('ok', false, 'error', '수정 권한이 없습니다');
  END IF;
  IF p_daily_price IS NULL OR p_daily_price <= 0 THEN
    RETURN json_build_object('ok', false, 'error', '일 대여료를 입력해주세요');
  END IF;
  IF p_deposit IS NULL OR p_deposit < 0 THEN
    RETURN json_build_object('ok', false, 'error', '보증금을 올바르게 입력해주세요');
  END IF;

  UPDATE public.rental_listings SET
    daily_price = p_daily_price,
    deposit     = p_deposit,
    updated_at  = NOW()
  WHERE id = r.id;

  RETURN json_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_rental_listing(UUID, INTEGER, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
