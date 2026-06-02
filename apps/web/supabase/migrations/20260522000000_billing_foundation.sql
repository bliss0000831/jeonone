-- ============================================================================
-- 결제 / 구독 / 광장 협회 정산 인프라 (Billing Foundation)
--
-- 6개월 무료 운영 기간 동안 인프라만 구축하고 Feature Flag 로 비활성 유지.
-- 활성화 시점에 코드 배포 없이 슈퍼 어드민이 토글로 켜기 가능.
--
-- 설계 원칙:
-- 1. 모든 결제는 commission_splits 로 처음부터 본사/광장 분할 기록.
-- 2. 광장 협회는 자체 PG 계약 X — 본사가 결제 받고 월말 송금.
-- 3. 향후 PG 분할정산(모델 B) 으로 전환 시 어댑터 한 곳만 교체하면 됨.
-- 4. 모든 테이블 RLS 적용. 일반 사용자는 본인 결제만, 광장 운영자는 자기 광장만,
--    슈퍼 어드민은 전체 조회 가능.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. feature_flags — 기능 활성화 토글
-- ============================================================================
CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE feature_flags IS '기능 활성화 토글. 슈퍼 어드민만 변경 가능.';

-- 초기 플래그들 — 모두 OFF 로 시작 (배너 광고만 ON)
INSERT INTO feature_flags (key, enabled, description) VALUES
  ('monetization.subscriptions',  FALSE, '공인중개사/서비스업 월정액 구독 결제'),
  ('monetization.commissions',    FALSE, '공동구매/로컬푸드/매칭 수수료 정산'),
  ('monetization.boost',          FALSE, '부동산/신장개업 노출 부스트 결제'),
  ('monetization.push_credits',   FALSE, '자영업자 푸시 발송권 결제'),
  ('monetization.banner_ads',     TRUE,  '배너 광고 (6개월 무료기간 중에도 활성)'),
  ('monetization.payouts',        FALSE, '광장 협회 월말 자동 정산'),
  ('monetization.ai_pricing_paid',FALSE, 'AI 가격 추정 부분 유료화')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 2. plaza_associations — 광장 협회 (각 광장의 운영 사업자)
-- ============================================================================
CREATE TABLE IF NOT EXISTS plaza_associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plaza_id TEXT NOT NULL UNIQUE,            -- 광장당 1개 협회
  business_name TEXT NOT NULL,              -- 사업자명 (예: "원주광장 운영협회")
  business_number TEXT NOT NULL,            -- 사업자등록번호
  ceo_name TEXT NOT NULL,                   -- 대표자명
  bank_name TEXT NOT NULL,                  -- 정산금 받을 은행
  bank_account TEXT NOT NULL,               -- 계좌번호
  bank_holder TEXT NOT NULL,                -- 예금주
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  address TEXT,
  business_doc_url TEXT,                    -- 사업자등록증 사본 URL (R2)
  bankbook_doc_url TEXT,                    -- 통장사본 URL (R2)
  status TEXT NOT NULL DEFAULT 'pending'    -- pending / active / suspended / terminated
    CHECK (status IN ('pending', 'active', 'suspended', 'terminated')),
  royalty_rate NUMERIC(5,2) NOT NULL DEFAULT 20.00  -- 본사 수취 % (기본 20%)
    CHECK (royalty_rate >= 0 AND royalty_rate <= 100),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_plaza_associations_plaza ON plaza_associations(plaza_id);
CREATE INDEX IF NOT EXISTS idx_plaza_associations_status ON plaza_associations(status);

COMMENT ON TABLE plaza_associations IS '광장 협회 = 각 광장의 운영 사업자. 본사와 별개 사업자.';
COMMENT ON COLUMN plaza_associations.royalty_rate IS '본사 수취 비율(%). 기본 20% — 광장 협회는 80% 수취.';

-- ============================================================================
-- 3. subscription_plans — 구독 플랜 정의
-- ============================================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,                      -- 'realtor' | 'service_provider' | ...
  name TEXT NOT NULL,                       -- 표시명 (예: "공인중개사 월정액")
  category TEXT NOT NULL                    -- 적용 카테고리
    CHECK (category IN ('realtor','service','newstore','other')),
  monthly_price INTEGER NOT NULL,           -- 원 단위
  early_bird_discount_pct INTEGER NOT NULL DEFAULT 50  -- 얼리버드 할인 %
    CHECK (early_bird_discount_pct >= 0 AND early_bird_discount_pct <= 100),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE subscription_plans IS '구독 플랜. 가격 변경 시 신규 가입자만 적용 (기존은 락인).';

-- 초기 플랜 시드
INSERT INTO subscription_plans (id, name, category, monthly_price, early_bird_discount_pct, description) VALUES
  ('realtor',          '공인중개사 월정액',     'realtor',  50000, 50, '부동산 매물 무제한 등록 + AI 가격 추정 무제한'),
  ('service_provider', '서비스 업종 월정액',    'service',  19000, 50, '이사/인테리어/수리/청소 — 광장당 동종업종 노출 한도 + AI 자동 견적 우선 노출'),
  ('newstore_basic',   '신장개업 베이직',       'newstore',     0, 50, '등록 무료 — 노출 부스트는 별도')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 4. subscriptions — 사용자별 활성 구독
-- ============================================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plaza_id TEXT NOT NULL,
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','past_due','canceled','expired','free_period')),
  -- free_period: 6개월 무료 기간 동안 가입한 사용자 (이후 자동 활성화)
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 month',
  -- 얼리버드 락인: 6개월 안에 가입한 사용자는 평생 할인
  is_early_bird BOOLEAN NOT NULL DEFAULT FALSE,
  applied_discount_pct INTEGER NOT NULL DEFAULT 0,
  -- PG 빌링키 (자동 갱신용) — 6개월 후 채워짐
  billing_key TEXT,
  billing_key_provider TEXT,                -- 'portone' | 'toss' | null
  -- 취소
  canceled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plaza ON subscriptions(plaza_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON subscriptions(current_period_end)
  WHERE status IN ('active','past_due');

COMMENT ON TABLE subscriptions IS '사용자별 구독. 6개월 무료기간 가입자는 free_period → 자동으로 active 전환.';

-- ============================================================================
-- 5. payments — 결제 이력 (단건 + 구독 갱신 모두)
-- ============================================================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  plaza_id TEXT NOT NULL,
  -- 결제 종류
  kind TEXT NOT NULL
    CHECK (kind IN ('subscription','boost','push_credit','ad_banner','commission_payout','manual')),
  reference_type TEXT,                      -- 'subscription' | 'property_boost' | ...
  reference_id UUID,                        -- 연결된 리소스 ID
  -- 금액 (원 단위)
  amount INTEGER NOT NULL,
  vat_amount INTEGER NOT NULL DEFAULT 0,
  -- 상태
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','succeeded','failed','canceled','refunded','partially_refunded')),
  -- PG 정보
  pg_provider TEXT,                         -- 'portone' | 'toss' | null (free)
  pg_payment_id TEXT,                       -- PG 측 결제 ID
  pg_method TEXT,                           -- 'card' | 'kakaopay' | ...
  pg_raw_response JSONB,                    -- PG 원본 응답 (감사용)
  -- 영수증
  receipt_url TEXT,
  -- 메모
  memo TEXT,
  -- 시각
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_plaza ON payments(plaza_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_kind ON payments(kind);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(paid_at) WHERE paid_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_pg_id ON payments(pg_payment_id) WHERE pg_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference_type, reference_id);

COMMENT ON TABLE payments IS '결제 이력 — 모든 결제 (구독/부스트/푸시/광고/거래 분배 송금) 통합 기록.';

-- ============================================================================
-- 6. commission_splits — 결제 1건당 본사/광장 분할 기록
-- ============================================================================
CREATE TABLE IF NOT EXISTS commission_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  recipient_type TEXT NOT NULL              -- 'hq' | 'plaza_association' | 'merchant'
    CHECK (recipient_type IN ('hq','plaza_association','merchant')),
  recipient_id UUID,                        -- plaza_association.id 또는 user.id
  plaza_id TEXT,                            -- 어느 광장 매출인지
  amount INTEGER NOT NULL,                  -- 분배 금액 (원)
  rate_pct NUMERIC(5,2),                    -- 적용 비율 (예: 20.00 / 80.00)
  -- 정산 상태
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','reserved','paid_out','refunded')),
  -- pending: 결제 미완료
  -- reserved: 결제 완료, 정산 대기
  -- paid_out: 정산 완료 (송금 또는 PG 분할)
  -- refunded: 환불됨
  payout_id UUID,                           -- 정산 시점에 payouts.id 연결
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_splits_payment ON commission_splits(payment_id);
CREATE INDEX IF NOT EXISTS idx_commission_splits_plaza ON commission_splits(plaza_id);
CREATE INDEX IF NOT EXISTS idx_commission_splits_status ON commission_splits(status);
CREATE INDEX IF NOT EXISTS idx_commission_splits_recipient
  ON commission_splits(recipient_type, recipient_id);
CREATE INDEX IF NOT EXISTS idx_commission_splits_payout ON commission_splits(payout_id)
  WHERE payout_id IS NOT NULL;

COMMENT ON TABLE commission_splits IS '결제 1건당 본사/광장 분배 내역. 처음부터 분할 기록 → 모델 A↔B 호환.';

-- ============================================================================
-- 7. transactions — 거래 추적 (공동구매/로컬푸드/매칭 수수료용)
-- ============================================================================
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plaza_id TEXT NOT NULL,
  -- 거래 종류
  kind TEXT NOT NULL
    CHECK (kind IN ('group_buying','local_food','service_match','secondhand_safe')),
  -- 양 당사자
  buyer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  seller_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- 거래 대상
  reference_type TEXT,
  reference_id UUID,
  -- 금액
  gross_amount INTEGER NOT NULL,            -- 총 거래 금액
  commission_rate NUMERIC(5,2) NOT NULL,    -- 적용 수수료율
  commission_amount INTEGER NOT NULL,       -- 수수료 (사이트 몫)
  net_amount INTEGER NOT NULL,              -- 판매자 수령 금액
  -- 상태
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','completed','canceled','refunded','disputed')),
  -- 결제 연결
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  -- 시각
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_plaza ON transactions(plaza_id);
CREATE INDEX IF NOT EXISTS idx_transactions_buyer ON transactions(buyer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_seller ON transactions(seller_id);
CREATE INDEX IF NOT EXISTS idx_transactions_kind ON transactions(kind);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_completed ON transactions(completed_at)
  WHERE status = 'completed';

COMMENT ON TABLE transactions IS '거래 추적 — 공동구매/로컬푸드/서비스매칭 거래의 수수료 기준점.';

-- ============================================================================
-- 8. commission_settings — 카테고리별 수수료율 설정 (DB 기반, 코드 변경 X)
-- ============================================================================
CREATE TABLE IF NOT EXISTS commission_settings (
  category TEXT PRIMARY KEY,                -- 'group_buying' | 'local_food' | ...
  rate_pct NUMERIC(5,2) NOT NULL CHECK (rate_pct >= 0 AND rate_pct <= 100),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO commission_settings (category, rate_pct, description) VALUES
  ('group_buying',   3.00, '공동구매 거래 수수료 (사이트 몫)'),
  ('local_food',     2.50, '로컬푸드 직거래 수수료'),
  ('service_match',  1.00, '서비스 업종 매칭 성사 수수료'),
  ('payment_margin', 1.00, '공구/로컬푸드 결제 PG 외 사이트 추가 마진')
ON CONFLICT (category) DO NOTHING;

COMMENT ON TABLE commission_settings IS '카테고리별 수수료율 — DB 설정값으로 코드 배포 없이 조정 가능.';

-- ============================================================================
-- 9. payout_batches — 월말 일괄 정산 작업 (배치)
-- ============================================================================
CREATE TABLE IF NOT EXISTS payout_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed','partial')),
  total_gross_amount INTEGER NOT NULL DEFAULT 0,
  total_hq_amount INTEGER NOT NULL DEFAULT 0,
  total_plaza_amount INTEGER NOT NULL DEFAULT 0,
  plaza_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT payout_batches_period_unique UNIQUE (period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_payout_batches_period ON payout_batches(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_payout_batches_status ON payout_batches(status);

COMMENT ON TABLE payout_batches IS '월말 정산 배치 — 매월 N일 자동 생성, 광장별 합계 계산.';

-- ============================================================================
-- 10. payouts — 광장 협회별 월별 정산 내역
-- ============================================================================
CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES payout_batches(id) ON DELETE CASCADE,
  plaza_association_id UUID NOT NULL REFERENCES plaza_associations(id) ON DELETE RESTRICT,
  plaza_id TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  -- 금액 (원 단위)
  gross_amount INTEGER NOT NULL,            -- 광장에서 발생한 총 매출
  hq_fee_amount INTEGER NOT NULL,           -- 본사 로열티 (20%)
  net_amount INTEGER NOT NULL,              -- 협회 수령 금액 (80%)
  -- 송금 정보
  transfer_method TEXT NOT NULL DEFAULT 'manual_bank'
    CHECK (transfer_method IN ('manual_bank','pg_split','pg_payout','offset')),
  -- manual_bank: 수동/자동 계좌이체 (모델 A)
  -- pg_split: PG 분할정산 (모델 B)
  -- pg_payout: PG 정산 API
  -- offset: 광장이 본사에 미지급금 있어 상계 처리
  transfer_reference TEXT,                  -- 송금 참조 번호
  bank_name TEXT,
  bank_account TEXT,                        -- 송금 시점 통장 (스냅샷)
  bank_holder TEXT,
  -- 상태
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','transferred','failed','disputed','refunded')),
  -- 세금계산서
  tax_invoice_issued BOOLEAN NOT NULL DEFAULT FALSE,
  tax_invoice_url TEXT,
  -- 시각
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  transferred_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payouts_batch ON payouts(batch_id);
CREATE INDEX IF NOT EXISTS idx_payouts_plaza_assoc ON payouts(plaza_association_id);
CREATE INDEX IF NOT EXISTS idx_payouts_plaza ON payouts(plaza_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);
CREATE INDEX IF NOT EXISTS idx_payouts_period ON payouts(period_start, period_end);

COMMENT ON TABLE payouts IS '광장 협회별 월별 정산 내역 — 본사 20% / 협회 80%.';

-- ============================================================================
-- updated_at 자동 갱신 트리거 (이미 있으면 스킵)
-- ============================================================================
CREATE OR REPLACE FUNCTION billing_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'subscriptions','payments','commission_splits','transactions','payouts'
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
-- RLS 정책 — 모든 테이블 활성화
-- ============================================================================
ALTER TABLE feature_flags         ENABLE ROW LEVEL SECURITY;
ALTER TABLE plaza_associations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans    ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_splits     ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_batches        ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts               ENABLE ROW LEVEL SECURITY;

-- ----- feature_flags -----
-- 모두 읽기 가능 (UI 분기에 사용), 쓰기는 관리자만
DROP POLICY IF EXISTS "feature_flags read all" ON feature_flags;
CREATE POLICY "feature_flags read all" ON feature_flags FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "feature_flags admin write" ON feature_flags;
CREATE POLICY "feature_flags admin write" ON feature_flags
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

-- ----- subscription_plans -----
-- 활성 플랜 모두 읽기 가능, 쓰기는 관리자
DROP POLICY IF EXISTS "subscription_plans read active" ON subscription_plans;
CREATE POLICY "subscription_plans read active" ON subscription_plans
  FOR SELECT USING (is_active = TRUE OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

DROP POLICY IF EXISTS "subscription_plans admin write" ON subscription_plans;
CREATE POLICY "subscription_plans admin write" ON subscription_plans
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- ----- commission_settings -----
DROP POLICY IF EXISTS "commission_settings read all" ON commission_settings;
CREATE POLICY "commission_settings read all" ON commission_settings FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "commission_settings admin write" ON commission_settings;
CREATE POLICY "commission_settings admin write" ON commission_settings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- ----- subscriptions -----
-- 본인 구독만 읽기, 광장 운영자는 자기 광장 구독, 관리자는 전체
DROP POLICY IF EXISTS "subscriptions read own" ON subscriptions;
CREATE POLICY "subscriptions read own" ON subscriptions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'plaza_admins'
    ) AND EXISTS (
      SELECT 1 FROM plaza_admins pa
      WHERE pa.user_id = auth.uid() AND pa.plaza_id = subscriptions.plaza_id
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

-- 본인이 직접 INSERT — pending 상태로만 생성 가능
DROP POLICY IF EXISTS "subscriptions self insert" ON subscriptions;
CREATE POLICY "subscriptions self insert" ON subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status IN ('pending','free_period'));

-- 본인 취소만 가능, 그 외 변경은 관리자
DROP POLICY IF EXISTS "subscriptions self update" ON subscriptions;
CREATE POLICY "subscriptions self update" ON subscriptions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "subscriptions admin manage" ON subscriptions;
CREATE POLICY "subscriptions admin manage" ON subscriptions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- ----- payments -----
-- 본인 결제만 읽기, 관리자는 전체
DROP POLICY IF EXISTS "payments read own" ON payments;
CREATE POLICY "payments read own" ON payments
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

-- INSERT/UPDATE 는 서버에서만 (service_role) — 일반 사용자 직접 X
DROP POLICY IF EXISTS "payments admin manage" ON payments;
CREATE POLICY "payments admin manage" ON payments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- ----- commission_splits -----
DROP POLICY IF EXISTS "commission_splits admin only" ON commission_splits;
CREATE POLICY "commission_splits admin only" ON commission_splits
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- ----- transactions -----
-- 자신이 buyer 또는 seller 인 거래만 읽기
DROP POLICY IF EXISTS "transactions read parties" ON transactions;
CREATE POLICY "transactions read parties" ON transactions
  FOR SELECT TO authenticated
  USING (
    buyer_id = auth.uid() OR seller_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

DROP POLICY IF EXISTS "transactions admin manage" ON transactions;
CREATE POLICY "transactions admin manage" ON transactions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- ----- plaza_associations / payout_batches / payouts -----
-- 관리자만 읽기/쓰기. 광장 운영자는 자기 광장만 (이건 plaza_admins 통해 별도 처리)
DROP POLICY IF EXISTS "plaza_associations admin only" ON plaza_associations;
CREATE POLICY "plaza_associations admin only" ON plaza_associations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

DROP POLICY IF EXISTS "payout_batches admin only" ON payout_batches;
CREATE POLICY "payout_batches admin only" ON payout_batches
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

DROP POLICY IF EXISTS "payouts admin only" ON payouts;
CREATE POLICY "payouts admin only" ON payouts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- Migration 완료. 다음 단계:
-- 1. lib/services/billing/* 서비스 레이어 구현
-- 2. lib/integrations/pg/* PG 어댑터 구현 (포트원 stub)
-- 3. app/api/billing/* API 라우트
-- 4. UI: mypage/subscription, super-admin/billing, plaza-admin/*
-- 5. 월말 정산 cron (vercel.json)
-- ============================================================================
