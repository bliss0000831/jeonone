-- ============================================================================
-- direct (DM) 채팅방의 plaza_id 백필 — receiver(seller) 의 실제 광장 반영
--
-- 이전 버그: startDirectChat 가 plaza_id = buyer_plaza_id = sender 광장 으로 저장
--   → cross-plaza DM 의 receiver 광장 정보가 손실됨
--   → 채팅 리스트 칩 표시 불가, /profile/{id}?plaza= 라우팅 잘못됨
--
-- 변경 (commit 7ee0ebc4 + c3f572b8):
--   startDirectChat 에 targetPlazaId 추가 → plaza_id = receiver 광장
--   profile/[id] openMessage 가 profilePlaza 전달
--
-- 이 마이그레이션: 이전에 만들어진 direct 룸 데이터를 정정.
-- plaza_id == buyer_plaza_id 인 row 만 대상 (legacy 패턴) — intra-plaza 정상 데이터는 그대로.
--
-- seller 의 광장 결정 우선순위:
--   1) plaza_profiles 중 가장 오래된 (= 1차 가입 광장)
--   2) 없으면 그대로 두기 (NULL 안 만듦)
-- ============================================================================

BEGIN;

WITH legacy_direct AS (
  SELECT id, seller_id, plaza_id
  FROM chat_rooms
  WHERE post_type = 'direct'
    AND plaza_id IS NOT NULL
    AND buyer_plaza_id IS NOT NULL
    AND plaza_id = buyer_plaza_id  -- legacy: sender plaza 만 저장된 케이스
),
seller_primary_plaza AS (
  SELECT
    ld.id AS room_id,
    (
      SELECT pp.plaza_id
      FROM plaza_profiles pp
      WHERE pp.user_id = ld.seller_id
      ORDER BY pp.joined_at ASC
      LIMIT 1
    ) AS seller_plaza
  FROM legacy_direct ld
)
UPDATE chat_rooms cr
SET plaza_id = spp.seller_plaza
FROM seller_primary_plaza spp
WHERE cr.id = spp.room_id
  AND spp.seller_plaza IS NOT NULL
  AND spp.seller_plaza <> cr.plaza_id;  -- 실제로 다른 광장일 때만 update

NOTIFY pgrst, 'reload schema';

COMMIT;
