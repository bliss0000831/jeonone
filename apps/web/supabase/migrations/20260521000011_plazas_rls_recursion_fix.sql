-- ============================================================================
-- plazas RLS 무한재귀 수정
--
-- 20260521000010 에서 추가한 plazas_admin_write 가 plaza_admins 를 참조하는데,
-- plaza_admins 자체 RLS 정책이 또 plaza_admins 를 참조 → 무한재귀.
-- 결과: 인증된 사용자가 plazas 를 SELECT 할 때마다 에러
--   "infinite recursion detected in policy for relation 'plaza_admins'"
-- → 허브 0/0/0, 광장 헤더 이름/로고 빈 박스, 저장 실패
--
-- 해법: SECURITY DEFINER 함수로 RLS 우회해서 권한 체크.
-- ============================================================================

BEGIN;

-- 깨진 정책 제거
DROP POLICY IF EXISTS plazas_admin_write ON plazas;
DROP POLICY IF EXISTS plazas_super_admin_write ON plazas;

-- ─── 1. SECURITY DEFINER 헬퍼 함수 ───────────────────────────────────────
-- RLS 를 우회해서 plaza_admins / profiles 를 직접 본다.
-- "이 user 가 이 plaza 에 대해 admin 권한이 있는가?"
CREATE OR REPLACE FUNCTION is_plaza_admin_for(check_plaza_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    -- legacy super admin
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'superadmin'
  ) OR EXISTS (
    -- 신규 plaza_admins (super = god mode, 그 외 = 자기 광장만)
    SELECT 1 FROM plaza_admins pa
    WHERE pa.user_id = auth.uid()
      AND (pa.role = 'super' OR pa.plaza_id = check_plaza_id)
  );
$$;

GRANT EXECUTE ON FUNCTION is_plaza_admin_for(TEXT) TO authenticated, anon;

-- ─── 2. plazas RLS 재정의 ─────────────────────────────────────────────────
-- SELECT 는 그대로 모두 허용 (plazas_select_all 그대로 둠).
-- INSERT/UPDATE/DELETE 만 admin 체크.
CREATE POLICY plazas_admin_insert ON plazas
  FOR INSERT TO authenticated
  WITH CHECK (is_plaza_admin_for(id));

CREATE POLICY plazas_admin_update ON plazas
  FOR UPDATE TO authenticated
  USING (is_plaza_admin_for(id))
  WITH CHECK (is_plaza_admin_for(id));

CREATE POLICY plazas_admin_delete ON plazas
  FOR DELETE TO authenticated
  USING (is_plaza_admin_for(id));

-- ─── 3. plaza_admins 의 자기참조 정책도 SECURITY DEFINER 함수로 교체 ─────
DROP POLICY IF EXISTS plaza_admins_select_self ON plaza_admins;

-- 이 user 가 super 인가? (plaza 무관하게 god mode)
CREATE OR REPLACE FUNCTION is_super_plaza_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'superadmin'
  ) OR EXISTS (
    SELECT 1 FROM plaza_admins pa
    WHERE pa.user_id = auth.uid()
      AND pa.role = 'super'
  );
$$;

GRANT EXECUTE ON FUNCTION is_super_plaza_admin() TO authenticated, anon;

CREATE POLICY plaza_admins_select_v2 ON plaza_admins
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_super_plaza_admin()
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
