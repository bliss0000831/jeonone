-- ============================================================================
-- RLS 소유권 검증 복원 — 보안 audit Round 2 CRITICAL 수정
--
-- 문제: 20260419_fix_rls_permissive.sql 가 board_comments / board_posts /
--      board_post_likes 의 UPDATE/DELETE 정책을 'auth.uid() IS NOT NULL' 로
--      완화함. 결과: 인증된 사용자가 다른 사용자의 글/댓글/좋아요를 수정/
--      삭제 가능 → API 단계 외엔 방어선 없음.
--
-- 해결: USING 에 user_id = auth.uid() 추가 + UPDATE 에 WITH CHECK 도 추가.
--      관리자(profiles.role IN admin/superadmin) 우회 허용.
-- ============================================================================

BEGIN;

-- ─── board_comments ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "board_comments_insert" ON board_comments;
CREATE POLICY "board_comments_insert"
  ON board_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

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
  )
  WITH CHECK (
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

-- ─── board_posts ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "board_posts_insert" ON board_posts;
CREATE POLICY "board_posts_insert"
  ON board_posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "board_posts_update" ON board_posts;
CREATE POLICY "board_posts_update"
  ON board_posts FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  );

DROP POLICY IF EXISTS "board_posts_delete" ON board_posts;
CREATE POLICY "board_posts_delete"
  ON board_posts FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- ─── board_post_likes ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "board_post_likes_insert" ON board_post_likes;
CREATE POLICY "board_post_likes_insert"
  ON board_post_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "board_post_likes_delete" ON board_post_likes;
CREATE POLICY "board_post_likes_delete"
  ON board_post_likes FOR DELETE
  USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
