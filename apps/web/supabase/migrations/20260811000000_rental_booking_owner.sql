-- ════════════════════════════════════════════════════════════════════════════
-- 대여 예약 관리: 소유자(농기구 주인) 접근 정책
--
-- 문제:
--   기존 rental_bookings RLS 는 renter_id = auth.uid() 인 신청자만 허용 →
--   농기구 소유자가 자기 물건의 대여 신청을 조회/승인할 수 없음 (죽은 루프).
--
-- 해결:
--   rental_listings.owner_id = auth.uid() 인 소유자가 해당 listing 의
--   예약을 SELECT / UPDATE(승인·거절·반납처리) 할 수 있도록 정책 추가.
--   (RLS 정책은 OR 결합되므로 기존 신청자 정책과 함께 동작)
-- ════════════════════════════════════════════════════════════════════════════

-- 소유자: 자기 listing 의 예약 조회
DROP POLICY IF EXISTS rental_bookings_owner_read ON public.rental_bookings;
CREATE POLICY rental_bookings_owner_read ON public.rental_bookings
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rental_listings rl
    WHERE rl.id = rental_bookings.rental_id
      AND rl.owner_id = auth.uid()
  ));

-- 소유자: 예약 상태 변경(승인/거절/반납)
DROP POLICY IF EXISTS rental_bookings_owner_update ON public.rental_bookings;
CREATE POLICY rental_bookings_owner_update ON public.rental_bookings
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rental_listings rl
    WHERE rl.id = rental_bookings.rental_id
      AND rl.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.rental_listings rl
    WHERE rl.id = rental_bookings.rental_id
      AND rl.owner_id = auth.uid()
  ));

NOTIFY pgrst, 'reload schema';
