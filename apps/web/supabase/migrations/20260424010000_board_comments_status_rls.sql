-- board_comments: status / 신고 카운트 컬럼 추가 + RLS 강화
--
-- 배경:
-- 기존 SELECT 정책이 `USING (true)` 라서 숨김·밴 처리된 댓글까지 모두 노출됐음.
-- 다른 게시물 테이블(secondhand_posts, jobs_posts 등)과 동일하게
-- status='hidden' 인 것은 본인/관리자만 볼 수 있도록 필터.
--
-- 주의: 이미 배포된 DB 에 안전하게 반영되도록 IF NOT EXISTS 사용.

-- 1) status 컬럼 추가 (active | hidden | banned)
ALTER TABLE board_comments
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- 2) 신고 카운트 / 숨김 사유 (관리자 UI 연동용)
ALTER TABLE board_comments
  ADD COLUMN IF NOT EXISTS report_count INT NOT NULL DEFAULT 0;
ALTER TABLE board_comments
  ADD COLUMN IF NOT EXISTS hidden_reason TEXT;

-- 3) 인덱스 — 목록 조회에 status 필터가 항상 붙으므로
CREATE INDEX IF NOT EXISTS board_comments_post_status_idx
  ON board_comments(post_id, status);

-- 4) SELECT 정책 교체 — 숨김 댓글은 본인 or 관리자만
DROP POLICY IF EXISTS "board_comments_select" ON board_comments;
CREATE POLICY "board_comments_select"
  ON board_comments FOR SELECT
  USING (
    status = 'active'
    OR auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- 5) UPDATE/DELETE 정책 — 관리자도 포함 (숨김 처리 & 삭제 가능)
DROP POLICY IF EXISTS "board_comments_update" ON board_comments;
CREATE POLICY "board_comments_update"
  ON board_comments FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  );

DROP POLICY IF EXISTS "board_comments_delete" ON board_comments;
CREATE POLICY "board_comments_delete"
  ON board_comments FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- INSERT 정책은 기존 그대로 (auth.uid() = user_id)
