-- ============================================================================
-- profiles 테이블 어드민 UPDATE 정책에 WITH CHECK 추가
--
-- 보안 audit Round 3 발견:
-- scripts/admin_rls_policy.sql 의 "Admins can update all profiles" 가
-- USING 만 있고 WITH CHECK 없음 → 어드민이 자기 role 을 superadmin 으로
-- 승격하는 등 권한 escalation 가능했음.
--
-- 해결: WITH CHECK 추가 — 어드민은 role 필드 변경 불가 (superadmin 만 가능),
-- 자기 자신의 role 은 변경 불가 (lockout 방지 + self-promotion 방지).
--
-- 호환성: plaza_admins 테이블이 아직 없는 환경 (마이그레이션 미실행) 에서도
-- 깨지지 않도록 동적으로 정책 분기.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;

DO $$
DECLARE
  has_plaza_admins BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'plaza_admins'
  ) INTO has_plaza_admins;

  IF has_plaza_admins THEN
    -- plaza_admins 가 존재하는 환경: 통합 정책
    EXECUTE $POL$
      CREATE POLICY "Admins can update all profiles" ON profiles
        FOR UPDATE
        USING (
          auth.uid() IN (
            SELECT id FROM profiles WHERE role IN ('admin', 'superadmin')
          )
          OR EXISTS (
            SELECT 1 FROM plaza_admins pa
            WHERE pa.user_id = auth.uid() AND pa.role = 'super'
          )
        )
        WITH CHECK (
          profiles.id <> auth.uid()
          AND (
            auth.uid() IN (SELECT id FROM profiles WHERE role = 'superadmin')
            OR EXISTS (
              SELECT 1 FROM plaza_admins pa
              WHERE pa.user_id = auth.uid() AND pa.role = 'super'
            )
            OR (
              auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
              AND profiles.role IS NOT DISTINCT FROM (
                SELECT role FROM profiles p2 WHERE p2.id = profiles.id
              )
            )
          )
        );
    $POL$;
    RAISE NOTICE '[migration 18] policy with plaza_admins integration created';
  ELSE
    -- plaza_admins 미존재 환경: legacy profiles.role 만 사용
    EXECUTE $POL$
      CREATE POLICY "Admins can update all profiles" ON profiles
        FOR UPDATE
        USING (
          auth.uid() IN (
            SELECT id FROM profiles WHERE role IN ('admin', 'superadmin')
          )
        )
        WITH CHECK (
          profiles.id <> auth.uid()
          AND (
            auth.uid() IN (SELECT id FROM profiles WHERE role = 'superadmin')
            OR (
              auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
              AND profiles.role IS NOT DISTINCT FROM (
                SELECT role FROM profiles p2 WHERE p2.id = profiles.id
              )
            )
          )
        );
    $POL$;
    RAISE NOTICE '[migration 18] legacy-only policy created (plaza_admins not found)';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
