-- ─────────────────────────────────────────────────────────────────────────
-- messages 테이블 Realtime publication 등록
--
-- 증상: 1:1 채팅에서 메시지 INSERT 는 성공하지만 Realtime 이벤트가
--       발생하지 않아 웹/RN 양쪽 모두 새로고침해야 새 메시지가 보임.
--
-- 원인: 다른 채팅 테이블들 (group_buying_chat_messages, club_chat_messages,
--       expert_invitations, property_requests 등) 은 각자 마이그레이션에서
--       supabase_realtime publication 에 추가됐지만, 가장 핵심인 1:1
--       채팅용 `messages` 테이블만 publication 등록이 누락돼 있었음.
--       (apps/web/scripts/001_create_tables.sql 에서 CREATE TABLE 되면서
--       publication 등록 SQL 이 빠짐)
--
-- 해결: messages 테이블을 supabase_realtime publication 에 추가.
--       chat_rooms 도 last_message_at / 미읽음 카운터 업데이트 즉시 반영을
--       위해 함께 등록.
-- ─────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_rooms'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_rooms';
  END IF;
END $$;

-- INSERT 이벤트만 필요하면 REPLICA IDENTITY DEFAULT 로 충분. 추후 UPDATE
-- 이벤트의 OLD row 까지 받고 싶으면 FULL 로 변경 필요.
ALTER TABLE public.messages REPLICA IDENTITY DEFAULT;
ALTER TABLE public.chat_rooms REPLICA IDENTITY DEFAULT;
