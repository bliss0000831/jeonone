-- 계정 유형 신청 테이블
-- 일반인(user) → 공인중개사/사장님/생산자/인테리어/이사/청소/수리 전환 요청을 관리자가 심사
-- status 가 'approved' 이면 관리자 승인 시점에 profiles.account_type 을 업데이트 (수동 또는 트리거)

CREATE TABLE IF NOT EXISTS account_type_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requested_type  text NOT NULL CHECK (requested_type IN (
                    'agent','business','producer','interior','moving','cleaning','repair'
                  )),
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','cancelled')),

  -- 신청자 입력
  business_name   text NOT NULL,             -- 사업장(상호)명
  business_number text,                      -- 사업자등록번호 (공인중개사는 중개사 등록번호)
  office_address  text NOT NULL,             -- 사무실 / 사업장 주소
  contact_phone   text,                      -- 연락처
  intro           text,                      -- 간단한 자기소개/사업 소개

  -- 제출 서류 (Supabase Storage URL 배열)
  business_cert_urls  text[] NOT NULL DEFAULT '{}',  -- 사업자등록증 (필수)
  license_urls        text[] NOT NULL DEFAULT '{}',  -- 자격증/허가증 (공인중개사 등 필수)
  extra_docs_urls     text[] NOT NULL DEFAULT '{}',  -- 추가 서류 (선택)

  -- 관리자 심사
  reviewed_at     timestamptz,
  reviewed_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  admin_note      text,

  submitted_at    timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_type_requests_user
  ON account_type_requests (user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_account_type_requests_status
  ON account_type_requests (status, submitted_at DESC);

-- 한 사용자는 동일 유형에 대해 pending 이 최대 1건
CREATE UNIQUE INDEX IF NOT EXISTS uniq_account_type_requests_pending
  ON account_type_requests (user_id, requested_type)
  WHERE status = 'pending';

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION set_account_type_requests_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_account_type_requests_updated_at ON account_type_requests;
CREATE TRIGGER trg_account_type_requests_updated_at
  BEFORE UPDATE ON account_type_requests
  FOR EACH ROW EXECUTE FUNCTION set_account_type_requests_updated_at();

-- 승인 시 profiles.account_type 자동 업데이트
CREATE OR REPLACE FUNCTION apply_approved_account_type()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'approved' AND COALESCE(OLD.status, '') <> 'approved' THEN
    UPDATE profiles SET account_type = NEW.requested_type WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_apply_approved_account_type ON account_type_requests;
CREATE TRIGGER trg_apply_approved_account_type
  AFTER UPDATE ON account_type_requests
  FOR EACH ROW EXECUTE FUNCTION apply_approved_account_type();

-- RLS
ALTER TABLE account_type_requests ENABLE ROW LEVEL SECURITY;

-- 본인 SELECT
DROP POLICY IF EXISTS account_type_requests_select_self ON account_type_requests;
CREATE POLICY account_type_requests_select_self ON account_type_requests
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin'))
  );

-- 본인 INSERT (pending 만)
DROP POLICY IF EXISTS account_type_requests_insert_self ON account_type_requests;
CREATE POLICY account_type_requests_insert_self ON account_type_requests
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND status = 'pending'
  );

-- 본인 취소(cancelled) 는 UPDATE 허용 / 관리자 승인·거절
DROP POLICY IF EXISTS account_type_requests_update ON account_type_requests;
CREATE POLICY account_type_requests_update ON account_type_requests
  FOR UPDATE USING (
    (user_id = auth.uid() AND status = 'pending')
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin'))
  )
  WITH CHECK (
    (user_id = auth.uid() AND status IN ('pending','cancelled'))
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin'))
  );

COMMENT ON TABLE account_type_requests IS '계정 유형 전환 신청 (일반인 → 공인중개사/사장님/생산자/인테리어/이사/청소/수리)';
