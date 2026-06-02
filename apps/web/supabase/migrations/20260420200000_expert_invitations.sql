-- ════════════════════════════════════════════════════════════════════════════
-- 전문가 초대 (expert_invitations)
--  · 부동산 채팅방 안에서 공인중개사/인테리어/이사/청소/수리 전문가를 3자 대화로 초대
--  · expert 가 수락하면 해당 chat_room 에 메시지 읽기/쓰기 권한이 부여됨
--    (chat_rooms 테이블은 buyer_id / seller_id 2명만 저장하므로, expert 의 참여는
--     expert_invitations.status = 'accepted' 로 판정)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS expert_invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_room_id  UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  inviter_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expert_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id   UUID REFERENCES properties(id) ON DELETE SET NULL,
  message       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ei_chat_room_idx ON expert_invitations(chat_room_id);
CREATE INDEX IF NOT EXISTS ei_expert_idx    ON expert_invitations(expert_id);
CREATE INDEX IF NOT EXISTS ei_inviter_idx   ON expert_invitations(inviter_id);
CREATE INDEX IF NOT EXISTS ei_status_idx    ON expert_invitations(status);

-- 같은 채팅방-전문가 쌍의 pending 초대는 하나만
CREATE UNIQUE INDEX IF NOT EXISTS ei_unique_pending
  ON expert_invitations(chat_room_id, expert_id)
  WHERE status = 'pending';

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE expert_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ei_select_own ON expert_invitations;
CREATE POLICY ei_select_own ON expert_invitations
  FOR SELECT
  USING (auth.uid() = inviter_id OR auth.uid() = expert_id);

DROP POLICY IF EXISTS ei_insert_inviter ON expert_invitations;
CREATE POLICY ei_insert_inviter ON expert_invitations
  FOR INSERT
  WITH CHECK (auth.uid() = inviter_id);

-- 초대자는 pending 상태에서 취소/삭제, 수신자는 수락/거절 업데이트 가능
DROP POLICY IF EXISTS ei_update_parties ON expert_invitations;
CREATE POLICY ei_update_parties ON expert_invitations
  FOR UPDATE
  USING (auth.uid() = inviter_id OR auth.uid() = expert_id);

DROP POLICY IF EXISTS ei_delete_inviter ON expert_invitations;
CREATE POLICY ei_delete_inviter ON expert_invitations
  FOR DELETE
  USING (auth.uid() = inviter_id);

-- ─── Realtime publication ──────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'expert_invitations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE expert_invitations';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
