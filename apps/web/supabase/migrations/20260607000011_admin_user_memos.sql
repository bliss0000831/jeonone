-- 관리자 회원 메모 테이블
-- 관리자가 특정 회원에 대해 내부 메모를 남길 수 있는 기능
CREATE TABLE IF NOT EXISTS admin_user_memos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES profiles(id),
  plaza_id TEXT REFERENCES plazas(id),
  memo TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, plaza_id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_admin_user_memos_user_id ON admin_user_memos(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_user_memos_plaza_id ON admin_user_memos(plaza_id);

-- RLS
ALTER TABLE admin_user_memos ENABLE ROW LEVEL SECURITY;

-- 관리자만 읽기/쓰기
CREATE POLICY "admin_user_memos_select" ON admin_user_memos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM plaza_admins pa
      WHERE pa.user_id = auth.uid()
        AND (pa.plaza_id = admin_user_memos.plaza_id OR admin_user_memos.plaza_id IS NULL)
    )
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('superadmin', 'admin'))
  );

CREATE POLICY "admin_user_memos_insert" ON admin_user_memos
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM plaza_admins pa
      WHERE pa.user_id = auth.uid()
        AND (pa.plaza_id = admin_user_memos.plaza_id OR admin_user_memos.plaza_id IS NULL)
    )
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('superadmin', 'admin'))
  );

CREATE POLICY "admin_user_memos_update" ON admin_user_memos
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM plaza_admins pa
      WHERE pa.user_id = auth.uid()
        AND (pa.plaza_id = admin_user_memos.plaza_id OR admin_user_memos.plaza_id IS NULL)
    )
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('superadmin', 'admin'))
  );

CREATE POLICY "admin_user_memos_delete" ON admin_user_memos
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM plaza_admins pa
      WHERE pa.user_id = auth.uid()
        AND (pa.plaza_id = admin_user_memos.plaza_id OR admin_user_memos.plaza_id IS NULL)
    )
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('superadmin', 'admin'))
  );
