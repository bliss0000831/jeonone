-- ============================================================================
-- Cron 실행 로그 — 어떤 cron 이 언제 실행됐고 성공/실패했는지 기록
--
-- 사용법: cron 라우트에서 시작 시 + 종료 시 row 추가/업데이트.
-- 어드민 대시보드에서 "최근 cron 실행 현황" 표시.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS cron_run_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name    TEXT NOT NULL,                              -- 'tour-events', 'cleanup-expired' 등
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'running',            -- running | success | failed
  result      JSONB,                                       -- {ok: true, count: 12} 식
  error       TEXT,                                        -- 실패 시 에러 메시지
  duration_ms INT
);

CREATE INDEX IF NOT EXISTS cron_run_log_job_started_idx
  ON cron_run_log(job_name, started_at DESC);

-- RLS — admin / superadmin / plaza_admins 'super' 만 조회
ALTER TABLE cron_run_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cron_run_log_select_admin ON cron_run_log;
CREATE POLICY cron_run_log_select_admin ON cron_run_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
    OR EXISTS (
      SELECT 1 FROM plaza_admins pa
      WHERE pa.user_id = auth.uid() AND pa.role = 'super'
    )
  );

-- service_role 만 INSERT/UPDATE (cron 라우트가 admin client 로 작성)
-- 즉, RLS 정책에 INSERT 안 만들면 anon/authenticated 는 못 씀 → service_role 만 가능

NOTIFY pgrst, 'reload schema';

COMMIT;
