-- notifications: add thumbnail_url snapshot + actor_id
-- 목적:
--   • 알림창에서 타입별 썸네일(상대 프로필/매물 사진/상품 사진) 을 빠르게 보여주기 위함.
--   • thumbnail_url 은 "스냅샷" — 원본이 나중에 지워져도 알림 썸네일은 그대로 유지.
--   • actor_id 는 "누가 이 알림을 유발했나" — 채팅/댓글/참여 이벤트 등에 사용.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- actor_id 기반 조회는 없을 예정이라 별도 인덱스 없음.
-- user_id + created_at 인덱스는 기존 마이그레이션에 이미 존재.
