-- account_type_requests 에 plaza_id 추가 — 광장별 인증 요청 격리
-- 기존 행은 NULL (전체 광장 공통으로 간주)

ALTER TABLE account_type_requests
  ADD COLUMN IF NOT EXISTS plaza_id TEXT REFERENCES plazas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_account_type_requests_plaza
  ON account_type_requests (plaza_id, status, submitted_at DESC);

-- verification_requests 레거시 테이블에도 동일 적용
ALTER TABLE verification_requests
  ADD COLUMN IF NOT EXISTS plaza_id TEXT;

CREATE INDEX IF NOT EXISTS idx_verification_requests_plaza
  ON verification_requests (plaza_id, status);
