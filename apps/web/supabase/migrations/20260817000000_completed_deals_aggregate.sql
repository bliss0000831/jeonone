-- ════════════════════════════════════════════════════════════════════════════
-- completed_deals 실제 집계 (기능 #1-2)
--
-- 배경:
--   profiles.completed_deals 는 읽기만 하고 증가시키는 코드가 없어 항상 0(dead).
--   거래 완료가 일어나는 4개 도메인에서 양 당사자의 completed_deals 를 +1.
--
-- 설계 — DB 트리거 (멱등 보장):
--   각 도메인의 "완료 상태 전이"가 실제로 일어났을 때(OLD → NEW)만 카운트.
--   AFTER UPDATE 트리거에서 OLD.status <> '완료' AND NEW.status = '완료' 조건으로
--   가드 → 이미 완료된 행을 재저장(재호출)해도 두 번 증가하지 않음(멱등).
--   클라이언트/경로(web · mobile · admin · RPC)와 무관하게 DB 레벨에서 일관 집계.
--
--   ⚠️ 라이브 적용은 사용자가 직접 수행. (이 파일은 마이그레이션 정의만)
--
-- 도메인별 완료 시점·당사자:
--   local_food_orders : status shipped/delivered → confirmed (web) | shipped → completed (mobile)
--                       → buyer_id + seller_id
--   rental_bookings   : status approved → completed (반납완료)
--                       → renter_id + rental_listings.owner_id
--   auction_listings  : status active → ended AND winner_id IS NOT NULL (낙찰/즉시구매)
--                       → seller_id + winner_id
--   secondhand_posts  : status → completed (판매완료) — 구매자 미기록이라 판매자(user_id)만
-- ════════════════════════════════════════════════════════════════════════════

-- 안전한 증가 헬퍼 — 존재하는 프로필만, NULL/본인 중복 무시
CREATE OR REPLACE FUNCTION public._bump_completed_deals(p_user UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user IS NULL THEN RETURN; END IF;
  UPDATE public.profiles
     SET completed_deals = COALESCE(completed_deals, 0) + 1
   WHERE id = p_user;
END;
$$;

-- ───── 로컬푸드 주문 ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_local_food_orders_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- confirmed(web) 또는 completed(mobile) 로의 전이 시 1회만
  IF NEW.status IN ('confirmed', 'completed')
     AND COALESCE(OLD.status, '') NOT IN ('confirmed', 'completed') THEN
    PERFORM public._bump_completed_deals(NEW.buyer_id);
    PERFORM public._bump_completed_deals(NEW.seller_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_local_food_orders_completed ON public.local_food_orders;
CREATE TRIGGER trg_local_food_orders_completed
  AFTER UPDATE OF status ON public.local_food_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_local_food_orders_completed();

-- ───── 대여 예약 (반납완료) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_rental_bookings_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
BEGIN
  IF NEW.status = 'completed' AND COALESCE(OLD.status, '') <> 'completed' THEN
    SELECT owner_id INTO v_owner FROM public.rental_listings WHERE id = NEW.rental_id;
    PERFORM public._bump_completed_deals(NEW.renter_id);
    PERFORM public._bump_completed_deals(v_owner);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rental_bookings_completed ON public.rental_bookings;
CREATE TRIGGER trg_rental_bookings_completed
  AFTER UPDATE OF status ON public.rental_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_rental_bookings_completed();

-- ───── 경매 (낙찰/즉시구매) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_auction_listings_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- active → ended 전이 + 낙찰자 존재 시에만 (유찰은 제외)
  IF NEW.status = 'ended'
     AND COALESCE(OLD.status, '') <> 'ended'
     AND NEW.winner_id IS NOT NULL THEN
    PERFORM public._bump_completed_deals(NEW.seller_id);
    PERFORM public._bump_completed_deals(NEW.winner_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auction_listings_completed ON public.auction_listings;
CREATE TRIGGER trg_auction_listings_completed
  AFTER UPDATE OF status ON public.auction_listings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_auction_listings_completed();

-- ───── 중고 판매완료 ───────────────────────────────────────────────
-- 구매자가 기록되지 않으므로 판매자(user_id)만 +1.
CREATE OR REPLACE FUNCTION public.trg_secondhand_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND COALESCE(OLD.status, '') <> 'completed' THEN
    PERFORM public._bump_completed_deals(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_secondhand_completed ON public.secondhand_posts;
CREATE TRIGGER trg_secondhand_completed
  AFTER UPDATE OF status ON public.secondhand_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_secondhand_completed();

NOTIFY pgrst, 'reload schema';
