-- ════════════════════════════════════════════════════════════════════════════
-- 성능 인덱스 PT.2 (2026-04-21)
--
-- 대상: 헤더/BottomNav 에서 자주 폴링되는 느린 API 쿼리 뒤의 테이블
--   · notifications        — 알림 드롭다운 (0.3~0.8s)
--   · messages             — 1:1 안읽음 카운트 (0.4s)
--   · expert_invitations   — 전문가 초대함 (0.5s)
--
-- 방식: performance_indexes 와 동일한 IDEMPOTENT 헬퍼. 여러 번 실행 안전.
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

-- ─── notifications ─────────────────────────────────────────────────────────
-- GET /api/notifications : where user_id = ? order by created_at desc limit 50
SELECT _create_index_if_cols(
  'idx_notifications_user_created',
  'notifications',
  'user_id, created_at DESC'
);
-- PATCH /api/notifications : where user_id = ? and is_read = false
SELECT _create_index_if_cols(
  'idx_notifications_user_unread',
  'notifications',
  'user_id, is_read'
);

-- ─── messages (1:1 채팅 안읽음) ────────────────────────────────────────────
-- GET /api/chat/unread-total : where is_read = false and sender_id != ?
-- (부분 인덱스로 미읽음 행만 인덱싱하면 훨씬 작고 빠름)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='messages')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='is_read')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='sender_id')
  THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_messages_unread_by_sender
             ON messages (sender_id)
             WHERE is_read = false';
  END IF;
END $$;

-- room_id 기반 조회도 있으면 보조 인덱스
SELECT _create_index_if_cols(
  'idx_messages_room_created',
  'messages',
  'room_id, created_at DESC'
);

-- ─── expert_invitations ────────────────────────────────────────────────────
-- GET /api/expert-invitations?type=received : where expert_id = ? order by created_at desc
-- GET ?type=sent                            : where sender_id = ?
SELECT _create_index_if_cols(
  'idx_expert_invitations_expert_created',
  'expert_invitations',
  'expert_id, created_at DESC'
);
SELECT _create_index_if_cols(
  'idx_expert_invitations_sender_created',
  'expert_invitations',
  'sender_id, created_at DESC'
);
-- status = 'pending' 만 자주 조회되면 부분 인덱스도 유용
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='expert_invitations')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expert_invitations' AND column_name='expert_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expert_invitations' AND column_name='status')
  THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_expert_invitations_expert_pending
             ON expert_invitations (expert_id)
             WHERE status = ''pending''';
  END IF;
END $$;

-- ─── 통계 갱신 ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='notifications')      THEN EXECUTE 'ANALYZE notifications';      END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='messages')           THEN EXECUTE 'ANALYZE messages';           END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='expert_invitations') THEN EXECUTE 'ANALYZE expert_invitations'; END IF;
END $$;

DROP FUNCTION IF EXISTS _create_index_if_cols(TEXT, TEXT, TEXT);

NOTIFY pgrst, 'reload schema';
