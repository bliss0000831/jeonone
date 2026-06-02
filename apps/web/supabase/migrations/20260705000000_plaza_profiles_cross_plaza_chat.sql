-- ============================================================================
-- plaza_profiles SELECT 정책 v2 — cross-plaza 채팅 상대 프로필 조회 허용
--
-- 기존 plaza_profiles_select 는 USING (true) 로 전체 공개였으나, 광장 격리
-- 강화에 맞춰 본인 + 같은 광장 + 활성 cross-plaza 채팅 상대로 좁힘.
--
-- (group_buying / local_food post_type 채팅방의 buyer/seller 만 상대 프로필
--  접근 가능 — 그 외 도메인은 같은 광장 멤버에만 노출)
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS plaza_profiles_select ON plaza_profiles;
DROP POLICY IF EXISTS plaza_profiles_select_v2 ON plaza_profiles;

CREATE POLICY plaza_profiles_select_v2 ON plaza_profiles FOR SELECT
USING (
  -- 본인 row 는 항상 노출
  user_id = auth.uid()
  -- 같은 광장 멤버끼리는 서로 노출
  OR EXISTS (
    SELECT 1 FROM plaza_profiles me
    WHERE me.user_id = auth.uid()
      AND me.plaza_id = plaza_profiles.plaza_id
  )
  -- cross-plaza 채팅 상대 (공구/로컬푸드 한정) 의 plaza_profiles 노출
  OR EXISTS (
    SELECT 1 FROM chat_rooms cr
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
