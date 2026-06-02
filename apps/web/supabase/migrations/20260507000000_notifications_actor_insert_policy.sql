-- ════════════════════════════════════════════════════════════════════════════
-- notifications: 허용된 교차 사용자 알림 INSERT 정책
--
-- 문제:
--   기존 RLS 가 INSERT 를 user_id = auth.uid() 인 경우만 허용하여,
--   "전문가 초대", "초대 응답", "구해주세요 응답" 같이 타인(user_id=상대)의
--   알림 row 를 만들어야 하는 기능들이 admin(service role) client 에만 의존.
--   SUPABASE_SERVICE_ROLE_KEY 미설정 환경에서는 조용히 실패 → 알림 누락.
--
-- 해결:
--   actor_id 를 본인(auth.uid())으로 설정한 경우에 한해
--   다른 user 의 notifications row 를 만들 수 있도록 INSERT 정책 추가.
--   (actor_id 는 "누가 이 알림을 유발했나" — 이미 사용 중인 컬럼)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_insert_as_actor ON notifications;
CREATE POLICY notifications_insert_as_actor ON notifications
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND actor_id = auth.uid()
  );

NOTIFY pgrst, 'reload schema';
