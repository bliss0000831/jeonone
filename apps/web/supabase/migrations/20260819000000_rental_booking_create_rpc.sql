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
