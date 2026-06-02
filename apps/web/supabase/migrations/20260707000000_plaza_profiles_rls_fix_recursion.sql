-- ============================================================================
-- plaza_profiles_select_v2 재귀 fix
--
-- 이전 정책이 USING 절에서 plaza_profiles 를 다시 SELECT 하여 PostgreSQL 의
-- "infinite recursion detected in policy" 에러 발생.
--
-- 같은 광장 멤버 체크는 이미 존재하는 user_in_plaza() (SECURITY DEFINER) 로 우회.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS plaza_profiles_select_v2 ON public.plaza_profiles;

CREATE POLICY plaza_profiles_select_v2 ON public.plaza_profiles FOR SELECT
USING (
  -- 본인 row
  user_id = auth.uid()
  -- 같은 광장 멤버 (SECURITY DEFINER 함수 — RLS 우회)
  OR public.user_in_plaza(plaza_id)
  -- cross-plaza 채팅 상대 (공구/로컬푸드 한정)
  OR EXISTS (
    SELECT 1 FROM public.chat_rooms cr
    WHERE cr.post_type IN ('group_buying', 'local_food')
      AND cr.plaza_id = plaza_profiles.plaza_id
      AND (
        (cr.buyer_id = auth.uid()  AND cr.seller_id = plaza_profiles.user_id)
        OR (cr.seller_id = auth.uid() AND cr.buyer_id = plaza_profiles.user_id)
      )
  )
);

NOTIFY pgrst, 'reload schema';

COMMIT;
