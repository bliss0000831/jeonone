-- ════════════════════════════════════════════════════════════════════════════
-- 공동구매(group_buying) 결제 · 배송 · 채팅 스키마
-- ════════════════════════════════════════════════════════════════════════════
-- 설계:
--  · group_buying_posts.status = 'recruiting' | 'pending_payment' | 'in_progress' | 'completed' | 'cancelled'
--     · recruiting         : 모집중 (참여/취소 자유)
--     · pending_payment    : 모집 마감 → 입금 대기 (채팅방 오픈, 계좌 공개)
--     · in_progress        : 주최자 "주문 시작" → 배송/수령 단계
--     · completed          : 전원 수령 완료
--     · cancelled          : 주최자 취소
--  · 수령 방식: pickup | delivery | both (both 는 참가자가 선택)
--  · 배송비 정산: included(상품가 포함) | separate(별도 입금)
--  · 참가자 상태(payment_status): reserved | paid | confirmed | shipped | received | cancelled
-- ════════════════════════════════════════════════════════════════════════════

-- ─── group_buying_posts 확장 ────────────────────────────────────────────────
ALTER TABLE group_buying_posts
  ADD COLUMN IF NOT EXISTS account_info text,
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS delivery_fee int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee_mode text NOT NULL DEFAULT 'separate',
  ADD COLUMN IF NOT EXISTS pickup_location text,
  ADD COLUMN IF NOT EXISTS pickup_time text;

-- status 체크 제약 재정의 (새 상태값 포함)
ALTER TABLE group_buying_posts
  DROP CONSTRAINT IF EXISTS group_buying_posts_status_check;
ALTER TABLE group_buying_posts
  ADD CONSTRAINT group_buying_posts_status_check
  CHECK (status IN ('recruiting', 'pending_payment', 'in_progress', 'completed', 'cancelled'));

-- ─── group_buying_participants payment_status 체크 재정의 ─────────────────
ALTER TABLE group_buying_participants
  DROP CONSTRAINT IF EXISTS group_buying_participants_payment_status_check;

-- ─── group_buying_participants 확장 ────────────────────────────────────────
ALTER TABLE group_buying_participants
  ADD COLUMN IF NOT EXISTS quantity int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS receive_method text NOT NULL DEFAULT 'pickup',
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS recipient_phone text,
  ADD COLUMN IF NOT EXISTS recipient_address text,
  ADD COLUMN IF NOT EXISTS recipient_address_detail text,
  ADD COLUMN IF NOT EXISTS tracking_carrier text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS shipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'reserved',
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_read_at timestamptz NOT NULL DEFAULT now();

-- payment_status 체크 제약 (컬럼 추가 후 부여)
ALTER TABLE group_buying_participants
  ADD CONSTRAINT group_buying_participants_payment_status_check
  CHECK (payment_status IN ('reserved', 'paid', 'confirmed', 'shipped', 'received', 'cancelled'));

CREATE INDEX IF NOT EXISTS gbp_post_idx ON group_buying_participants(post_id);
CREATE INDEX IF NOT EXISTS gbp_user_idx ON group_buying_participants(user_id);

-- ─── 채팅 메시지 테이블 ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_buying_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES group_buying_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text,
  image_url text,
  system_type text,  -- null=일반 / 'notice','order_start','shipping' 등 시스템 메시지
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (content IS NOT NULL OR image_url IS NOT NULL OR system_type IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS gbcm_post_created_idx
  ON group_buying_chat_messages (post_id, created_at DESC);

ALTER TABLE group_buying_chat_messages ENABLE ROW LEVEL SECURITY;

-- 참가자(또는 주최자)만 읽기
DROP POLICY IF EXISTS "Members read gb_chat_messages" ON group_buying_chat_messages;
CREATE POLICY "Members read gb_chat_messages" ON group_buying_chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM group_buying_participants p
      WHERE p.post_id = group_buying_chat_messages.post_id
        AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM group_buying_posts gp
      WHERE gp.id = group_buying_chat_messages.post_id
        AND gp.user_id = auth.uid()
    )
  );

-- 참가자(또는 주최자) 본인만 본인 명의로 삽입
DROP POLICY IF EXISTS "Members insert gb_chat_messages" ON group_buying_chat_messages;
CREATE POLICY "Members insert gb_chat_messages" ON group_buying_chat_messages
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM group_buying_participants p
              WHERE p.post_id = group_buying_chat_messages.post_id AND p.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM group_buying_posts gp
                 WHERE gp.id = group_buying_chat_messages.post_id AND gp.user_id = auth.uid())
    )
  );

-- 본인 메시지 삭제
DROP POLICY IF EXISTS "Self delete gb_chat_messages" ON group_buying_chat_messages;
CREATE POLICY "Self delete gb_chat_messages" ON group_buying_chat_messages
  FOR DELETE USING (user_id = auth.uid());

-- Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE group_buying_chat_messages;

-- ─── 트리거: 게시글 생성시 주최자를 자동으로 participants 에 등록 ───────────
CREATE OR REPLACE FUNCTION add_gb_owner_as_participant()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO group_buying_participants (post_id, user_id, quantity, receive_method, payment_status)
    VALUES (NEW.id, NEW.user_id, 0, 'pickup', 'confirmed')  -- 주최자는 수량 0, 즉시 확정
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_add_gb_owner ON group_buying_posts;
CREATE TRIGGER trg_add_gb_owner
  AFTER INSERT ON group_buying_posts
  FOR EACH ROW EXECUTE FUNCTION add_gb_owner_as_participant();

-- 기존 게시글 소급 등록 (주최자가 아직 participants 에 없다면 추가)
INSERT INTO group_buying_participants (post_id, user_id, quantity, receive_method, payment_status)
SELECT id, user_id, 0, 'pickup', 'confirmed' FROM group_buying_posts
ON CONFLICT DO NOTHING;

-- ─── 뷰: 내 공동구매 채팅방 목록 (unread count 포함) ──────────────────────
DROP VIEW IF EXISTS my_group_buying_chat_rooms;
CREATE VIEW my_group_buying_chat_rooms WITH (security_invoker = true) AS
SELECT
  gp.id AS post_id,
  gp.title,
  gp.product_name,
  gp.images,
  gp.status,
  gp.group_price,
  gp.max_participants,
  gp.current_participants,
  gp.user_id AS owner_id,
  p.user_id,
  p.payment_status,
  p.quantity,
  p.last_read_at,
  (
    SELECT COALESCE(content, CASE WHEN image_url IS NOT NULL THEN '[사진]' ELSE '[공지]' END)
    FROM group_buying_chat_messages m
    WHERE m.post_id = gp.id
    ORDER BY m.created_at DESC LIMIT 1
  ) AS last_message,
  (
    SELECT created_at FROM group_buying_chat_messages m
    WHERE m.post_id = gp.id
    ORDER BY m.created_at DESC LIMIT 1
  ) AS last_message_at,
  (
    SELECT count(*)::int FROM group_buying_chat_messages m
    WHERE m.post_id = gp.id
      AND m.created_at > p.last_read_at
      AND m.user_id <> p.user_id
  ) AS unread_count
FROM group_buying_participants p
JOIN group_buying_posts gp ON gp.id = p.post_id
WHERE gp.status IN ('pending_payment', 'in_progress', 'completed');  -- 마감 이후만 채팅방

GRANT SELECT ON my_group_buying_chat_rooms TO anon, authenticated;
