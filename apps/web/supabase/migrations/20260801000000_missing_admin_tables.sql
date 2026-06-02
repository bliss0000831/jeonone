-- ============================================================================
-- 누락된 어드민 테이블 5개 일괄 생성
--
-- 다음 어드민 페이지에서 참조하지만 CREATE TABLE 마이그레이션이 없던 테이블:
--   1. refund_requests      — admin/billing/refunds
--   2. plaza_settlements    — admin/billing/settlements
--   3. commission_rates     — super-admin/revenue/commission
--   4. app_versions         — admin/settings/app-version (히스토리)
--   5. plaza_settings       — admin/settings/app-version (키-값 저장소)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. refund_requests — 환불 요청 관리
-- ============================================================================
CREATE TABLE IF NOT EXISTS refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plaza_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  processed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_plaza ON refund_requests(plaza_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_user ON refund_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests(status);
CREATE INDEX IF NOT EXISTS idx_refund_requests_created ON refund_requests(created_at DESC);

COMMENT ON TABLE refund_requests IS '환불 요청. 사용자가 신청하고 광장 관리자가 승인/반려.';

-- ============================================================================
-- 2. plaza_settlements — 업체별 정산 내역
-- ============================================================================
CREATE TABLE IF NOT EXISTS plaza_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plaza_id TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_revenue INTEGER NOT NULL DEFAULT 0,
  platform_fee INTEGER NOT NULL DEFAULT 0,
  net_amount INTEGER NOT NULL DEFAULT 0,
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (commission_rate >= 0 AND commission_rate <= 100),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'settled', 'paid')),
  settled_at TIMESTAMPTZ,
  settled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plaza_settlements_plaza ON plaza_settlements(plaza_id);
CREATE INDEX IF NOT EXISTS idx_plaza_settlements_status ON plaza_settlements(status);
CREATE INDEX IF NOT EXISTS idx_plaza_settlements_period ON plaza_settlements(period_start, period_end);

COMMENT ON TABLE plaza_settlements IS '광장별 정산 내역. 기간별 매출/수수료/분배금 기록.';

-- ============================================================================
-- 3. commission_rates — 광장별/카테고리별 수수료율
-- ============================================================================
CREATE TABLE IF NOT EXISTS commission_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plaza_id TEXT,                                -- NULL = 전체 기본값
  category TEXT,                                -- NULL = 전체 카테고리
  rate NUMERIC(5,2) NOT NULL DEFAULT 10
    CHECK (rate >= 0 AND rate <= 100),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_rates_plaza ON commission_rates(plaza_id);
CREATE INDEX IF NOT EXISTS idx_commission_rates_category ON commission_rates(category);
CREATE INDEX IF NOT EXISTS idx_commission_rates_effective ON commission_rates(effective_from);

COMMENT ON TABLE commission_rates IS '광장별/카테고리별 수수료율. plaza_id NULL = 전체 기본, category NULL = 전체 카테고리.';

-- ============================================================================
-- 4. app_versions — 앱 버전 히스토리
-- ============================================================================
CREATE TABLE IF NOT EXISTS app_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plaza_id TEXT NOT NULL,
  version TEXT NOT NULL,
  min_version TEXT,
  force_update BOOLEAN NOT NULL DEFAULT FALSE,
  release_notes TEXT,
  platform TEXT DEFAULT 'all'
    CHECK (platform IN ('all', 'ios', 'android')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_versions_plaza ON app_versions(plaza_id);
CREATE INDEX IF NOT EXISTS idx_app_versions_created ON app_versions(created_at DESC);

COMMENT ON TABLE app_versions IS '앱 버전 히스토리. 광장별 버전 변경 이력 기록.';

-- ============================================================================
-- 5. plaza_settings — 광장별 키-값 설정 저장소
-- ============================================================================
CREATE TABLE IF NOT EXISTS plaza_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plaza_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT plaza_settings_plaza_key_unique UNIQUE (plaza_id, key)
);

CREATE INDEX IF NOT EXISTS idx_plaza_settings_plaza ON plaza_settings(plaza_id);
CREATE INDEX IF NOT EXISTS idx_plaza_settings_key ON plaza_settings(key);

COMMENT ON TABLE plaza_settings IS '광장별 키-값 설정. site_settings와 유사하나 광장 단위로 격리.';

-- ============================================================================
-- updated_at 자동 갱신 트리거
-- ============================================================================
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'refund_requests', 'plaza_settlements', 'commission_rates',
    'app_versions', 'plaza_settings'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION billing_set_updated_at()',
      t, t
    );
  END LOOP;
END $$;

-- ============================================================================
-- RLS 정책
-- ============================================================================
ALTER TABLE refund_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE plaza_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_rates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_versions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE plaza_settings    ENABLE ROW LEVEL SECURITY;

-- ----- refund_requests -----
-- 본인 요청 읽기 + 광장 관리자/관리자 전체
DROP POLICY IF EXISTS "refund_requests read" ON refund_requests;
CREATE POLICY "refund_requests read" ON refund_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM plaza_admins pa
      WHERE pa.user_id = auth.uid() AND pa.plaza_id = refund_requests.plaza_id
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

DROP POLICY IF EXISTS "refund_requests user insert" ON refund_requests;
CREATE POLICY "refund_requests user insert" ON refund_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "refund_requests admin manage" ON refund_requests;
CREATE POLICY "refund_requests admin manage" ON refund_requests
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM plaza_admins pa
      WHERE pa.user_id = auth.uid() AND pa.plaza_id = refund_requests.plaza_id
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM plaza_admins pa
      WHERE pa.user_id = auth.uid() AND pa.plaza_id = refund_requests.plaza_id
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

-- ----- plaza_settlements -----
-- 광장 관리자: 자기 광장만, 관리자: 전체
DROP POLICY IF EXISTS "plaza_settlements read" ON plaza_settlements;
CREATE POLICY "plaza_settlements read" ON plaza_settlements
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM plaza_admins pa
      WHERE pa.user_id = auth.uid() AND pa.plaza_id = plaza_settlements.plaza_id
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

DROP POLICY IF EXISTS "plaza_settlements admin manage" ON plaza_settlements;
CREATE POLICY "plaza_settlements admin manage" ON plaza_settlements
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- ----- commission_rates -----
-- 읽기: 모든 인증 사용자, 쓰기: 슈퍼관리자
DROP POLICY IF EXISTS "commission_rates read all" ON commission_rates;
CREATE POLICY "commission_rates read all" ON commission_rates
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "commission_rates admin manage" ON commission_rates;
CREATE POLICY "commission_rates admin manage" ON commission_rates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- ----- app_versions -----
-- 읽기: 광장 관리자 자기 광장 + 관리자 전체, 쓰기: 광장 관리자/관리자
DROP POLICY IF EXISTS "app_versions read" ON app_versions;
CREATE POLICY "app_versions read" ON app_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM plaza_admins pa
      WHERE pa.user_id = auth.uid() AND pa.plaza_id = app_versions.plaza_id
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

DROP POLICY IF EXISTS "app_versions admin manage" ON app_versions;
CREATE POLICY "app_versions admin manage" ON app_versions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM plaza_admins pa
      WHERE pa.user_id = auth.uid() AND pa.plaza_id = app_versions.plaza_id
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM plaza_admins pa
      WHERE pa.user_id = auth.uid() AND pa.plaza_id = app_versions.plaza_id
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

-- ----- plaza_settings -----
-- 읽기: 광장 관리자 자기 광장 + 관리자 전체, 쓰기: 광장 관리자/관리자
DROP POLICY IF EXISTS "plaza_settings read" ON plaza_settings;
CREATE POLICY "plaza_settings read" ON plaza_settings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM plaza_admins pa
      WHERE pa.user_id = auth.uid() AND pa.plaza_id = plaza_settings.plaza_id
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

DROP POLICY IF EXISTS "plaza_settings admin manage" ON plaza_settings;
CREATE POLICY "plaza_settings admin manage" ON plaza_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM plaza_admins pa
      WHERE pa.user_id = auth.uid() AND pa.plaza_id = plaza_settings.plaza_id
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM plaza_admins pa
      WHERE pa.user_id = auth.uid() AND pa.plaza_id = plaza_settings.plaza_id
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
