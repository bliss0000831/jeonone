-- 관리자가 다른 사용자의 프로필을 수정/삭제할 수 있도록 RLS 정책 추가

-- 기존 정책 삭제 (이미 있을 경우)
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON profiles;

-- 관리자가 모든 프로필 수정 가능
CREATE POLICY "Admins can update all profiles" ON profiles
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role IN ('admin', 'superadmin')
    )
  );

-- 관리자가 프로필 삭제 가능 (자기 자신 제외)
CREATE POLICY "Admins can delete profiles" ON profiles
  FOR DELETE USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role IN ('admin', 'superadmin')
    )
    AND auth.uid() != id
  );
