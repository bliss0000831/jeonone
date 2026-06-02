-- ============================================================================
-- 관리자 역할 확장 + 정산 테이블
--
-- 1. plaza_admins.role 확장: admin|moderator|super → + owner|finance|content|support|viewer
-- 2. plaza_settlements: 광장별 정산 마스터
-- 3. commission_rates: 수수료율 설정
-- ============================================================================

BEGIN;

-- ─── 1. plaza_admins role 확장 ──────────────────────────────────────────────
-- 기존 CHECK 제약 드롭 후 새 제약 추가
-- 기존 role 값: 'admin', 'moderator', 'super'
-- 추가 role 값: 'owner', 'finance', 'content', 'support', 'viewer'

-- 기존 제약 찾아서 드롭 (이름이 다를 수 있으므로 information_schema 활용)
DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT constraint_name INTO con_name
  FROM information_schema.table_constraints
  WHERE table_name = 'plaza_admins'
    AND constraint_type = 'CHECK'
    AND constraint_name LIKE '%role%'
  LIMIT 1;

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE plaza_admins DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

-- 새 CHECK 추가
ALTER TABLE plaza_admins
  ADD CONSTRAINT plaza_admins_role_check
  CHECK (role IN ('super', 'owner', 'admin', 'moderator', 'finance', 'content', 'support', 'viewer'));

-- 기존 'admin' → 'owner' 마이그레이션 (기존 광장 admin을 최고관리자로 승격)
UPDATE plaza_admins SET role = 'owner' WHERE role = 'admin';

-- ─── 2. plaza_settlements: 광장별 정산 ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS plaza_settlements (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plaza_id       TEXT NOT NULL REFERENCES plazas(id) ON DELETE CASCADE,
  period_start   DATE NOT NULL,
  period_end     DATE NOT NULL,
  total_revenue  BIGINT NOT NULL DEFAULT 0,        -- 해당 기간 총 매출 (원)
  platform_fee   BIGINT NOT NULL DEFAULT 0,        -- 본사 수수료 (원)
  net_amount     BIGINT NOT NULL DEFAULT 0,        -- 광장 분배금 (원)
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00,  -- 수수료율 (%)
  status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'settled', 'paid')),
  memo           TEXT,
  settled_at     TIMESTAMPTZ,
  settled_by     UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (plaza_id, period_start, period_end)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_plaza_settlements_plaza_id ON plaza_settlements(plaza_id);
CREATE INDEX IF NOT EXISTS idx_plaza_settlements_status ON plaza_settlements(status);
CREATE INDEX IF NOT EXISTS idx_plaza_settlements_period ON plaza_settlements(period_start, period_end);

-- RLS
ALTER TABLE plaza_settlements ENABLE ROW LEVEL SECURITY;

-- super admin은 모두 접근
CREATE POLICY plaza_settlements_super_read ON plaza_settlements
  FOR SELECT TO authenticated
  USING (is_super_plaza_admin());

CREATE POLICY plaza_settlements_super_write ON plaza_settlements
  FOR ALL TO authenticated
  USING (is_super_plaza_admin())
  WITH CHECK (is_super_plaza_admin());

-- 광장 owner/finance는 자기 광장 정산 조회만 가능
CREATE POLICY plaza_settlements_plaza_admin_read ON plaza_settlements
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM plaza_admins pa
      WHERE pa.user_id = auth.uid()
        AND pa.plaza_id = plaza_settlements.plaza_id
        AND pa.role IN ('owner', 'admin', 'finance')
    )
  );

-- ─── 3. commission_rates: 수수료 설정 ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS commission_rates (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plaza_id       TEXT REFERENCES plazas(id) ON DELETE CASCADE,  -- NULL = 전체 기본값
  category       TEXT,                                           -- NULL = 전체, 'property','local-food' 등
  rate           NUMERIC(5,2) NOT NULL DEFAULT 10.00,           -- 퍼센트
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by     UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_rates_plaza ON commission_rates(plaza_id);
CREATE INDEX IF NOT EXISTS idx_commission_rates_effective ON commission_rates(effective_from);

-- RLS
ALTER TABLE commission_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY commission_rates_super_all ON commission_rates
  FOR ALL TO authenticated
  USING (is_super_plaza_admin())
  WITH CHECK (is_super_plaza_admin());

-- 광장 관리자는 자기 광장 수수료율 조회 가능
CREATE POLICY commission_rates_plaza_read ON commission_rates
  FOR SELECT TO authenticated
  USING (
    plaza_id IS NULL  -- 전체 기본값은 누구나 조회
    OR EXISTS (
      SELECT 1 FROM plaza_admins pa
      WHERE pa.user_id = auth.uid()
        AND pa.plaza_id = commission_rates.plaza_id
    )
  );

-- ─── updated_at 트리거 ─────────────────────────────────────────────────────
-- 공통 updated_at 트리거 함수 (없으면 생성)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_plaza_settlements_updated_at
  BEFORE UPDATE ON plaza_settlements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_commission_rates_updated_at
  BEFORE UPDATE ON commission_rates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

NOTIFY pgrst, 'reload schema';

COMMIT;
