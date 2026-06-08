-- ============================================================================
-- messages 테이블에 image_url 컬럼 추가 — 1:1 채팅 사진 전송 기능
--
-- 농산물 상태를 사진으로 주고받는 핵심 기능. group_buying_chat_messages /
-- club_chat_messages 는 이미 image_url 을 갖고 있으나, 1:1 채팅(messages)
-- 에는 없었음.
--
-- · 사진만 보내는 메시지(content 없이 image_url 만)도 허용하기 위해
--   content NOT NULL 제약을 풀고 "content 또는 image_url 중 하나는 있어야 함"
--   CHECK 로 대체. (is_system 메시지는 예외 — 시스템 메시지 호환 유지)
-- ============================================================================

BEGIN;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url TEXT;

-- content NOT NULL 제약 해제 — 사진만 보내는 메시지 허용
ALTER TABLE messages ALTER COLUMN content DROP NOT NULL;

-- content / image_url / 시스템 메시지 중 최소 하나는 있어야 함.
-- is_system 컬럼이 있을 때만 그 분기 포함 (없으면 content/image_url 만).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'is_system'
  ) THEN
    ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_content_or_image_chk;
    ALTER TABLE messages ADD CONSTRAINT messages_content_or_image_chk
      CHECK (
        content IS NOT NULL
        OR image_url IS NOT NULL
        OR is_system = TRUE
      );
  ELSE
    ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_content_or_image_chk;
    ALTER TABLE messages ADD CONSTRAINT messages_content_or_image_chk
      CHECK (
        content IS NOT NULL
        OR image_url IS NOT NULL
      );
  END IF;
END $$;

-- PostgREST 스키마 캐시 reload (새 컬럼 즉시 노출)
NOTIFY pgrst, 'reload schema';

COMMIT;
