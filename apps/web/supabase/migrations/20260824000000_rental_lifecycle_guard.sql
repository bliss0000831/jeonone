-- ════════════════════════════════════════════════════════════════════════════
-- 대여 예약 라이프사이클 확장 — rental_booking_guard 트리거 갱신
--
--  기존(20260822) 가드는 approved→completed 만 허용했으나, 실제 의도된 흐름
--  (requested→approved→in_use→returned)을 지원하도록 전이 화이트리스트를 확장한다.
--  · in_use(대여중)/returned(반납됨)는 이미 백엔드가 사용 중:
--      - 예약 겹침 방지: 활성 상태 = requested/approved/in_use (create_rental_booking)
--      - 후기 자격: returned/completed (api/reviews)
--  금액·기간·대상 불변 + 서비스롤 통과는 그대로 유지.
--
--  ⚠ UI(웹·모바일 대여관리)의 버튼 전이와 1:1 일치해야 함. 함께 배포됨.
--  멱등(CREATE OR REPLACE). 적용: 대시보드 SQL Editor 1회 Run.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rental_booking_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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

  -- 상태 전이는 역할별 허용 목록만 (웹/모바일 대여관리 UI 와 동일)
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT owner_id INTO v_owner FROM public.rental_listings WHERE id = OLD.rental_id;

    IF v_uid = v_owner THEN
      -- 소유자: 신청 승인/거절 → 대여 시작 → 반납 확인 (+ 취소, 레거시 완료)
      IF NOT (
        (OLD.status = 'requested' AND NEW.status IN ('approved','cancelled')) OR
        (OLD.status = 'approved'  AND NEW.status IN ('in_use','cancelled','completed')) OR
        (OLD.status = 'in_use'    AND NEW.status IN ('returned','cancelled'))
      ) THEN
        RAISE EXCEPTION '허용되지 않은 상태 변경입니다';
      END IF;
    ELSIF v_uid = OLD.renter_id THEN
      -- 신청자: 신청/승인 단계에서만 취소 (대여 시작 후엔 불가)
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

-- 트리거는 20260822 에서 이미 생성됨. 함수만 교체되면 즉시 반영(재생성 불필요).
-- 안전을 위해 존재 보장:
DROP TRIGGER IF EXISTS trg_rental_booking_guard ON public.rental_bookings;
CREATE TRIGGER trg_rental_booking_guard
  BEFORE UPDATE ON public.rental_bookings
  FOR EACH ROW EXECUTE FUNCTION public.rental_booking_guard();

NOTIFY pgrst, 'reload schema';
