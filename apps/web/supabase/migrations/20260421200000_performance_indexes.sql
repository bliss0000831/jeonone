-- ════════════════════════════════════════════════════════════════════════════
-- 성능 인덱스 추가 (2026-04-21)
--
-- 목적: 홈/목록 페이지의 느린 쿼리를 해결.
--       IDEMPOTENT + 방어적 — 컬럼이 없는 테이블은 건너뛰고, 없는 테이블도 skip.
--       여러 번 실행해도 안전.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 헬퍼: 컬럼 존재시에만 인덱스 생성 ──────────────────────────────────────
CREATE OR REPLACE FUNCTION _create_index_if_cols(
  p_index_name TEXT,
  p_table_name TEXT,
  p_cols       TEXT   -- 예: 'status, created_at DESC'
) RETURNS VOID AS $$
DECLARE
  col_list TEXT[];
  col      TEXT;
  col_name TEXT;
BEGIN
  -- 테이블 존재 체크
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table_name
  ) THEN
    RAISE NOTICE 'Skip index % — table % not found', p_index_name, p_table_name;
    RETURN;
  END IF;

  -- 각 컬럼명 파싱 (DESC/ASC 제거, 공백 기준 첫 토큰)
  col_list := string_to_array(p_cols, ',');
  FOREACH col IN ARRAY col_list LOOP
    col_name := split_part(btrim(col), ' ', 1);
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = p_table_name
        AND column_name = col_name
    ) THEN
      RAISE NOTICE 'Skip index % — column %.% not found',
        p_index_name, p_table_name, col_name;
      RETURN;
    END IF;
  END LOOP;

  -- 모두 존재 — 인덱스 생성
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (%s)',
                 p_index_name, p_table_name, p_cols);
END;
$$ LANGUAGE plpgsql;

-- ─── properties ────────────────────────────────────────────────────────────
SELECT _create_index_if_cols('idx_properties_status_created', 'properties', 'status, created_at DESC');
SELECT _create_index_if_cols('idx_properties_user',           'properties', 'user_id, created_at DESC');

-- ─── favorites ─────────────────────────────────────────────────────────────
SELECT _create_index_if_cols('idx_favorites_property', 'favorites', 'property_id');
SELECT _create_index_if_cols('idx_favorites_user',     'favorites', 'user_id');

-- UNIQUE — 동일 유저/매물 찜 중복 방지 (있으면 스킵, 중복 데이터 있어도 스킵)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='favorites')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='favorites' AND column_name='user_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='favorites' AND column_name='property_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='favorites_user_property_key')
  THEN
    BEGIN
      ALTER TABLE favorites ADD CONSTRAINT favorites_user_property_key UNIQUE (user_id, property_id);
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
END $$;

-- ─── profiles ──────────────────────────────────────────────────────────────
SELECT _create_index_if_cols('idx_profiles_account_type', 'profiles', 'account_type');

-- ─── board_posts ───────────────────────────────────────────────────────────
SELECT _create_index_if_cols('idx_board_posts_created',           'board_posts', 'created_at DESC');
SELECT _create_index_if_cols('idx_board_posts_category_created',  'board_posts', 'category, created_at DESC');
SELECT _create_index_if_cols('idx_board_posts_board_type_created','board_posts', 'board_type, created_at DESC');
SELECT _create_index_if_cols('idx_board_posts_type_created',      'board_posts', 'type, created_at DESC');
SELECT _create_index_if_cols('idx_board_posts_user',              'board_posts', 'user_id, created_at DESC');
SELECT _create_index_if_cols('idx_board_posts_author',            'board_posts', 'author_id, created_at DESC');

-- ─── board_comments ────────────────────────────────────────────────────────
SELECT _create_index_if_cols('idx_board_comments_post', 'board_comments', 'post_id, created_at');

-- ─── visitor_logs ──────────────────────────────────────────────────────────
SELECT _create_index_if_cols('idx_visitor_logs_created', 'visitor_logs', 'created_at DESC');
SELECT _create_index_if_cols('idx_visitor_logs_visited', 'visitor_logs', 'visited_at DESC');

-- ─── 커뮤니티 목록 ─────────────────────────────────────────────────────────
SELECT _create_index_if_cols('idx_sharing_items_created', 'sharing_items', 'created_at DESC');
SELECT _create_index_if_cols('idx_group_buying_created',  'group_buying',  'created_at DESC');
SELECT _create_index_if_cols('idx_local_food_created',    'local_food',    'created_at DESC');
SELECT _create_index_if_cols('idx_new_stores_created',    'new_stores',    'created_at DESC');
SELECT _create_index_if_cols('idx_clubs_created',         'clubs',         'created_at DESC');

-- ─── hero_banners / popups ─────────────────────────────────────────────────
SELECT _create_index_if_cols('idx_hero_banners_active_sort', 'hero_banners', 'is_active, sort_order, created_at DESC');
SELECT _create_index_if_cols('idx_popups_active',            'popups',       'is_active, created_at DESC');

-- ─── 통계 갱신 (ANALYZE) — 존재하는 테이블만 ────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='properties')  THEN EXECUTE 'ANALYZE properties';  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='favorites')   THEN EXECUTE 'ANALYZE favorites';   END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='profiles')    THEN EXECUTE 'ANALYZE profiles';    END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='board_posts') THEN EXECUTE 'ANALYZE board_posts'; END IF;
END $$;

-- ─── 헬퍼 함수는 더 이상 필요 없으니 정리 (선택) ────────────────────────────
DROP FUNCTION IF EXISTS _create_index_if_cols(TEXT, TEXT, TEXT);

-- ─── PostgREST 스키마 캐시 reload ──────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
