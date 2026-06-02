-- ════════════════════════════════════════════════════════════════════════════
-- notifications: 모든 정책 전체 제거 후 최소 정책으로 재구축
--
-- 이전 20260508 마이그레이션의 버그:
--   polcmd IN ('a','w') 로 필터링 → FOR ALL(polcmd='*') 정책과
--   RESTRICTIVE 정책을 못 지우는 경우가 있음.
--
-- 이번엔 command/permissive 구분 없이 notifications 의 모든 정책을
-- 전부 DROP 하고, 필요한 4개(SELECT/INSERT×2/UPDATE/DELETE)만 재생성.
-- ════════════════════════════════════════════════════════════════════════════

-- 컬럼 보증 (혹시 누락됐을 경우)
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS actor_id      UUID,
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS property_id   UUID;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 1) 모든 정책 삭제 (command/permissive 불문)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT polname
    FROM pg_policy
    WHERE polrelid = 'public.notifications'::regclass
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON notifications', r.polname);
  END LOOP;
END $$;

-- 2) 최소 정책 재생성
-- 2-a) 본인 알림만 조회
CREATE POLICY notifications_select_own ON notifications
  FOR SELECT
  USING ( auth.uid() IS NOT NULL AND user_id = auth.uid() );

-- 2-b) 본인이 본인에게 INSERT
CREATE POLICY notifications_insert_own ON notifications
  FOR INSERT
  WITH CHECK ( auth.uid() IS NOT NULL AND user_id = auth.uid() );

-- 2-c) 본인이 actor 로서 타인에게 INSERT
CREATE POLICY notifications_insert_as_actor ON notifications
  FOR INSERT
  WITH CHECK ( auth.uid() IS NOT NULL AND actor_id = auth.uid() );

-- 2-d) 본인 알림 UPDATE (읽음 처리 등)
CREATE POLICY notifications_update_own ON notifications
  FOR UPDATE
  USING ( auth.uid() IS NOT NULL AND user_id = auth.uid() )
  WITH CHECK ( auth.uid() IS NOT NULL AND user_id = auth.uid() );

-- 2-e) 본인 알림 DELETE
CREATE POLICY notifications_delete_own ON notifications
  FOR DELETE
  USING ( auth.uid() IS NOT NULL AND user_id = auth.uid() );

-- 3) PostgREST 스키마 캐시 리로드
NOTIFY pgrst, 'reload schema';

-- ─── 적용 후 반드시 SQL Editor 에서 확인 ────────────────────────────────────
--   SELECT polname, polcmd, polpermissive,
--          pg_get_expr(polqual, polrelid)      AS using_expr,
--          pg_get_expr(polwithcheck, polrelid) AS check_expr
--   FROM pg_policy
--   WHERE polrelid = 'public.notifications'::regclass
--   ORDER BY polcmd, polname;
--
-- 기대 결과 (정확히 5개 행):
--   notifications_select_own       | r | t | user_id = auth.uid()  | NULL
--   notifications_insert_own       | a | t | NULL                  | user_id = auth.uid()
--   notifications_insert_as_actor  | a | t | NULL                  | actor_id = auth.uid()
--   notifications_update_own       | w | t | user_id = auth.uid()  | user_id = auth.uid()
--   notifications_delete_own       | d | t | user_id = auth.uid()  | NULL
--
-- 그 외 정책이 보이거나 polpermissive=f(RESTRICTIVE) 가 있으면
-- 이 마이그레이션이 제대로 실행되지 않은 것 — 다시 Run.
