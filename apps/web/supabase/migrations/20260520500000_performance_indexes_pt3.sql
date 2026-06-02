-- ════════════════════════════════════════════════════════════════════════════
-- 성능 인덱스 PT.3 (2026-05-20)
--
-- pt2 이후 audit 에서 잡힌 hot path 들. idempotent.
--   · properties             — 매물 리스트 (status + 정렬)
--   · property_requests      — 의뢰함 (status + 정렬)
--   · board_posts            — 카테고리별 최신순 (admin 통계)
--   · board_comments         — 게시글별 정렬 (post 상세)
--   · visitor_logs           — 7일 통계 (admin)
--   · popups                 — 활성 팝업 (every page load)
--   · profiles               — 어드민 멤버 검색
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION _create_index_if_cols(
  p_index_name TEXT,
  p_table_name TEXT,
  p_cols       TEXT
) RETURNS VOID AS $$
DECLARE
  col_list TEXT[];
  col      TEXT;
  col_name TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table_name
  ) THEN
    RAISE NOTICE 'Skip index % — table % not found', p_index_name, p_table_name;
    RETURN;
  END IF;

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

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (%s)',
                 p_index_name, p_table_name, p_cols);
END;
$$ LANGUAGE plpgsql;

-- ─── properties ────────────────────────────────────────────────────────────
-- /properties, /admin/properties 모두 status 필터 + created_at desc 정렬
SELECT _create_index_if_cols(
  'idx_properties_status_created',
  'properties',
  'status, created_at DESC'
);
SELECT _create_index_if_cols(
  'idx_properties_tx_status_created',
  'properties',
  'transaction_type, status, created_at DESC'
);
SELECT _create_index_if_cols(
  'idx_properties_user_created',
  'properties',
  'user_id, created_at DESC'
);

-- ─── property_requests ─────────────────────────────────────────────────────
-- 의뢰함 어드민 / 사용자 페이지
SELECT _create_index_if_cols(
  'idx_property_requests_status_created',
  'property_requests',
  'status, created_at DESC'
);

-- ─── board_posts ───────────────────────────────────────────────────────────
-- 게시판 카테고리별 최신순 (board/[slug] 라우트)
SELECT _create_index_if_cols(
  'idx_board_posts_category_created',
  'board_posts',
  'category_id, created_at DESC'
);
-- 인기글 정렬용 — 좋아요/조회수 desc 상위 3
SELECT _create_index_if_cols(
  'idx_board_posts_like_view',
  'board_posts',
  'like_count DESC, view_count DESC'
);

-- ─── board_comments ────────────────────────────────────────────────────────
-- 게시글 상세에서 댓글 시간순 정렬
SELECT _create_index_if_cols(
  'idx_board_comments_post_created',
  'board_comments',
  'post_id, created_at ASC'
);

-- ─── visitor_logs ──────────────────────────────────────────────────────────
-- 어드민 7일 추이: where visited_at >= ?
SELECT _create_index_if_cols(
  'idx_visitor_logs_visited',
  'visitor_logs',
  'visited_at DESC'
);

-- ─── popups ────────────────────────────────────────────────────────────────
-- 모든 페이지에서 fetch 됨 — is_active + 시작/종료 시각 필터
SELECT _create_index_if_cols(
  'idx_popups_active_start',
  'popups',
  'is_active, start_at, end_at'
);

-- ─── profiles ──────────────────────────────────────────────────────────────
-- 어드민 멤버 페이지: account_type 필터 + 가입일 정렬
SELECT _create_index_if_cols(
  'idx_profiles_account_type_created',
  'profiles',
  'account_type, created_at DESC'
);

-- ─── account_type_requests ─────────────────────────────────────────────────
-- 어드민 승인 대기 목록 — 부분 인덱스가 더 작고 빠름
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='account_type_requests')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='account_type_requests' AND column_name='status')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='account_type_requests' AND column_name='created_at')
  THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_account_type_requests_pending_created
             ON account_type_requests (created_at DESC)
             WHERE status = ''pending''';
  END IF;
END $$;

-- ─── 통계 갱신 ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='properties')             THEN EXECUTE 'ANALYZE properties';             END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='property_requests')      THEN EXECUTE 'ANALYZE property_requests';      END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='board_posts')            THEN EXECUTE 'ANALYZE board_posts';            END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='board_comments')         THEN EXECUTE 'ANALYZE board_comments';         END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='visitor_logs')           THEN EXECUTE 'ANALYZE visitor_logs';           END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='popups')                 THEN EXECUTE 'ANALYZE popups';                 END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='profiles')               THEN EXECUTE 'ANALYZE profiles';               END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='account_type_requests')  THEN EXECUTE 'ANALYZE account_type_requests';  END IF;
END $$;

DROP FUNCTION IF EXISTS _create_index_if_cols(TEXT, TEXT, TEXT);

NOTIFY pgrst, 'reload schema';
