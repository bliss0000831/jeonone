-- ════════════════════════════════════════════════════════════════════════════
-- 구해주세요 (property_requests)
--  · 공인중개사를 제외한 모든 계정 유형이 "매물을 구해달라"는 요청글을 올림
--  · 공인중개사는 요청에 응답(댓글)을 통해 매물을 추천할 수 있음
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS property_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  content           TEXT NOT NULL,
  region            TEXT,              -- 예: "강원"
  district          TEXT,              -- 예: "춘천시"
  dong              TEXT,              -- 예: "석사동"
  property_type     TEXT,              -- 아파트/빌라/원룸/주택 등
  transaction_type  TEXT,              -- 매매/전세/월세
  budget_min        BIGINT,            -- 최소 예산 (원)
  budget_max        BIGINT,            -- 최대 예산 (원)
  move_in_date      DATE,              -- 희망 입주일
  status            TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'matched', 'closed')),
  views             INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pr_user_idx       ON property_requests(user_id);
CREATE INDEX IF NOT EXISTS pr_status_idx     ON property_requests(status);
CREATE INDEX IF NOT EXISTS pr_created_idx    ON property_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS pr_district_idx   ON property_requests(district);

-- ─── 응답(댓글) 테이블 ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS property_request_responses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    UUID NOT NULL REFERENCES property_requests(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  property_id   UUID REFERENCES properties(id) ON DELETE SET NULL,  -- 추천 매물 (선택)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prr_request_idx ON property_request_responses(request_id);
CREATE INDEX IF NOT EXISTS prr_user_idx    ON property_request_responses(user_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE property_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_request_responses ENABLE ROW LEVEL SECURITY;

-- 모두 조회 가능 (로그인 불필요) — 공개 게시판
DROP POLICY IF EXISTS pr_select_all ON property_requests;
CREATE POLICY pr_select_all ON property_requests FOR SELECT USING (true);

-- 공인중개사(agent)는 작성 불가, 그 외 로그인 유저는 작성 가능
DROP POLICY IF EXISTS pr_insert_non_agent ON property_requests;
CREATE POLICY pr_insert_non_agent ON property_requests
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.account_type = 'agent'
    )
  );

DROP POLICY IF EXISTS pr_update_own ON property_requests;
CREATE POLICY pr_update_own ON property_requests
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS pr_delete_own ON property_requests;
CREATE POLICY pr_delete_own ON property_requests
  FOR DELETE USING (auth.uid() = user_id);

-- 응답: 모두 조회 가능
DROP POLICY IF EXISTS prr_select_all ON property_request_responses;
CREATE POLICY prr_select_all ON property_request_responses FOR SELECT USING (true);

-- 응답은 로그인 유저 누구나 가능 (특히 공인중개사가 추천하는 용도)
DROP POLICY IF EXISTS prr_insert_auth ON property_request_responses;
CREATE POLICY prr_insert_auth ON property_request_responses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS prr_update_own ON property_request_responses;
CREATE POLICY prr_update_own ON property_request_responses
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS prr_delete_own ON property_request_responses;
CREATE POLICY prr_delete_own ON property_request_responses
  FOR DELETE USING (auth.uid() = user_id);

-- ─── updated_at 자동 갱신 ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION property_requests_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS property_requests_updated_at ON property_requests;
CREATE TRIGGER property_requests_updated_at
  BEFORE UPDATE ON property_requests
  FOR EACH ROW EXECUTE FUNCTION property_requests_touch_updated_at();

-- ─── Realtime publication ──────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'property_requests'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE property_requests';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'property_request_responses'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE property_request_responses';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
