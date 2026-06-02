-- ============================================================================
-- plaza_admins_super_write 무한재귀 수정
--
-- 20260521000000 의 plaza_admins_super_write (FOR ALL) 가 USING/WITH CHECK 에서
-- plaza_admins 를 직접 SELECT 함 → SELECT 시 자기 자신의 RLS 재평가로 재귀.
--
-- 증상: profiles UPDATE 시 admin 정책이 plaza_admins 를 조회하다가
--       "infinite recursion detected in policy for relation 'plaza_admins'" 으로 500.
--
-- 해법: 기존 SECURITY DEFINER 함수 is_super_plaza_admin() 으로 RLS 우회.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS plaza_admins_super_write ON plaza_admins;

CREATE POLICY plaza_admins_super_write ON plaza_admins
  FOR ALL TO authenticated
  USING (is_super_plaza_admin())
  WITH CHECK (is_super_plaza_admin());

NOTIFY pgrst, 'reload schema';

COMMIT;
