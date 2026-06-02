-- ============================================
-- 게시판 전체 스키마 (카테고리/게시글/댓글/좋아요)
-- ============================================

-- 1) board_categories
CREATE TABLE IF NOT EXISTS board_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 기본 카테고리 삽입
INSERT INTO board_categories (name, slug, sort_order)
VALUES
  ('자유게시판', 'free', 1),
  ('맛집 추천', 'restaurant', 2),
  ('생활 정보', 'living', 3),
  ('일상 공유', 'daily', 4),
  ('질문/답변', 'qna', 5)
ON CONFLICT (slug) DO NOTHING;

-- 2) board_posts
CREATE TABLE IF NOT EXISTS board_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES board_categories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_avatar TEXT,
  images TEXT[] DEFAULT '{}',
  thumbnail_url TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS board_posts_category_idx ON board_posts(category_id);
CREATE INDEX IF NOT EXISTS board_posts_user_idx ON board_posts(user_id);
CREATE INDEX IF NOT EXISTS board_posts_created_idx ON board_posts(created_at DESC);

-- 3) board_comments
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
CREATE INDEX IF NOT EXISTS board_comments_post_idx ON board_comments(post_id);
CREATE INDEX IF NOT EXISTS board_comments_user_idx ON board_comments(user_id);
CREATE INDEX IF NOT EXISTS board_comments_parent_idx ON board_comments(parent_id);

-- 4) board_post_likes
CREATE TABLE IF NOT EXISTS board_post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);
CREATE INDEX IF NOT EXISTS board_post_likes_post_idx ON board_post_likes(post_id);
CREATE INDEX IF NOT EXISTS board_post_likes_user_idx ON board_post_likes(user_id);

-- ============================================
-- RLS 정책
-- ============================================

-- board_categories: 누구나 읽기
ALTER TABLE board_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "board_categories_select" ON board_categories;
CREATE POLICY "board_categories_select" ON board_categories FOR SELECT USING (true);

-- board_posts
ALTER TABLE board_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "board_posts_select" ON board_posts;
CREATE POLICY "board_posts_select" ON board_posts FOR SELECT USING (true);
DROP POLICY IF EXISTS "board_posts_insert" ON board_posts;
CREATE POLICY "board_posts_insert" ON board_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "board_posts_update" ON board_posts;
CREATE POLICY "board_posts_update" ON board_posts FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "board_posts_delete" ON board_posts;
CREATE POLICY "board_posts_delete" ON board_posts FOR DELETE USING (auth.uid() = user_id);

-- board_comments
ALTER TABLE board_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "board_comments_select" ON board_comments;
CREATE POLICY "board_comments_select" ON board_comments FOR SELECT USING (true);
DROP POLICY IF EXISTS "board_comments_insert" ON board_comments;
CREATE POLICY "board_comments_insert" ON board_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "board_comments_update" ON board_comments;
CREATE POLICY "board_comments_update" ON board_comments FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "board_comments_delete" ON board_comments;
CREATE POLICY "board_comments_delete" ON board_comments FOR DELETE USING (auth.uid() = user_id);

-- board_post_likes
ALTER TABLE board_post_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "board_post_likes_select" ON board_post_likes;
CREATE POLICY "board_post_likes_select" ON board_post_likes FOR SELECT USING (true);
DROP POLICY IF EXISTS "board_post_likes_insert" ON board_post_likes;
CREATE POLICY "board_post_likes_insert" ON board_post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "board_post_likes_delete" ON board_post_likes;
CREATE POLICY "board_post_likes_delete" ON board_post_likes FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 댓글/좋아요 수 자동 갱신 트리거
-- ============================================

-- 댓글 수 갱신
CREATE OR REPLACE FUNCTION update_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE board_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE board_posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_comment_count ON board_comments;
CREATE TRIGGER trg_update_comment_count
AFTER INSERT OR DELETE ON board_comments
FOR EACH ROW EXECUTE FUNCTION update_post_comment_count();

-- 좋아요 수 갱신
CREATE OR REPLACE FUNCTION update_post_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE board_posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE board_posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_like_count ON board_post_likes;
CREATE TRIGGER trg_update_like_count
AFTER INSERT OR DELETE ON board_post_likes
FOR EACH ROW EXECUTE FUNCTION update_post_like_count();
