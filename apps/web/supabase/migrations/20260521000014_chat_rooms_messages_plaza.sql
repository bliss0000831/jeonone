-- ============================================================================
-- chat_rooms / messages 에 plaza_id 추가 — 라운드 9 발견 누수 차단
--
-- 그동안 chat_rooms 자체엔 plaza_id 가 없고 코드가 fetch 후 client-side
-- 필터로 광장 검증을 했음. 정상 동작했지만 방어선이 1겹뿐이라
-- DB 단계에서도 필터 가능하도록 컬럼 추가.
--
-- chat_rooms 의 source 게시글 (property_id 가 가리키는 것) 의 plaza_id 로
-- 백필.
-- ============================================================================

BEGIN;

-- chat_rooms.plaza_id
ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS plaza_id TEXT;

-- 백필: properties 매물 채팅 → properties.plaza_id
UPDATE chat_rooms cr SET plaza_id = p.plaza_id
  FROM properties p
  WHERE cr.property_id = p.id AND cr.plaza_id IS NULL
    AND (cr.post_type = 'property' OR cr.post_type IS NULL);

-- 다른 게시글 타입들도 백필
UPDATE chat_rooms cr SET plaza_id = p.plaza_id
  FROM sharing_posts p
  WHERE cr.property_id = p.id AND cr.plaza_id IS NULL AND cr.post_type = 'sharing';

UPDATE chat_rooms cr SET plaza_id = p.plaza_id
  FROM group_buying_posts p
  WHERE cr.property_id = p.id AND cr.plaza_id IS NULL AND cr.post_type = 'group_buying';

UPDATE chat_rooms cr SET plaza_id = p.plaza_id
  FROM new_store_posts p
  WHERE cr.property_id = p.id AND cr.plaza_id IS NULL AND cr.post_type = 'new_store';

UPDATE chat_rooms cr SET plaza_id = p.plaza_id
  FROM interior_posts p
  WHERE cr.property_id = p.id AND cr.plaza_id IS NULL AND cr.post_type = 'interior';

UPDATE chat_rooms cr SET plaza_id = p.plaza_id
  FROM moving_posts p
  WHERE cr.property_id = p.id AND cr.plaza_id IS NULL AND cr.post_type = 'moving';

UPDATE chat_rooms cr SET plaza_id = p.plaza_id
  FROM cleaning_posts p
  WHERE cr.property_id = p.id AND cr.plaza_id IS NULL AND cr.post_type = 'cleaning';

UPDATE chat_rooms cr SET plaza_id = p.plaza_id
  FROM repair_posts p
  WHERE cr.property_id = p.id AND cr.plaza_id IS NULL AND cr.post_type = 'repair';

UPDATE chat_rooms cr SET plaza_id = p.plaza_id
  FROM local_food p
  WHERE cr.property_id = p.id AND cr.plaza_id IS NULL AND cr.post_type = 'local_food';

-- 남은 NULL → chuncheon 디폴트
UPDATE chat_rooms SET plaza_id = 'chuncheon' WHERE plaza_id IS NULL;
ALTER TABLE chat_rooms ALTER COLUMN plaza_id SET DEFAULT 'chuncheon';

CREATE INDEX IF NOT EXISTS chat_rooms_plaza_idx ON chat_rooms(plaza_id);
CREATE INDEX IF NOT EXISTS chat_rooms_plaza_user_idx ON chat_rooms(plaza_id, buyer_id, seller_id);

-- messages 테이블도 동일 처리 (메시지 검색/통계용)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS plaza_id TEXT;
UPDATE messages m SET plaza_id = cr.plaza_id
  FROM chat_rooms cr
  WHERE cr.id = m.chat_room_id AND m.plaza_id IS NULL;
UPDATE messages SET plaza_id = 'chuncheon' WHERE plaza_id IS NULL;
ALTER TABLE messages ALTER COLUMN plaza_id SET DEFAULT 'chuncheon';
CREATE INDEX IF NOT EXISTS messages_plaza_room_idx ON messages(plaza_id, chat_room_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
