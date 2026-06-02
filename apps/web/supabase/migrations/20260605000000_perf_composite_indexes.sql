-- ============================================================================
-- 성능 — 복합 인덱스 추가 (자주 사용되는 (col1, col2) 조회 패턴)
--
-- 안전: 테이블 존재 여부 체크 후 인덱스 생성. 없으면 NOTICE 만 띄우고 패스.
-- ============================================================================

BEGIN;

-- follows(follower_id, following_id) — profile-shell 의 isFollowing 조회 패턴
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'follows') THEN
    CREATE INDEX IF NOT EXISTS follows_follower_following_idx
      ON follows (follower_id, following_id);
  ELSE
    RAISE NOTICE 'Table follows not found, skipping index';
  END IF;
END $$;

-- sharing_likes(user_id, post_id) — 나눔 글 좋아요 조회
-- (실제 테이블 이름은 sharing_likes — 'sharing_favorites' 는 코드 오타)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sharing_likes') THEN
    CREATE INDEX IF NOT EXISTS sharing_likes_user_post_idx
      ON sharing_likes (user_id, post_id);
  ELSE
    RAISE NOTICE 'Table sharing_likes not found, skipping index';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
