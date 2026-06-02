-- ============================================================================
-- my_group_buying_chat_rooms 뷰에 plaza_id / buyer_plaza_id 컬럼 노출
--
-- 채팅 노출 규칙 (참여자별 본인 광장 기준):
--   · I'm owner (seller) → gp.plaza_id == current_plaza
--   · I'm participant (buyer) → buyer_plaza_id == current_plaza
--     (group_buying_orders.buyer_plaza_id 우선, 없으면 gp.plaza_id fallback)
-- ============================================================================

BEGIN;

DROP VIEW IF EXISTS my_group_buying_chat_rooms;
CREATE VIEW my_group_buying_chat_rooms WITH (security_invoker = true) AS
SELECT
  gp.id AS post_id,
  gp.plaza_id,                       -- 🆕 seller plaza
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
  -- 🆕 buyer plaza — orders 의 buyer_plaza_id 우선, 없으면 post plaza
  COALESCE(
    (SELECT o.buyer_plaza_id FROM group_buying_orders o
     WHERE o.post_id = gp.id AND o.buyer_id = p.user_id
     ORDER BY o.created_at ASC LIMIT 1),
    gp.plaza_id
  ) AS buyer_plaza_id,
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
WHERE gp.status IN ('pending_payment', 'in_progress', 'completed');

GRANT SELECT ON my_group_buying_chat_rooms TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
