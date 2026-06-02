-- chat_rooms.property_id는 post_type에 따라 properties, sharing_posts, cleaning_posts,
-- repair_posts, interior_posts, moving_posts, new_store_posts, local_food, group_buying_posts
-- 중 어느 테이블의 id든 참조하는 polymorphic 컬럼으로 확장되었다.
-- 기존 FK (chat_rooms_property_id_fkey → properties.id) 는 다른 게시물 유형에서
-- 채팅방을 만들 때 위반되므로 제거한다.

ALTER TABLE chat_rooms
  DROP CONSTRAINT IF EXISTS chat_rooms_property_id_fkey;

-- post_type 기본값/체크는 앱에서 관리하므로 DB는 자유로운 텍스트로 유지한다.
-- post_type 컬럼이 없던 예전 스키마 대비 (이미 있으면 IF NOT EXISTS 로 무시됨)
ALTER TABLE chat_rooms
  ADD COLUMN IF NOT EXISTS post_type TEXT NOT NULL DEFAULT 'property';
