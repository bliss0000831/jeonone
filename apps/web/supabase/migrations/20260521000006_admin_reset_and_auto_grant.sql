-- ============================================================================
-- 모든 admin 권한 리셋 + ikdohyeon@gmail.com 만 슈퍼관리자로 등록
-- + 신규 광장 INSERT 시 자동으로 슈퍼관리자에게 권한 부여하는 트리거
--
-- 사전조건: ikdohyeon@gmail.com 계정이 auth.users 에 이미 존재해야 함.
--          (없으면 chuncheon.gwangjang.app/auth/sign-up 에서 먼저 가입)
-- ============================================================================

BEGIN;

-- ─── 1. 기존 admin 권한 전부 제거 ────────────────────────────────────────
TRUNCATE plaza_admins;
UPDATE profiles SET role = 'user' WHERE role IN ('admin', 'superadmin');

-- ─── 2. ikdohyeon@gmail.com 슈퍼관리자 등록 ──────────────────────────────
DO $$
DECLARE
  target_uid UUID;
  target_email CONSTANT TEXT := 'ikdohyeon@gmail.com';
BEGIN
  SELECT id INTO target_uid FROM auth.users WHERE email = target_email LIMIT 1;

  IF target_uid IS NULL THEN
    RAISE EXCEPTION
      '슈퍼관리자 대상 계정 (% ) 이 auth.users 에 없습니다. 먼저 chuncheon.gwangjang.app/auth/sign-up 에서 가입한 뒤 다시 실행하세요.',
      target_email;
  END IF;

  -- 레거시 호환: profiles.role 도 superadmin 으로
  UPDATE profiles SET role = 'superadmin' WHERE id = target_uid;

  -- 모든 광장에 super 부여
  INSERT INTO plaza_admins (user_id, plaza_id, role)
  SELECT target_uid, id, 'super' FROM plazas
  ON CONFLICT (user_id, plaza_id) DO UPDATE SET role = 'super';

  -- 광장별 가입(plaza_profiles) 도 모두 등록 — 슈퍼관리자가 일반 기능까지 사용 가능하게
  INSERT INTO plaza_profiles (user_id, plaza_id, nickname, is_active)
  SELECT target_uid, id, '슈퍼관리자', true FROM plazas
  ON CONFLICT (user_id, plaza_id) DO UPDATE SET is_active = true;

  RAISE NOTICE '슈퍼관리자 등록 완료: % (user_id=%)', target_email, target_uid;
END $$;

-- ─── 3. 신규 광장 자동 권한 부여 트리거 ──────────────────────────────────
-- 새 plaza row 가 생기면 모든 슈퍼관리자에게 자동으로 super 권한 부여 + plaza_profiles 등록
CREATE OR REPLACE FUNCTION grant_super_admins_to_new_plaza()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- super admin 들에게 새 광장 권한 부여
  INSERT INTO plaza_admins (user_id, plaza_id, role)
  SELECT DISTINCT user_id, NEW.id, 'super'
  FROM plaza_admins
  WHERE role = 'super'
  ON CONFLICT (user_id, plaza_id) DO NOTHING;

  -- super admin 들 plaza_profiles 도 자동 가입 처리
  INSERT INTO plaza_profiles (user_id, plaza_id, nickname, is_active)
  SELECT DISTINCT pa.user_id, NEW.id, COALESCE(p.nickname, '슈퍼관리자'), true
  FROM plaza_admins pa
  LEFT JOIN profiles p ON p.id = pa.user_id
  WHERE pa.role = 'super'
  ON CONFLICT (user_id, plaza_id) DO NOTHING;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS auto_grant_super_on_plaza_insert ON plazas;
CREATE TRIGGER auto_grant_super_on_plaza_insert
AFTER INSERT ON plazas
FOR EACH ROW EXECUTE FUNCTION grant_super_admins_to_new_plaza();

COMMIT;

-- 검증 쿼리 (실행 후 결과 확인용)
-- SELECT count(*) FROM plaza_admins WHERE role='super';     -- 17 (광장 17개)
-- SELECT count(*) FROM plaza_admins WHERE role!='super';    -- 0
-- SELECT count(*) FROM profiles WHERE role IN ('admin','superadmin');  -- 1
