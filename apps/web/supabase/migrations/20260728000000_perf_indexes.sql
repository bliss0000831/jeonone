-- ============================================================================
-- 성능 개선 인덱스
-- ============================================================================

-- chat_rooms: 기존 채팅방 존재 확인 쿼리 최적화
-- WHERE buyer_id = ? AND seller_id = ? AND property_id = ?
CREATE INDEX IF NOT EXISTS idx_chat_rooms_buyer_seller_prop
  ON chat_rooms (buyer_id, seller_id, property_id);

-- chat_rooms: seller 기준 조회 (채팅방 GET 의 or 필터)
CREATE INDEX IF NOT EXISTS idx_chat_rooms_seller
  ON chat_rooms (seller_id);
