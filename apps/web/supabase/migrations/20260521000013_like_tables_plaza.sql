-- ============================================================================
-- 모든 *_likes / *_favorites / *_wishlist 테이블에 plaza_id 추가
--
-- 그동안 favorites 만 격리됐고 다른 좋아요/찜 테이블은 광장 무관이었음.
-- → 강릉 사용자가 춘천 글에 좋아요 누를 수 있고, 다른 광장 좋아요가 카운트에
--    합산되던 잠재 누수.
--
-- 백필 전략: 좋아요 row → 참조 게시글의 plaza_id 로 채움.
-- ============================================================================

BEGIN;

-- ─── 1. 컬럼 추가 ─────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'club_likes',
    'group_buying_wishlist',
    'board_post_likes',
    'local_food_likes',
    'sharing_likes',
    'new_store_likes',
    'secondhand_likes',
    'interior_favorites',
    'moving_favorites',
    'cleaning_favorites',
    'repair_favorites'
  ])
  LOOP
    -- 테이블 존재 여부 확인 후 컬럼 추가
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t AND table_schema = 'public') THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS plaza_id TEXT', t);
      EXECUTE format('ALTER TABLE %I ALTER COLUMN plaza_id SET DEFAULT ''chuncheon''', t);
    END IF;
  END LOOP;
END $$;

-- ─── 2. 백필 (참조 게시글의 plaza_id 로) ────────────────────────────────
-- 각 테이블의 참조 컬럼이 다르므로 개별 처리.
DO $$ BEGIN
  -- club_likes.club_id → clubs.plaza_id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'club_likes') THEN
    UPDATE club_likes l SET plaza_id = c.plaza_id
      FROM clubs c WHERE c.id = l.club_id AND l.plaza_id IS NULL;
    UPDATE club_likes SET plaza_id = 'chuncheon' WHERE plaza_id IS NULL;
  END IF;

  -- group_buying_wishlist.post_id → group_buying_posts.plaza_id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'group_buying_wishlist') THEN
    UPDATE group_buying_wishlist l SET plaza_id = p.plaza_id
      FROM group_buying_posts p WHERE p.id = l.post_id AND l.plaza_id IS NULL;
    UPDATE group_buying_wishlist SET plaza_id = 'chuncheon' WHERE plaza_id IS NULL;
  END IF;

  -- board_post_likes.post_id → board_posts.plaza_id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'board_post_likes') THEN
    UPDATE board_post_likes l SET plaza_id = p.plaza_id
      FROM board_posts p WHERE p.id = l.post_id AND l.plaza_id IS NULL;
    UPDATE board_post_likes SET plaza_id = 'chuncheon' WHERE plaza_id IS NULL;
  END IF;

  -- local_food_likes.local_food_id → local_food.plaza_id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'local_food_likes') THEN
    UPDATE local_food_likes l SET plaza_id = p.plaza_id
      FROM local_food p WHERE p.id = l.local_food_id AND l.plaza_id IS NULL;
    UPDATE local_food_likes SET plaza_id = 'chuncheon' WHERE plaza_id IS NULL;
  END IF;

  -- sharing_likes.post_id → sharing_posts.plaza_id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sharing_likes') THEN
    UPDATE sharing_likes l SET plaza_id = p.plaza_id
      FROM sharing_posts p WHERE p.id = l.post_id AND l.plaza_id IS NULL;
    UPDATE sharing_likes SET plaza_id = 'chuncheon' WHERE plaza_id IS NULL;
  END IF;

  -- new_store_likes.post_id → new_store_posts.plaza_id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'new_store_likes') THEN
    UPDATE new_store_likes l SET plaza_id = p.plaza_id
      FROM new_store_posts p WHERE p.id = l.post_id AND l.plaza_id IS NULL;
    UPDATE new_store_likes SET plaza_id = 'chuncheon' WHERE plaza_id IS NULL;
  END IF;

  -- secondhand_likes.post_id → secondhand_posts.plaza_id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'secondhand_likes') THEN
    UPDATE secondhand_likes l SET plaza_id = p.plaza_id
      FROM secondhand_posts p WHERE p.id = l.post_id AND l.plaza_id IS NULL;
    UPDATE secondhand_likes SET plaza_id = 'chuncheon' WHERE plaza_id IS NULL;
  END IF;

  -- interior_favorites.post_id → interior_posts.plaza_id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'interior_favorites') THEN
    UPDATE interior_favorites l SET plaza_id = p.plaza_id
      FROM interior_posts p WHERE p.id = l.post_id AND l.plaza_id IS NULL;
    UPDATE interior_favorites SET plaza_id = 'chuncheon' WHERE plaza_id IS NULL;
  END IF;

  -- moving_favorites.post_id → moving_posts.plaza_id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'moving_favorites') THEN
    UPDATE moving_favorites l SET plaza_id = p.plaza_id
      FROM moving_posts p WHERE p.id = l.post_id AND l.plaza_id IS NULL;
    UPDATE moving_favorites SET plaza_id = 'chuncheon' WHERE plaza_id IS NULL;
  END IF;

  -- cleaning_favorites.post_id → cleaning_posts.plaza_id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cleaning_favorites') THEN
    UPDATE cleaning_favorites l SET plaza_id = p.plaza_id
      FROM cleaning_posts p WHERE p.id = l.post_id AND l.plaza_id IS NULL;
    UPDATE cleaning_favorites SET plaza_id = 'chuncheon' WHERE plaza_id IS NULL;
  END IF;

  -- repair_favorites.post_id → repair_posts.plaza_id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'repair_favorites') THEN
    UPDATE repair_favorites l SET plaza_id = p.plaza_id
      FROM repair_posts p WHERE p.id = l.post_id AND l.plaza_id IS NULL;
    UPDATE repair_favorites SET plaza_id = 'chuncheon' WHERE plaza_id IS NULL;
  END IF;
END $$;

-- ─── 3. 인덱스 ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'club_likes',
    'group_buying_wishlist',
    'board_post_likes',
    'local_food_likes',
    'sharing_likes',
    'new_store_likes',
    'secondhand_likes',
    'interior_favorites',
    'moving_favorites',
    'cleaning_favorites',
    'repair_favorites'
  ])
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t AND table_schema = 'public') THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(plaza_id)', t || '_plaza_id_idx', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
