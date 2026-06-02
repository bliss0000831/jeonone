-- ─────────────────────────────────────────────────────────────
-- page_heroes: 각 게시판 상단 히어로(배너) 이미지 관리 테이블
--   page_key: "secondhand", "sharing", "jobs", ... 등 페이지 식별자
--   image_url: 업로드된 배너 이미지 URL (R2/CDN)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS page_heroes (
  page_key   TEXT PRIMARY KEY,
  image_url  TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE page_heroes ENABLE ROW LEVEL SECURITY;

-- 누구나 읽기 가능 (공개 페이지 히어로 이미지라 익명도 조회)
DROP POLICY IF EXISTS "Anyone can read page_heroes" ON page_heroes;
CREATE POLICY "Anyone can read page_heroes" ON page_heroes
  FOR SELECT USING (true);

-- 관리자만 작성/수정/삭제
DROP POLICY IF EXISTS "Admins can manage page_heroes" ON page_heroes;
CREATE POLICY "Admins can manage page_heroes" ON page_heroes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );
