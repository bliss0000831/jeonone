-- ============================================================================
-- chat_rooms 다이렉트 메시지 지원 — 매물/게시글 무관 1:1 채팅
--
-- 1) property_id NOT NULL 제약 제거 (있으면)
-- 2) post_type='direct' + property_id IS NULL 인 행에 대해 (buyer_id, seller_id) 유니크 보장
--    — 동일 두 사람 간 direct 방 중복 생성 방지
-- 3) RLS 가 direct 방도 buyer/seller 본인이면 SELECT 가능하도록 (이미 그러함, 확인용)
-- ============================================================================

-- property_id NULL 허용
ALTER TABLE public.chat_rooms
  ALTER COLUMN property_id DROP NOT NULL;

-- direct 방 중복 방지 — partial unique index
-- (buyer_id, seller_id) 페어가 같으면 한 방만 존재
DROP INDEX IF EXISTS chat_rooms_direct_unique;
CREATE UNIQUE INDEX chat_rooms_direct_unique
  ON public.chat_rooms (
    LEAST(buyer_id, seller_id),
    GREATEST(buyer_id, seller_id),
    plaza_id
  )
  WHERE post_type = 'direct' AND property_id IS NULL;

NOTIFY pgrst, 'reload schema';
