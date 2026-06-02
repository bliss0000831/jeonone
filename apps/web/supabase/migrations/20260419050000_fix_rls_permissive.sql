-- ============================================
-- RLS 정책 완화 + 버킷 MIME 제한 제거
-- (403/400 에러 해결)
-- ============================================

-- 1) media 버킷: MIME type 제한 제거, 용량 넉넉히
UPDATE storage.buckets
SET allowed_mime_types = NULL,
    file_size_limit = 104857600 -- 100MB
WHERE id = 'media';

-- 2) storage.objects 정책 재설정 (더 단순하게)
DROP POLICY IF EXISTS "media_public_select" ON storage.objects;
DROP POLICY IF EXISTS "media_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "media_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "media_owner_delete" ON storage.objects;

CREATE POLICY "media_select_all"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media');

CREATE POLICY "media_insert_all"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'media');

CREATE POLICY "media_update_all"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'media');

CREATE POLICY "media_delete_all"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'media');

-- 3) board_comments 정책: 로그인 여부만 체크 (user_id 일치 제거)
DROP POLICY IF EXISTS "board_comments_insert" ON board_comments;
CREATE POLICY "board_comments_insert"
  ON board_comments FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "board_comments_update" ON board_comments;
CREATE POLICY "board_comments_update"
  ON board_comments FOR UPDATE
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "board_comments_delete" ON board_comments;
CREATE POLICY "board_comments_delete"
  ON board_comments FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- 4) board_posts 정책도 동일하게 완화
DROP POLICY IF EXISTS "board_posts_insert" ON board_posts;
CREATE POLICY "board_posts_insert"
  ON board_posts FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "board_posts_update" ON board_posts;
CREATE POLICY "board_posts_update"
  ON board_posts FOR UPDATE
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "board_posts_delete" ON board_posts;
CREATE POLICY "board_posts_delete"
  ON board_posts FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- 5) board_post_likes 완화
DROP POLICY IF EXISTS "board_post_likes_insert" ON board_post_likes;
CREATE POLICY "board_post_likes_insert"
  ON board_post_likes FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "board_post_likes_delete" ON board_post_likes;
CREATE POLICY "board_post_likes_delete"
  ON board_post_likes FOR DELETE
  USING (auth.uid() IS NOT NULL);
