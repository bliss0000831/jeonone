-- board_comments 테이블 생성 (없으면)
CREATE TABLE IF NOT EXISTS board_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES board_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_avatar TEXT,
  content TEXT NOT NULL,
  images TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS board_comments_post_id_idx ON board_comments(post_id);
CREATE INDEX IF NOT EXISTS board_comments_user_id_idx ON board_comments(user_id);
CREATE INDEX IF NOT EXISTS board_comments_parent_id_idx ON board_comments(parent_id);

-- RLS 활성화
ALTER TABLE board_comments ENABLE ROW LEVEL SECURITY;

-- 모두 조회 가능
DROP POLICY IF EXISTS "board_comments_select" ON board_comments;
CREATE POLICY "board_comments_select"
  ON board_comments FOR SELECT
  USING (true);

-- 본인 user_id로만 댓글 작성
DROP POLICY IF EXISTS "board_comments_insert" ON board_comments;
CREATE POLICY "board_comments_insert"
  ON board_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 본인 댓글만 수정
DROP POLICY IF EXISTS "board_comments_update" ON board_comments;
CREATE POLICY "board_comments_update"
  ON board_comments FOR UPDATE
  USING (auth.uid() = user_id);

-- 본인 댓글만 삭제
DROP POLICY IF EXISTS "board_comments_delete" ON board_comments;
CREATE POLICY "board_comments_delete"
  ON board_comments FOR DELETE
  USING (auth.uid() = user_id);
