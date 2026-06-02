-- ============================================================================
-- notifications 에 plaza_id 추가 — 광장별 알림 필터
--
-- 사용자 개인 피드라 cross-plaza 도 의미 있지만, 강릉 도메인에서 춘천 글
-- 알림이 떠봐야 클릭하면 404. 광장 도메인에선 그 광장 알림만 노출.
-- ============================================================================

BEGIN;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS plaza_id TEXT;
UPDATE notifications SET plaza_id = 'chuncheon' WHERE plaza_id IS NULL;
ALTER TABLE notifications ALTER COLUMN plaza_id SET DEFAULT 'chuncheon';
CREATE INDEX IF NOT EXISTS notifications_plaza_user_idx
  ON notifications(plaza_id, user_id, created_at DESC);

NOTIFY pgrst, 'reload schema';

COMMIT;
