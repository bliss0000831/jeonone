-- ============================================================================
-- 노출 부스트 + 업자 자동 차단 시스템
--
-- 1) 부스트 (Boost) — 부동산/신장개업 매물의 N일 상단 노출 결제 상품
--    Feature Flag 'monetization.boost' OFF 시 결제 X (안내 표시만)
--
-- 2) 업자 자동 차단 — 중고거래 신뢰 자산 보호
--    정책: 중고거래는 일반 사용자(C2C) 전용. 사업자(B2C)는 입장 자체 금지.
--    - 자동 탐지 (대량 등록 등) → user_flags 자동 생성
--    - 관리자가 검토 → 경고 / 계정 정지
--    - 자진 신고 / 사업자 마크 / 별도 카테고리는 운영하지 않음 (정책상 차단)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. boost_orders — 부스트 주문 (매물별 N일 상단 노출)
-- ============================================================================
CREATE TABLE IF NOT EXISTS boost_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plaza_id TEXT NOT NULL,
  -- 부스트 대상
  target_type TEXT NOT NULL CHECK (target_type IN (
    'property',         -- 부동산 매물
    'new_store',        -- 신장개업 점포
    'job',              -- 구인구직
    'group_buying',     -- 공동구매
    'club'              -- 모임
  )),
  target_id UUID NOT NULL,
  -- 부스트 종류
  tier TEXT NOT NULL CHECK (tier IN (
    'main_banner_3d',
    'main_banner_7d',
    'category_top_3d',
    'category_top_7d',
    'card_news_push'
  )),
  amount INTEGER NOT NULL,
  -- 부스트 활성 기간
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','active','expired','canceled','refunded'
  )),
  -- payment_id: payments 테이블이 존재할 경우에만 FK 추가 (마이그레이션 22 의존성 완화)
  payment_id UUID,
  free_period BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- payments 테이블이 있으면 FK 추가
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='payments'
  ) THEN
    -- 이미 동일 제약이 있으면 스킵
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'boost_orders_payment_id_fkey'
        AND table_name = 'boost_orders'
    ) THEN
      ALTER TABLE boost_orders
        ADD CONSTRAINT boost_orders_payment_id_fkey
        FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_boost_orders_user ON boost_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_boost_orders_target ON boost_orders(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_boost_orders_active
  ON boost_orders(target_type, target_id, ends_at)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_boost_orders_plaza ON boost_orders(plaza_id);

COMMENT ON TABLE boost_orders IS '노출 부스트 주문 — 매물별 상단 노출 결제 이력.';

-- 부스트 가격 카탈로그
CREATE TABLE IF NOT EXISTS boost_pricing (
  tier TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  applicable_targets TEXT[] NOT NULL,
  duration_days INTEGER NOT NULL,
  price INTEGER NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100
);

INSERT INTO boost_pricing (tier, display_name, applicable_targets, duration_days, price, description, sort_order) VALUES
  ('category_top_3d',  '카테고리 상단 3일',  ARRAY['property','new_store','job','group_buying'], 3, 5000,  '카테고리 상단에 3일간 고정 노출', 10),
  ('category_top_7d',  '카테고리 상단 1주',  ARRAY['property','new_store','job','group_buying'], 7, 20000, '카테고리 상단에 1주일간 고정 노출', 20),
  ('main_banner_3d',   '메인 배너 3일',     ARRAY['new_store','property'],                       3, 50000, '홈/메인 배너에 3일간 노출', 30),
  ('main_banner_7d',   '메인 배너 1주',     ARRAY['new_store','property'],                       7, 100000,'홈/메인 배너에 1주일간 노출', 40),
  ('card_news_push',   'AI 카드뉴스 + 푸시', ARRAY['new_store'],                                  1, 30000, '오픈 소식을 AI 카드뉴스로 자동 생성 + 광장 사용자에게 푸시 1회', 50)
ON CONFLICT (tier) DO NOTHING;

COMMENT ON TABLE boost_pricing IS '부스트 가격 카탈로그 — DB 값으로 코드 배포 없이 조정.';

-- ============================================================================
-- 2. user_flags — 의심 패턴 자동 플래그 (관리자 검토용 → 경고/정지)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL CHECK (flag_type IN (
    'high_volume_posts',     -- 30일 내 N건 이상 등록 (업자 의심)
    'duplicate_images',      -- 동일 이미지 다중 등록
    'multi_account_ip',      -- 동일 IP 다계정
    'manual_admin',          -- 관리자 수동 플래그
    'reported_by_users'      -- 사용자 신고 누적
  )),
  severity TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low','medium','high','critical')),
  metadata JSONB DEFAULT '{}'::jsonb,
  -- 관리자 처리 (사업자 신고 유도 옵션 제거 — 정책상 사업자는 차단)
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'reviewed_clear',
    'reviewed_warning',
    'reviewed_suspended'
  )),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_flags_user ON user_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_user_flags_status ON user_flags(status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_user_flags_severity ON user_flags(severity);
CREATE INDEX IF NOT EXISTS idx_user_flags_type ON user_flags(flag_type);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_flags_open
  ON user_flags(user_id, flag_type)
  WHERE status = 'open';

COMMENT ON TABLE user_flags IS '의심 패턴 자동 플래그 — cron 으로 매일 갱신, 관리자가 검토 (경고 또는 정지).';

-- ============================================================================
-- 3. 자동 탐지 함수 — 중고거래 대량 등록자 (업자 의심)
--    secondhand_posts 테이블이 있을 때만 동작. 사업자는 차단 정책이라 자진신고
--    예외 처리 없음. 단순히 대량 등록 = 의심 사용자.
-- ============================================================================

-- 30일 내 N건 이상 등록한 사용자 자동 플래그
CREATE OR REPLACE FUNCTION detect_high_volume_users(
  threshold INTEGER DEFAULT 20,
  days_back INTEGER DEFAULT 30
) RETURNS TABLE(user_id UUID, post_count BIGINT) AS $$
BEGIN
  -- secondhand_posts 미존재 환경에서도 안전
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='secondhand_posts'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY EXECUTE format($f$
    SELECT s.user_id, COUNT(*)::BIGINT
    FROM secondhand_posts s
    WHERE s.created_at >= NOW() - ($1 || ' days')::INTERVAL
      AND s.user_id IS NOT NULL
    GROUP BY s.user_id
    HAVING COUNT(*) >= $2
  $f$) USING days_back::TEXT, threshold;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

COMMENT ON FUNCTION detect_high_volume_users IS '중고거래 30일 내 다수 등록자 탐지 — 업자 의심 (차단 대상).';

-- 자동 플래그 적용 (cron 에서 호출)
CREATE OR REPLACE FUNCTION apply_high_volume_flags(
  threshold INTEGER DEFAULT 20,
  days_back INTEGER DEFAULT 30
) RETURNS INTEGER AS $$
DECLARE
  inserted_count INTEGER := 0;
  rec RECORD;
BEGIN
  FOR rec IN SELECT * FROM detect_high_volume_users(threshold, days_back) LOOP
    INSERT INTO user_flags (user_id, flag_type, severity, metadata)
    VALUES (
      rec.user_id,
      'high_volume_posts',
      CASE
        WHEN rec.post_count >= threshold * 3 THEN 'high'
        WHEN rec.post_count >= threshold * 2 THEN 'medium'
        ELSE 'low'
      END,
      jsonb_build_object(
        'post_count', rec.post_count,
        'days_back', days_back,
        'threshold', threshold,
        'detected_at', NOW()
      )
    )
    ON CONFLICT (user_id, flag_type) WHERE status = 'open' DO UPDATE
      SET metadata = EXCLUDED.metadata,
          severity = EXCLUDED.severity,
          updated_at = NOW();

    inserted_count := inserted_count + 1;
  END LOOP;
  RETURN inserted_count;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

COMMENT ON FUNCTION apply_high_volume_flags IS '대량 등록 의심 사용자 일괄 플래그. cron 매일 호출.';

-- ============================================================================
-- updated_at 트리거 (billing_set_updated_at 함수가 마이그레이션 22 에 있음)
--    함수가 없으면 임시로 만들어 둠 (22 후행 실행 안전성)
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
  FOREACH t IN ARRAY ARRAY['boost_orders','user_flags'] LOOP
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
ALTER TABLE boost_orders   ENABLE ROW LEVEL SECURITY;
ALTER TABLE boost_pricing  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_flags     ENABLE ROW LEVEL SECURITY;

-- ----- boost_orders -----
DROP POLICY IF EXISTS "boost_orders read own" ON boost_orders;
CREATE POLICY "boost_orders read own" ON boost_orders
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

DROP POLICY IF EXISTS "boost_orders self insert" ON boost_orders;
CREATE POLICY "boost_orders self insert" ON boost_orders
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "boost_orders admin manage" ON boost_orders;
CREATE POLICY "boost_orders admin manage" ON boost_orders
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- ----- boost_pricing -----
DROP POLICY IF EXISTS "boost_pricing read all" ON boost_pricing;
CREATE POLICY "boost_pricing read all" ON boost_pricing FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "boost_pricing admin write" ON boost_pricing;
CREATE POLICY "boost_pricing admin write" ON boost_pricing
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- ----- user_flags (관리자 전용) -----
DROP POLICY IF EXISTS "user_flags admin only" ON user_flags;
CREATE POLICY "user_flags admin only" ON user_flags
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- ============================================================================
-- 마이그레이션 23 의 이전 버전이 만들었던 business_declarations 정리
-- ============================================================================
DROP TABLE IF EXISTS business_declarations CASCADE;

NOTIFY pgrst, 'reload schema';

COMMIT;
