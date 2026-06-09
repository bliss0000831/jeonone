-- ════════════════════════════════════════════════════════════════
-- 전원일기 — 미적용 마이그레이션 6개 통합 (대시보드 SQL Editor 1회 실행용)
-- 전부 멱등(CREATE OR REPLACE / IF EXISTS) — 재실행 안전
-- 생성 후 이 파일은 마이그레이션 폴더 밖이라 db push 중복 적용 안 됨
-- ════════════════════════════════════════════════════════════════


-- ▼▼▼ 20260814000000_reviews_source_unique.sql ▼▼▼
-- ════════════════════════════════════════════════════════════════════════════
-- 후기 중복 방지: (reviewer, source_type, source_id) 당 1건
--   기존 UNIQUE 는 property_id 기반이라 경매/대여(property_id NULL)엔 미적용.
--   source 기반 거래(auction/rental/local_food_order 등)에 부분 유니크 인덱스 추가.
-- ════════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS reviews_reviewer_source_uniq
  ON public.reviews (reviewer_id, source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
-- ▲▲▲ 20260814000000_reviews_source_unique.sql ▲▲▲


-- ▼▼▼ 20260814000000_security_integrity_critical_fixes.sql ▼▼▼
-- ============================================================================
-- CRITICAL 보안·무결성 패치 (코드리뷰 C1~C5)
--
-- 배경: "광장 격리 해제(20260729)" 이후 user_points PK 가 (user_id, plaza_id)
--       → (user_id) 로 바뀌고 plaza_id 가 NULL 이 되면서, 옛 plaza_id 를 참조하던
--       포인트 RPC 들이 조용히 실패(잔액 증발/적립 누락)하는 회귀가 발생.
--       또한 일부 SECURITY DEFINER 함수가 GRANT/REVOKE 누락으로 PUBLIC EXECUTE
--       노출되어 권한상승·포인트 무제한 발행이 가능했음. profiles 본인 UPDATE
--       정책은 WITH CHECK 가 없어 role 자기승격(superadmin)이 가능했음.
--
-- 이 마이그레이션은 모두 멱등(CREATE OR REPLACE / DROP IF EXISTS / REVOKE·GRANT)
-- 하며, 데이터 변경 없이 정책·함수 정의만 교정한다.
--
-- 적용: Supabase 대시보드 SQL Editor 에 전체 붙여넣어 실행하거나 `supabase db push`.
-- Rollback 은 각 섹션 주석 참조.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- C1. profiles 본인 UPDATE: role 자기승격 차단 (WITH CHECK 추가)
--   기존 "profiles_update_own" 는 USING 만 있고 WITH CHECK 가 없어, 본인 행의
--   role 을 'superadmin' 으로 직접 PATCH 하여 전 시스템 장악이 가능했다.
--   role 은 자기 자신이 못 바꾸도록 고정(관리자 정책 20260521000018 과 동일 패턴).
--   닉네임·아바타 등 다른 컬럼 self-update 는 그대로 허용된다.
-- Rollback:
--   DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
--   CREATE POLICY "profiles_update_own" ON public.profiles
--     FOR UPDATE USING (auth.uid() = id);
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- role 은 현재 저장값과 동일해야만 통과 → 본인이 role 변경 불가
    AND role IS NOT DISTINCT FROM (
      SELECT p2.role FROM public.profiles p2 WHERE p2.id = profiles.id
    )
  );

-- ----------------------------------------------------------------------------
-- C2. SECURITY DEFINER 포인트/평판 함수 PUBLIC EXECUTE 차단
--   increment_user_points / decrement_reputation / decrement_point_daily_counter
--   는 내부에 auth.uid() 바인딩이 없어, PUBLIC 노출 시 임의 user_id·임의 delta 로
--   포인트 무제한 발행·타인 평판 차감이 가능했다. 서버(points 서비스)는 전부
--   service_role(admin client) 로만 호출하므로 service_role 에만 EXECUTE 부여.
-- Rollback: GRANT EXECUTE ON FUNCTION ... TO authenticated;  (권장 안 함)
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.increment_user_points(UUID, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_user_points(UUID, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT) TO service_role;

REVOKE ALL ON FUNCTION public.decrement_reputation(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_reputation(UUID, INT) TO service_role;

REVOKE ALL ON FUNCTION public.decrement_point_daily_counter(UUID, TEXT, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_point_daily_counter(UUID, TEXT, DATE) TO service_role;

-- search_path 고정 (definer 함수 하이재킹 방지 — 심층방어)
ALTER FUNCTION public.increment_user_points(UUID, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT) SET search_path = public;
ALTER FUNCTION public.decrement_reputation(UUID, INT) SET search_path = public;
ALTER FUNCTION public.decrement_point_daily_counter(UUID, TEXT, DATE) SET search_path = public;

-- ----------------------------------------------------------------------------
-- C3. admin_adjust_points: PUBLIC 차단 + 깨진 plaza_id 참조 교정
--   PUBLIC 노출로 관리자 권한 없이 포인트 조작이 가능했고, 본문이 옛 PK
--   (user_id, plaza_id) 를 참조해 현재 스키마에서 동작 불가. service_role 전용으로
--   잠그고 user_points 단일키(user_id) 기준으로 재작성.
-- Rollback: 20260525010000_atomic_point_adjust.sql 의 원본 정의로 CREATE OR REPLACE.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_adjust_points(
  p_user_id UUID,
  p_plaza_id TEXT,            -- 하위호환용 파라미터(무시됨)
  p_delta BIGINT,
  p_admin_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new BIGINT;
BEGIN
  -- user_points 행 없으면 생성 (PK = user_id 단일)
  INSERT INTO user_points (user_id, available, pending, lifetime_earned, lifetime_spent, lifetime_reverted)
  VALUES (p_user_id, 0, 0, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  IF p_delta > 0 THEN
    UPDATE user_points
       SET available = available + p_delta,
           lifetime_earned = lifetime_earned + p_delta
     WHERE user_id = p_user_id
    RETURNING available INTO v_new;
  ELSE
    UPDATE user_points
       SET available = available + p_delta,
           lifetime_reverted = lifetime_reverted + abs(p_delta)
     WHERE user_id = p_user_id
       AND available + p_delta >= 0
    RETURNING available INTO v_new;

    IF v_new IS NULL THEN
      RAISE EXCEPTION 'insufficient_balance';
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'newBalance', v_new);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_points(UUID, TEXT, BIGINT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_points(UUID, TEXT, BIGINT, UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- C4. points_refund_spend: 깨진 plaza_id 조건 제거 (포인트 환불 잔액 증발 수정)
--   기존: WHERE user_id = X AND plaza_id = v_tx.plaza_id  (plaza_id 가 NULL → 0행)
--   수정: WHERE user_id = X  (user_points PK 단일키)
--   GRANT 는 기존(authenticated, service_role) 유지 — 호출 클라 무관하게 동작.
-- Rollback: 20260621000003_points_refund_spend_rpc.sql 원본 정의.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.points_refund_spend(
  p_tx_id UUID,
  p_reason TEXT
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  RETURNING user_id, amount INTO v_tx;

  IF v_tx IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'already_processed_or_not_spend');
  END IF;

  v_amount := ABS(v_tx.amount);

  -- user_points 단일키(user_id) 기준 환원
  UPDATE user_points
     SET available = available + v_amount
   WHERE user_id = v_tx.user_id;

  RETURN json_build_object('ok', true, 'refunded', v_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.points_refund_spend(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.points_refund_spend(UUID, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- C5. grant_points_atomic: ON CONFLICT (user_id, plaza_id) → (user_id)
--   user_points PK 가 (user_id) 단일이라 기존 ON CONFLICT 가 42P10 에러 → 적립 미반영.
--   단일키로 교정. GRANT 는 기존(service_role 전용) 유지.
-- Rollback: 20260625000000_points_idempotency.sql 원본 정의.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_points_atomic(
  p_user UUID,
  p_plaza TEXT,             -- 하위호환용 파라미터(무시됨)
  p_amount INT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO user_points (user_id, available, lifetime_earned)
  VALUES (p_user, p_amount, p_amount)
  ON CONFLICT (user_id) DO UPDATE
    SET available = user_points.available + EXCLUDED.available,
        lifetime_earned = user_points.lifetime_earned + EXCLUDED.lifetime_earned,
        updated_at = NOW();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_points_atomic(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_points_atomic(UUID, TEXT, INT) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
-- ▲▲▲ 20260814000000_security_integrity_critical_fixes.sql ▲▲▲


-- ▼▼▼ 20260817000000_completed_deals_aggregate.sql ▼▼▼
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
-- ▲▲▲ 20260817000000_completed_deals_aggregate.sql ▲▲▲


-- ▼▼▼ 20260818000000_messages_image_url.sql ▼▼▼
-- ============================================================================
-- messages 테이블에 image_url 컬럼 추가 — 1:1 채팅 사진 전송 기능
--
-- 농산물 상태를 사진으로 주고받는 핵심 기능. group_buying_chat_messages /
-- club_chat_messages 는 이미 image_url 을 갖고 있으나, 1:1 채팅(messages)
-- 에는 없었음.
--
-- · 사진만 보내는 메시지(content 없이 image_url 만)도 허용하기 위해
--   content NOT NULL 제약을 풀고 "content 또는 image_url 중 하나는 있어야 함"
--   CHECK 로 대체. (is_system 메시지는 예외 — 시스템 메시지 호환 유지)
-- ============================================================================

BEGIN;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url TEXT;

-- content NOT NULL 제약 해제 — 사진만 보내는 메시지 허용
ALTER TABLE messages ALTER COLUMN content DROP NOT NULL;

-- content / image_url / 시스템 메시지 중 최소 하나는 있어야 함.
-- is_system 컬럼이 있을 때만 그 분기 포함 (없으면 content/image_url 만).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'is_system'
  ) THEN
    ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_content_or_image_chk;
    ALTER TABLE messages ADD CONSTRAINT messages_content_or_image_chk
      CHECK (
        content IS NOT NULL
        OR image_url IS NOT NULL
        OR is_system = TRUE
      );
  ELSE
    ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_content_or_image_chk;
    ALTER TABLE messages ADD CONSTRAINT messages_content_or_image_chk
      CHECK (
        content IS NOT NULL
        OR image_url IS NOT NULL
      );
  END IF;
END $$;

-- PostgREST 스키마 캐시 reload (새 컬럼 즉시 노출)
NOTIFY pgrst, 'reload schema';

COMMIT;
-- ▲▲▲ 20260818000000_messages_image_url.sql ▲▲▲


-- ▼▼▼ 20260819000000_listing_create_rpc.sql ▼▼▼
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
-- ▲▲▲ 20260819000000_listing_create_rpc.sql ▲▲▲


-- ▼▼▼ 20260819000000_rental_booking_create_rpc.sql ▼▼▼
-- ════════════════════════════════════════════════════════════════════════════
-- 대여 예약 무결성 패치 (H4 기간중복 / H5 금액 클라계산 우회)
--
-- 배경:
--   기존 대여 신청은 클라이언트(웹/앱)가 rental_bookings 에 직접 INSERT 하며,
--   total_amount·deposit 을 클라가 계산해 그대로 넣었다 → 0원 등 임의 금액 우회 가능(H5).
--   또한 rental_bookings 에 기간 중복 배제 제약이 없어 같은 rental_id 에
--   겹치는 날짜로 여러 예약이 동시에 가능했다(H4 이중예약).
--
-- 해결:
--   1) H4: 활성 상태(requested/approved/in_use) 한정 EXCLUDE 제약으로 DB 레벨 차단.
--      (btree_gist 확장 필요 — rental_id 동등 비교 + daterange 겹침 비교 혼합)
--   2) H5: create_rental_booking RPC(SECURITY DEFINER) 가 입력으로 rental_id,
--      start_date, end_date 만 받고 서버에서 daily_price × 일수로 total_amount 를
--      재계산, deposit 도 listing 값을 사용. renter_id 는 auth.uid() 로 강제.
--      RPC 내부에서도 겹침을 선검사하고, 제약 위반(23P01)은 사용자 친화 메시지로 변환.
--
-- ⚠️ 기존 rental/manage(승인·거절·반납완료) 흐름은 status UPDATE 만 하므로
--    EXCLUDE 제약(활성 상태 한정)·신규 RPC 와 무관 — 영향 없음.
--    승인(approved)/사용중(in_use) 도 활성으로 간주되어, 이미 승인된 기간과
--    겹치는 신규 신청은 차단된다(의도된 동작).
--
-- 적용: Supabase 대시보드 SQL Editor 에 전체 붙여넣거나 `supabase db push`.
--       (이 파일은 라이브 미적용 상태 — 작성만 됨)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ----------------------------------------------------------------------------
-- H4. 기간 중복 배제 제약 (활성 상태 한정)
--   daterange 의 '[]' 는 양끝 포함(start_date·end_date 포함). && 는 범위 겹침.
--   WHERE 절로 활성 상태만 대상 → cancelled/returned/completed 예약은 자리를 비운다.
--   btree_gist 가 있어야 rental_id(UUID) 의 = 연산을 GiST 인덱스에 넣을 수 있다.
-- Rollback:
--   ALTER TABLE public.rental_bookings DROP CONSTRAINT IF EXISTS rental_bookings_no_overlap;
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.rental_bookings
  DROP CONSTRAINT IF EXISTS rental_bookings_no_overlap;

ALTER TABLE public.rental_bookings
  ADD CONSTRAINT rental_bookings_no_overlap
  EXCLUDE USING gist (
    rental_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  )
  WHERE (status IN ('requested', 'approved', 'in_use'));

-- ----------------------------------------------------------------------------
-- H5. 대여 신청 RPC — 서버 금액 재계산 + 기간 겹침 검사 + 소유자 알림
--   입력: p_rental(rental_listings.id), p_start, p_end (DATE)
--   서버가 신뢰하는 값만 사용: renter_id=auth.uid(), 금액=listing 기준 재계산.
--   클라가 보내는 금액/예치금은 받지 않는다.
-- Rollback: DROP FUNCTION IF EXISTS public.create_rental_booking(UUID, DATE, DATE);
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_rental_booking(
  p_rental UUID,
  p_start  DATE,
  p_end    DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l        public.rental_listings%ROWTYPE;
  uid      UUID := auth.uid();
  v_days   INTEGER;
  v_total  INTEGER;
  v_deposit INTEGER;
  v_title  TEXT;
  v_id     UUID;
BEGIN
  IF uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', '로그인이 필요합니다');
  END IF;

  -- 기본 검증: 날짜 존재 + 시작일 <= 반납일
  IF p_start IS NULL OR p_end IS NULL THEN
    RETURN json_build_object('ok', false, 'error', '대여 기간을 선택해주세요');
  END IF;
  IF p_start > p_end THEN
    RETURN json_build_object('ok', false, 'error', '반납일이 시작일보다 빠를 수 없습니다');
  END IF;

  -- listing 조회 (행 잠금: 동시 신청 시 겹침검사·INSERT 일관성 확보)
  SELECT * INTO l FROM public.rental_listings WHERE id = p_rental FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', '대여 상품을 찾을 수 없습니다');
  END IF;

  -- 일수 = 양끝 포함(start~end). 클라이언트 days 계산식과 동일.
  v_days := (p_end - p_start) + 1;
  IF v_days <= 0 THEN
    RETURN json_build_object('ok', false, 'error', '대여 기간을 올바르게 입력해주세요');
  END IF;

  -- 서버 재계산 (클라가 보낸 금액 신뢰 금지)
  v_total   := v_days * COALESCE(l.daily_price, 0);
  v_deposit := COALESCE(l.deposit, 0);

  -- 겹침 선검사 → 친화 메시지 (제약 위반보다 먼저 명확히 반환)
  IF EXISTS (
    SELECT 1 FROM public.rental_bookings b
    WHERE b.rental_id = p_rental
      AND b.status IN ('requested', 'approved', 'in_use')
      AND daterange(b.start_date, b.end_date, '[]')
          && daterange(p_start, p_end, '[]')
  ) THEN
    RETURN json_build_object('ok', false, 'error', '이미 예약된 날짜예요. 다른 기간을 선택해주세요');
  END IF;

  -- 예약 생성 (금액·예치금·renter 모두 서버 권위값)
  INSERT INTO public.rental_bookings
    (rental_id, renter_id, start_date, end_date, total_amount, deposit, status)
  VALUES
    (p_rental, uid, p_start, p_end, v_total, v_deposit, 'requested')
  RETURNING id INTO v_id;

  -- 소유자에게 알림 (본인 물건 신청은 알림 생략)
  IF l.owner_id IS NOT NULL AND l.owner_id <> uid THEN
    SELECT title INTO v_title FROM public.secondhand_posts WHERE id = l.post_id;
    v_title := COALESCE(v_title, '농기구');
    INSERT INTO public.notifications (user_id, type, title, message, link, actor_id, plaza_id)
    VALUES (
      l.owner_id, 'rental_request', '새 대여 신청',
      v_title || ' · ' || to_char(p_start, 'YYYY-MM-DD') || '~' || to_char(p_end, 'YYYY-MM-DD')
        || ' (' || v_days || '일)',
      '/rental/manage', uid, l.plaza_id
    );
  END IF;

  RETURN json_build_object('ok', true, 'id', v_id, 'total_amount', v_total, 'deposit', v_deposit, 'days', v_days);

EXCEPTION
  -- EXCLUDE 제약 위반(동시성 레이스로 선검사를 통과한 경우의 최종 방어선)
  WHEN exclusion_violation THEN
    RETURN json_build_object('ok', false, 'error', '이미 예약된 날짜예요. 다른 기간을 선택해주세요');
END;
$$;

REVOKE ALL ON FUNCTION public.create_rental_booking(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_rental_booking(UUID, DATE, DATE) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
-- ▲▲▲ 20260819000000_rental_booking_create_rpc.sql ▲▲▲

