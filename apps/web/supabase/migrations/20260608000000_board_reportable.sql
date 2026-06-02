-- ============================================================================
-- 게시판 글에 신고 누적 컬럼 추가 — /api/reports 가 동작하도록
--
-- 다른 게시글 테이블(secondhand_posts, jobs_posts, ...) 처럼
-- report_count + status('active'|'hidden') + hidden_reason 추가.
-- AUTO_HIDE_REPORT_THRESHOLD 누적 시 자동 status='hidden'.
-- ============================================================================

ALTER TABLE public.board_posts
  ADD COLUMN IF NOT EXISTS report_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'hidden', 'deleted')),
  ADD COLUMN IF NOT EXISTS hidden_reason TEXT;

CREATE INDEX IF NOT EXISTS board_posts_status_idx ON public.board_posts(status);

-- 기존 board_posts SELECT 정책이 status='hidden' 글까지 보여주지 않도록 강화
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'board_posts' AND policyname = 'board_posts_select'
  ) THEN
    DROP POLICY board_posts_select ON public.board_posts;
  END IF;
END $$;

CREATE POLICY board_posts_select ON public.board_posts
  FOR SELECT USING (
    status <> 'hidden'
    OR auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  );

NOTIFY pgrst, 'reload schema';
