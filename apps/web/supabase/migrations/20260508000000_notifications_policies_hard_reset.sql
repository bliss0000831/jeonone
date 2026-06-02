-- ════════════════════════════════════════════════════════════════════════════
-- notifications: RLS 정책 강제 재설정 + 필수 컬럼 보증
--
-- 증상: 초대 요청을 보내도/응답해도 notifications 에 row 가 생성되지 않음.
-- 원인 후보:
--   A) actor_id / property_id / thumbnail_url 컬럼이 누락된 과거 스키마
--   B) 기존 RESTRICTIVE INSERT 정책이 남아서 새 PERMISSIVE 정책을 무력화
--   C) 이전 정책이 user_id = auth.uid() 만 허용하여 교차 유저 INSERT 불가
--
-- 이 마이그레이션이 하는 일:
--   1) 필요한 컬럼 모두 ADD IF NOT EXISTS (스키마 정합)
--   2) notifications 의 INSERT 정책을 전부 삭제 후, 필요한 두 개만 재생성
--      - notifications_insert_own:         본인 알림 (user_id = auth.uid())
--      - notifications_insert_as_actor:    타인에게 알림 (actor_id = auth.uid())
--   3) SELECT / UPDATE / DELETE 는 기존 정책을 건드리지 않음
-- ════════════════════════════════════════════════════════════════════════════

-- 1) 컬럼 보증 (이미 있으면 no-op)
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS actor_id      UUID,
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS property_id   UUID;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 2) INSERT 정책을 모두 제거 (PERMISSIVE/RESTRICTIVE 가리지 않고)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT polname
    FROM pg_policy
    WHERE polrelid = 'public.notifications'::regclass
      AND polcmd IN ('a', 'w')   -- a=INSERT, w=UPDATE는 건드리지 않으므로 아래에서 a만 필터
  LOOP
    -- 오직 INSERT(a) 정책만 삭제 대상
    IF EXISTS (
      SELECT 1 FROM pg_policy
      WHERE polrelid = 'public.notifications'::regclass
        AND polname = r.polname
        AND polcmd = 'a'
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON notifications', r.polname);
    END IF;
  END LOOP;
END $$;

-- 3) 필요한 INSERT 정책 2개만 재생성
-- 3-a) 본인이 본인에게 만드는 알림 (기존 동작 유지)
CREATE POLICY notifications_insert_own ON notifications
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

-- 3-b) 내가 유발한(=actor) 알림을 타인에게 만들기
CREATE POLICY notifications_insert_as_actor ON notifications
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND actor_id = auth.uid()
  );

-- 4) PostgREST 스키마 캐시 리로드
NOTIFY pgrst, 'reload schema';

-- ─── 진단용 SELECT (Run 결과에서 확인 가능) ───────────────────────────────
--   ① notifications 컬럼 목록
--   ② notifications INSERT 정책 목록
--   ③ 최근 1시간 notifications 샘플 (타입 분포)
-- Supabase SQL Editor 에서 아래를 별도로 실행해보세요:
--
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name='notifications' ORDER BY ordinal_position;
--
--   SELECT polname, polcmd, pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
--   FROM pg_policy WHERE polrelid='public.notifications'::regclass;
--
--   SELECT type, count(*) FROM notifications
--   WHERE created_at > now() - interval '1 hour' GROUP BY type;
