-- ════════════════════════════════════════════════════════════════════════════
-- 모임(clubs) 참여자 관리 + 모임 채팅 스키마
-- ════════════════════════════════════════════════════════════════════════════
-- 설계:
--  · clubs.status = 'recruiting' | 'full' | 'closed'
--      - 'full': 정원 도달(자동) / 'closed': 모임장 수동 마감
--      - 'full' 또는 'closed' 이면 채팅방 입장 가능
--  · club_members: 참여자 테이블 + 읽음시점(last_read_at)
--  · club_chat_messages: 메시지(텍스트 or 이미지)
--  · 모임장은 당연히 club_members에 포함 (트리거로 자동 삽입)
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 참여자 테이블 ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_members (
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, user_id)
);

CREATE INDEX IF NOT EXISTS club_members_user_idx ON club_members(user_id);
CREATE INDEX IF NOT EXISTS club_members_club_idx ON club_members(club_id);

ALTER TABLE club_members ENABLE ROW LEVEL SECURITY;

-- 모두가 참여자 목록 읽기 가능 (프로필 표시용)
DROP POLICY IF EXISTS "Public read club_members" ON club_members;
CREATE POLICY "Public read club_members" ON club_members
  FOR SELECT USING (true);

-- 본인 last_read_at 업데이트
DROP POLICY IF EXISTS "Self update club_members" ON club_members;
CREATE POLICY "Self update club_members" ON club_members
  FOR UPDATE USING (auth.uid() = user_id);

-- 본인 탈퇴(삭제)
DROP POLICY IF EXISTS "Self delete club_members" ON club_members;
CREATE POLICY "Self delete club_members" ON club_members
  FOR DELETE USING (auth.uid() = user_id);

-- INSERT 는 서버 routes (service role)에서만 수행 → 클라 직접 INSERT 불가

-- ─── 채팅 메시지 테이블 ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (content IS NOT NULL OR image_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS club_chat_messages_club_created_idx
  ON club_chat_messages (club_id, created_at DESC);

ALTER TABLE club_chat_messages ENABLE ROW LEVEL SECURITY;

-- 채팅방 멤버만 읽기 가능
DROP POLICY IF EXISTS "Members read club_chat_messages" ON club_chat_messages;
CREATE POLICY "Members read club_chat_messages" ON club_chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM club_members cm
      WHERE cm.club_id = club_chat_messages.club_id
        AND cm.user_id = auth.uid()
    )
  );

-- 멤버 본인만 본인 명의로 삽입 가능
DROP POLICY IF EXISTS "Members insert club_chat_messages" ON club_chat_messages;
CREATE POLICY "Members insert club_chat_messages" ON club_chat_messages
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM club_members cm
      WHERE cm.club_id = club_chat_messages.club_id
        AND cm.user_id = auth.uid()
    )
  );

-- 본인 메시지 삭제
DROP POLICY IF EXISTS "Self delete club_chat_messages" ON club_chat_messages;
CREATE POLICY "Self delete club_chat_messages" ON club_chat_messages
  FOR DELETE USING (user_id = auth.uid());

-- ─── Realtime 활성화 (Supabase UI 에서도 가능하지만 SQL 로 명시) ──────────
ALTER PUBLICATION supabase_realtime ADD TABLE club_chat_messages;

-- ─── 트리거: 클럽 생성시 생성자를 자동으로 club_members 에 삽입 ──────────
CREATE OR REPLACE FUNCTION add_club_owner_as_member()
RETURNS TRIGGER AS $$
BEGIN
  -- clubs 생성시 생성자를 멤버로 + current_members = 1 로 맞춤
  INSERT INTO club_members (club_id, user_id)
    VALUES (NEW.id, NEW.user_id)
    ON CONFLICT DO NOTHING;
  UPDATE clubs SET current_members = GREATEST(current_members, 1) WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_add_club_owner ON clubs;
CREATE TRIGGER trg_add_club_owner
  AFTER INSERT ON clubs
  FOR EACH ROW EXECUTE FUNCTION add_club_owner_as_member();

-- ─── 기존 clubs 생성자들도 소급해서 멤버로 등록 ───────────────────────────
INSERT INTO club_members (club_id, user_id)
SELECT id, user_id FROM clubs
ON CONFLICT DO NOTHING;

-- ─── 뷰: 내 클럽 채팅방 목록 (unread count 포함) ─────────────────────────
CREATE OR REPLACE VIEW my_club_chat_rooms AS
SELECT
  c.id AS club_id,
  c.title,
  c.images,
  c.sport_type,
  c.status,
  c.max_members,
  c.current_members,
  cm.user_id,
  cm.joined_at,
  cm.last_read_at,
  (
    SELECT content FROM club_chat_messages m
    WHERE m.club_id = c.id
    ORDER BY m.created_at DESC LIMIT 1
  ) AS last_message,
  (
    SELECT created_at FROM club_chat_messages m
    WHERE m.club_id = c.id
    ORDER BY m.created_at DESC LIMIT 1
  ) AS last_message_at,
  (
    SELECT count(*)::int FROM club_chat_messages m
    WHERE m.club_id = c.id
      AND m.created_at > cm.last_read_at
      AND m.user_id <> cm.user_id
  ) AS unread_count
FROM club_members cm
JOIN clubs c ON c.id = cm.club_id
WHERE c.status IN ('full', 'closed');  -- 마감된 모임만 (채팅방 오픈)

GRANT SELECT ON my_club_chat_rooms TO anon, authenticated;
