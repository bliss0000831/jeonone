-- ════════════════════════════════════════════════════════════════════════════
-- notifications.type CHECK 제약 확장
--
-- 원인:
--   기존 notifications_type_check 가 'chat','price_change','favorite' 등
--   초기 type 만 허용. 그 뒤 추가된 'expert_invitation',
--   'expert_invitation_response', 'property_request_response' 등이
--   INSERT 시 23514 CHECK 위반으로 전부 차단됨.
--
-- 해결:
--   안전하게 CHECK 제약 자체를 제거. type 은 text 컬럼이므로
--   애플리케이션 레벨에서 관리. (enum 으로 바꾸지 않는 이유:
--   새 type 추가할 때마다 마이그레이션 필요 → 동일 문제 재발)
-- ════════════════════════════════════════════════════════════════════════════

-- 기존 CHECK 제거 (이름 변형 대비 DO 블록)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.notifications'::regclass
      AND contype = 'c'
      AND conname ILIKE '%type%'
  LOOP
    EXECUTE format('ALTER TABLE notifications DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- 확인용:
--   SELECT conname, contype, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.notifications'::regclass;
--   → notifications_type_check 가 사라져 있어야 함
