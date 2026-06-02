-- ============================================================================
-- chat_rooms.buyer_plaza_id — 채팅 시작 시 buyer 가 있던 광장 기록
--
-- 이전: cross-plaza 공구/로컬푸드 채팅이 모든 광장에서 노출됨
--   → 본인이 춘천 광장에서 주문해 만든 채팅이 강릉 광장에서도 보임 (이상함)
--
-- 변경: 채팅 노출 규칙 = "참여자별 본인 광장 기준"
--   · I'm seller → chat_rooms.plaza_id == current_plaza
--   · I'm buyer  → chat_rooms.buyer_plaza_id == current_plaza
--     (NULL 이면 plaza_id 로 fallback — 레거시 호환)
--
-- 백필: 기존 행은 buyer_plaza_id = plaza_id (= 같은 광장이라 가정)
-- ============================================================================

BEGIN;

ALTER TABLE public.chat_rooms
  ADD COLUMN IF NOT EXISTS buyer_plaza_id TEXT REFERENCES public.plazas(id);

-- 백필: 같은 광장 거래로 간주 (cross-plaza 거래는 거의 없는 초기 상태)
UPDATE public.chat_rooms
SET buyer_plaza_id = plaza_id
WHERE buyer_plaza_id IS NULL;

-- 인덱스 — buyer 관점 list 조회 최적화
CREATE INDEX IF NOT EXISTS chat_rooms_buyer_plaza_idx
  ON public.chat_rooms(buyer_plaza_id, buyer_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
