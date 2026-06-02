-- ════════════════════════════════════════════════════════════════════════════
-- 도와주세요 (service_requests)
--  · 모든 로그인 유저가 "홈서비스를 도와달라"는 요청글을 올림
--  · 요청의 service_type에 맞는 전문가(계정유형)만 응답(댓글) 가능
--    예: service_type='interior' → account_type='interior' 만 응답
--  · 서비스 유형: 인테리어/이사/청소/수리
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS service_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plaza_id          TEXT,              -- 플라자 격리용
  title             TEXT NOT NULL,
  content           TEXT NOT NULL,
  service_type      TEXT NOT NULL
                    CHECK (service_type IN ('interior', 'moving', 'cleaning', 'repair')),
  region            TEXT,              -- 예: "강원"
  district          TEXT,              -- 예: "춘천시"
  dong              TEXT,              -- 예: "석사동"
  budget_min        BIGINT,            -- 최소 예산 (원)
  budget_max        BIGINT,            -- 최대 예산 (원)
  desired_date      DATE,              -- 희망 서비스 날짜
  status            TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'matched', 'closed')),
  views             INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sr_user_idx         ON service_requests(user_id);
CREATE INDEX IF NOT EXISTS sr_status_idx       ON service_requests(status);
CREATE INDEX IF NOT EXISTS sr_created_idx      ON service_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS sr_service_type_idx ON service_requests(service_type);
CREATE INDEX IF NOT EXISTS sr_plaza_idx        ON service_requests(plaza_id);

-- ─── 응답(댓글) 테이블 ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_request_responses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  plaza_id      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS srr_request_idx ON service_request_responses(request_id);
CREATE INDEX IF NOT EXISTS srr_user_idx    ON service_request_responses(user_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_request_responses ENABLE ROW LEVEL SECURITY;

-- 모두 조회 가능 (로그인 불필요) — 공개 게시판
DROP POLICY IF EXISTS sr_select_all ON service_requests;
CREATE POLICY sr_select_all ON service_requests FOR SELECT USING (true);

-- 모든 로그인 유저가 요청 작성 가능
DROP POLICY IF EXISTS sr_insert_auth ON service_requests;
CREATE POLICY sr_insert_auth ON service_requests
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS sr_update_own ON service_requests;
CREATE POLICY sr_update_own ON service_requests
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS sr_delete_own ON service_requests;
CREATE POLICY sr_delete_own ON service_requests
  FOR DELETE USING (auth.uid() = user_id);

-- 응답: 모두 조회 가능
DROP POLICY IF EXISTS srr_select_all ON service_request_responses;
CREATE POLICY srr_select_all ON service_request_responses FOR SELECT USING (true);

-- 응답: 해당 service_type에 맞는 전문가(account_type)만 작성 가능
-- 관리자/슈퍼어드민은 모든 유형에 응답 가능
DROP POLICY IF EXISTS srr_insert_expert ON service_request_responses;
CREATE POLICY srr_insert_expert ON service_request_responses
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      EXISTS (
        SELECT 1
        FROM service_requests sr
        JOIN profiles p ON p.id = auth.uid()
        WHERE sr.id = request_id
          AND p.account_type = sr.service_type
      )
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'superadmin')
      )
    )
  );

DROP POLICY IF EXISTS srr_update_own ON service_request_responses;
CREATE POLICY srr_update_own ON service_request_responses
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS srr_delete_own ON service_request_responses;
CREATE POLICY srr_delete_own ON service_request_responses
  FOR DELETE USING (auth.uid() = user_id);

-- ─── updated_at 자동 갱신 ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION service_requests_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS service_requests_updated_at ON service_requests;
CREATE TRIGGER service_requests_updated_at
  BEFORE UPDATE ON service_requests
  FOR EACH ROW EXECUTE FUNCTION service_requests_touch_updated_at();

-- ─── Realtime publication ──────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'service_requests'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE service_requests';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'service_request_responses'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE service_request_responses';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
