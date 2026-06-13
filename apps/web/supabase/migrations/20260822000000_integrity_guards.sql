-- ════════════════════════════════════════════════════════════════════════════
-- 무결성 가드 — 클라이언트 직접 UPDATE/INSERT 위변조 차단 (방어적·추가형)
--
--  #1 rental_bookings: 금액·기간·대상 불변 + 상태전이 화이트리스트.
--     RLS 만으로는 신청자/소유자가 total_amount/deposit/status 를 임의 변경 가능했음.
--     정당한 흐름(웹/모바일 대여관리)의 전이만 허용하고 그 외는 차단.
--     서비스롤(auth.uid() IS NULL: cron/관리자)은 통과.
--
--  #4 group_buying_participants: 수량 > 0 CHECK.
--     gb_join_atomic_v2 가 p_quantity 하한을 검사하지 않아 0/음수 참여로
--     정원·통계를 오염시킬 수 있었음. DB 레벨에서 음수/0 차단.
--
--  멱등(CREATE OR REPLACE / 존재검사). 적용: Supabase 대시보드 SQL Editor 에 붙여넣고 1회 Run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── #1 대여 예약 무결성 가드 ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rental_booking_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER          -- rental_listings.owner_id 조회가 RLS 에 막히지 않도록
SET search_path = public
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_owner UUID;
BEGIN
  -- 서비스롤(cron/관리자 등 auth.uid 없음)은 무제한 허용
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- 금액·기간·대상은 생성 후 변경 불가 (위변조 차단)
  IF NEW.total_amount <> OLD.total_amount
     OR NEW.deposit    <> OLD.deposit
     OR NEW.rental_id  <> OLD.rental_id
     OR NEW.renter_id  <> OLD.renter_id
     OR NEW.start_date <> OLD.start_date
     OR NEW.end_date   <> OLD.end_date THEN
    RAISE EXCEPTION '예약의 금액·기간·대상은 변경할 수 없습니다';
  END IF;

  -- 상태 전이는 역할별 허용 목록만 (웹/모바일 대여관리와 동일)
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT owner_id INTO v_owner FROM public.rental_listings WHERE id = OLD.rental_id;

    IF v_uid = v_owner THEN
      -- 소유자: requested→approved/cancelled, approved→completed/cancelled
      IF NOT (
        (OLD.status = 'requested' AND NEW.status IN ('approved','cancelled')) OR
        (OLD.status = 'approved'  AND NEW.status IN ('completed','cancelled'))
      ) THEN
        RAISE EXCEPTION '허용되지 않은 상태 변경입니다';
      END IF;
    ELSIF v_uid = OLD.renter_id THEN
      -- 신청자: requested/approved → cancelled
      IF NOT (OLD.status IN ('requested','approved') AND NEW.status = 'cancelled') THEN
        RAISE EXCEPTION '허용되지 않은 상태 변경입니다';
      END IF;
    ELSE
      RAISE EXCEPTION '예약을 변경할 권한이 없습니다';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rental_booking_guard ON public.rental_bookings;
CREATE TRIGGER trg_rental_booking_guard
  BEFORE UPDATE ON public.rental_bookings
  FOR EACH ROW EXECUTE FUNCTION public.rental_booking_guard();

-- ── #4 공동구매 참여 수량 하한 ───────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'group_buying_participants_quantity_positive'
      AND conrelid = 'public.group_buying_participants'::regclass
  ) THEN
    ALTER TABLE public.group_buying_participants
      ADD CONSTRAINT group_buying_participants_quantity_positive
      CHECK (quantity > 0);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
