-- ============================================================================
-- reviews 테이블 RLS 강화
--
-- 배경: API 라우트(/api/reviews)에서 거래 검증을 하지만, 누구든 Supabase
--       client 로 직접 INSERT 시 검증을 우회할 수 있음. 최소한의 RLS 가드:
--
--   - SELECT: 누구나 (공개 후기)
--   - INSERT: 본인이 reviewer 인 경우만, 본인에게 후기 X
--   - UPDATE: 본인 후기 + 7일 이내 (수정 가능 기간 제한)
--   - DELETE: 본인 후기만 (관리자 처리는 service-role 사용)
--
-- 거래 검증(주문 상태/소유권)은 여전히 라우트 책임 — RLS 만으로는 표현
-- 불가하므로 라우트에서 service_role 또는 추가 RPC 로 처리.
--
-- Rollback:
--   DROP POLICY IF EXISTS reviews_select_all ON public.reviews;
--   DROP POLICY IF EXISTS reviews_insert_own ON public.reviews;
--   DROP POLICY IF EXISTS reviews_update_own ON public.reviews;
--   DROP POLICY IF EXISTS reviews_delete_own ON public.reviews;
-- ============================================================================

BEGIN;

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- 누구나 조회 (공개)
DROP POLICY IF EXISTS reviews_select_all ON public.reviews;
CREATE POLICY reviews_select_all ON public.reviews
  FOR SELECT
  USING (true);

-- 본인 = reviewer, 본인에게 후기 X
DROP POLICY IF EXISTS reviews_insert_own ON public.reviews;
CREATE POLICY reviews_insert_own ON public.reviews
  FOR INSERT
  WITH CHECK (
    auth.uid() = reviewer_id
    AND reviewer_id <> reviewed_user_id
  );

-- 7일 이내 본인 후기만 수정
DROP POLICY IF EXISTS reviews_update_own ON public.reviews;
CREATE POLICY reviews_update_own ON public.reviews
  FOR UPDATE
  USING (
    auth.uid() = reviewer_id
    AND created_at > now() - interval '7 days'
  )
  WITH CHECK (
    auth.uid() = reviewer_id
    AND reviewer_id <> reviewed_user_id
  );

-- 본인 후기만 삭제 (관리자는 service-role)
DROP POLICY IF EXISTS reviews_delete_own ON public.reviews;
CREATE POLICY reviews_delete_own ON public.reviews
  FOR DELETE
  USING (auth.uid() = reviewer_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
