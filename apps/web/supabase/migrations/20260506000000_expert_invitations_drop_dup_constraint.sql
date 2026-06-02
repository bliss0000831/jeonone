-- ════════════════════════════════════════════════════════════════════════════
-- expert_invitations: 잘못된 UNIQUE(chat_room_id, expert_id, status) 제거
--
-- 문제: (chat_room_id, expert_id, status) 조합에 UNIQUE 제약이 걸려 있어,
--   같은 전문가가 같은 채팅방에서 과거에 거절한 적이 있으면,
--   새 pending 초대를 다시 거절할 때
--     UPDATE status = 'rejected'
--   하는 순간 이미 존재하는 (chat_room, expert, 'rejected') 행과 충돌.
--     → duplicate key value violates unique constraint
--       "expert_invitations_chat_room_id_expert_id_status_key"
--
-- 해결: 해당 UNIQUE 제약/인덱스를 제거.
--   중복 pending 방지 목적은 이미 별도의 partial-unique index
--     ei_unique_pending  WHERE status = 'pending'
--   가 담당하므로, 전체 상태에 걸린 UNIQUE 은 필요 없음.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) 테이블 제약으로 존재할 수도, 단독 인덱스로 존재할 수도 있어 둘 다 시도
ALTER TABLE expert_invitations
  DROP CONSTRAINT IF EXISTS expert_invitations_chat_room_id_expert_id_status_key;

DROP INDEX IF EXISTS expert_invitations_chat_room_id_expert_id_status_key;

-- 2) 혹시 이름이 다른 변종도 있을 수 있어 안전하게 탐색 후 정리
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'expert_invitations'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%chat_room_id%expert_id%status%'
  LOOP
    EXECUTE format('ALTER TABLE expert_invitations DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;

  FOR r IN
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'expert_invitations'
      AND indexdef ILIKE '%UNIQUE%'
      AND indexdef ILIKE '%chat_room_id%'
      AND indexdef ILIKE '%expert_id%'
      AND indexdef ILIKE '%status%'
      AND indexname <> 'ei_unique_pending'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', r.indexname);
  END LOOP;
END $$;

-- 3) pending 중복 방지용 partial-unique 인덱스는 유지(없다면 재생성)
CREATE UNIQUE INDEX IF NOT EXISTS ei_unique_pending
  ON expert_invitations(chat_room_id, expert_id)
  WHERE status = 'pending';

NOTIFY pgrst, 'reload schema';
