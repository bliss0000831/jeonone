-- ============================================================================
-- chat_unread_counts RPC — 채팅방별 안읽음 메시지 수를 DB-side GROUP BY 로 반환
--
-- 기존: JS 에서 messages 전체 행을 가져와 client-side 카운팅 → 메시지 수 비례 느림
-- 변경: DB 에서 GROUP BY 후 {chat_room_id, cnt} 배열만 반환 → 상수 시간
-- ============================================================================

CREATE OR REPLACE FUNCTION public.chat_unread_counts(
  p_room_ids UUID[],
  p_user_id  UUID
)
RETURNS TABLE(chat_room_id UUID, cnt BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT m.chat_room_id, COUNT(*) AS cnt
  FROM messages m
  WHERE m.chat_room_id = ANY(p_room_ids)
    AND m.is_read = false
    AND m.sender_id != p_user_id
  GROUP BY m.chat_room_id;
$$;

-- 성능 보조 — chat_room_id + is_read 복합 partial 인덱스
-- (기존 idx_messages_unread_by_sender 는 sender_id 기반이라 이 쿼리엔 안 탐)
CREATE INDEX IF NOT EXISTS idx_messages_unread_by_room
  ON messages (chat_room_id)
  WHERE is_read = false;

NOTIFY pgrst, 'reload schema';
