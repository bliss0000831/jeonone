-- ============================================================================
-- plazas RLS — 광장 로고/테마/이름 변경이 silent fail 되던 버그 수정
--
-- 기존 정책은 profiles.role = 'superadmin' 만 허용했음.
-- 현재 시스템은 plaza_admins 기반으로 권한을 관리하므로:
--   - plaza_admins.role = 'super'         → 모든 광장 변경 가능
--   - plaza_admins.role IN ('admin','moderator','super')  AND plaza_id 일치
--                                          → 자기 광장만 변경 가능
--   - profiles.role = 'superadmin' (legacy) → 모든 광장 변경 가능
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS plazas_super_admin_write ON plazas;
DROP POLICY IF EXISTS plazas_plaza_admin_write ON plazas;

CREATE POLICY plazas_admin_write ON plazas
  FOR ALL TO authenticated
  USING (
    -- legacy 슈퍼관리자
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'superadmin'
    )
    OR
    -- 신규: 슈퍼 권한 플라자 어드민 또는 해당 광장 어드민
    EXISTS (
      SELECT 1 FROM plaza_admins pa
      WHERE pa.user_id = auth.uid()
        AND (pa.role = 'super' OR pa.plaza_id = plazas.id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'superadmin'
    )
    OR
    EXISTS (
      SELECT 1 FROM plaza_admins pa
      WHERE pa.user_id = auth.uid()
        AND (pa.role = 'super' OR pa.plaza_id = plazas.id)
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
