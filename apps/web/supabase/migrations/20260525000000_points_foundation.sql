-- ============================================================================
-- 포인트 시스템 기반 인프라 (Phase 1)
--
-- 컨셉:
--  - 활동(글/댓글/매물) → pending 거래 → 24h 평가 → confirmed/reverted
--  - Reputation Score (0~100) 로 적립률 변동
--  - Layered Defense: 작성/적립/평가/사용/사후 5단계 검증
--
-- Feature Flag 'monetization.points' 가 OFF 인 동안에는 적립 X.
-- 모든 정책(룰/한도/사용처)은 DB 값 — 코드 배포 없이 관리자가 조정.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. point_transactions — 모든 적립/사용/회수 거래 기록
-- ============================================================================
CREATE TABLE IF NOT EXISTS point_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plaza_id TEXT NOT NULL,
  -- 거래 종류
  type TEXT NOT NULL CHECK (type IN (
    'earn',           -- 적립 (활동 보상)
    'spend',          -- 사용 (결제/교환)
    'revert',         -- 회수 (신고/삭제 시)
    'expire',         -- 만료
    'manual_adjust',  -- 관리자 수동 조정
    'penalty',        -- 페널티 차감
    'event'           -- 이벤트 보상
  )),
  amount INTEGER NOT NULL,            -- 양수 (절대값) — type 으로 +/- 결정
  -- 어떤 활동/리소스로 인한 거래인지
  source TEXT NOT NULL,               -- 'post.create' | 'comment.create' | 'group_buying.purchase' | ...
  source_id UUID,                     -- 연결된 게시글/매물 ID
  rule_id TEXT,                       -- 적용된 적립 규칙 ID
  -- 평가 상태
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',     -- 평가 대기 중 (24h)
    'confirmed',   -- 평가 통과 → 잔액 반영
    'reverted'     -- 평가 실패 → 회수
  )),
  evaluation_at TIMESTAMPTZ,          -- 평가 예정 시각
  confirmed_at TIMESTAMPTZ,
  reverted_at TIMESTAMPTZ,
  reverted_reason TEXT,
  -- 추가 정보 (예: 어떤 신고로 회수됐는지)
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL  -- 관리자 수동 조정 시 admin id
);

CREATE INDEX IF NOT EXISTS idx_point_tx_user ON point_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_point_tx_plaza ON point_transactions(plaza_id);
CREATE INDEX IF NOT EXISTS idx_point_tx_status ON point_transactions(status);
CREATE INDEX IF NOT EXISTS idx_point_tx_eval ON point_transactions(evaluation_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_point_tx_source ON point_transactions(source, source_id);
CREATE INDEX IF NOT EXISTS idx_point_tx_user_status ON point_transactions(user_id, status);

COMMENT ON TABLE point_transactions IS '포인트 거래 — 모든 적립/사용/회수 기록.';

-- ============================================================================
-- 2. user_points — 사용자별 잔액 캐시 + Reputation Score
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_points (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plaza_id TEXT NOT NULL,
  available INTEGER NOT NULL DEFAULT 0,         -- 사용 가능 잔액
  pending INTEGER NOT NULL DEFAULT 0,           -- 평가 대기 중
  lifetime_earned INTEGER NOT NULL DEFAULT 0,   -- 누적 적립
  lifetime_spent INTEGER NOT NULL DEFAULT 0,    -- 누적 사용
  lifetime_reverted INTEGER NOT NULL DEFAULT 0, -- 누적 회수
  -- 신뢰도 (0~100, 적립률에 영향)
  reputation_score INTEGER NOT NULL DEFAULT 100 CHECK (reputation_score >= 0 AND reputation_score <= 100),
  -- 정지 / 동결
  is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  suspended_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, plaza_id)
);

CREATE INDEX IF NOT EXISTS idx_user_points_plaza ON user_points(plaza_id);
CREATE INDEX IF NOT EXISTS idx_user_points_reputation ON user_points(reputation_score)
  WHERE reputation_score < 50;

COMMENT ON TABLE user_points IS '사용자 포인트 잔액 + 신뢰도 점수.';
COMMENT ON COLUMN user_points.reputation_score IS '0~100. 80+ 100% 적립, 50~79 70%, 30~49 30%, 0~29 정지.';

-- ============================================================================
-- 3. point_rules — 적립 규칙 (관리자 조정 가능)
-- ============================================================================
CREATE TABLE IF NOT EXISTS point_rules (
  id TEXT PRIMARY KEY,                    -- 'post.create' | 'comment.create' | ...
  display_name TEXT NOT NULL,
  amount INTEGER NOT NULL,                -- 적립 포인트
  daily_cap INTEGER,                      -- 하루 최대 N회 (null = 무제한)
  weekly_cap INTEGER,
  cooldown_seconds INTEGER NOT NULL DEFAULT 0,  -- 액션 간 최소 간격
  -- 품질 요건 (jsonb)
  -- { min_length: 50, must_have_image: true, min_views_for_confirm: 5 }
  quality_threshold JSONB DEFAULT '{}'::jsonb,
  -- 평가 대기 시간 (시간 단위, 0 이면 즉시 confirm)
  evaluation_period_hours INTEGER NOT NULL DEFAULT 24,
  -- 적립 자격
  required_account_age_days INTEGER NOT NULL DEFAULT 7,
  required_phone_verified BOOLEAN NOT NULL DEFAULT TRUE,
  required_email_verified BOOLEAN NOT NULL DEFAULT TRUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 초기 규칙 시드
INSERT INTO point_rules (id, display_name, amount, daily_cap, cooldown_seconds, quality_threshold, evaluation_period_hours, required_account_age_days, description) VALUES
  ('post.create',        '게시글 작성',     10,  5,  300,  '{"min_length": 50}'::jsonb,                                24, 7, '게시판 글 작성 시 적립'),
  ('comment.create',     '댓글 작성',       1,   20, 30,   '{"min_length": 10}'::jsonb,                                0,  7, '댓글 작성 시 즉시 적립'),
  ('property.create',    '부동산 매물 등록', 30,  3,  3600, '{"must_have_image": true}'::jsonb,                         24, 7, '부동산 매물 등록 시 적립'),
  ('secondhand.create',  '중고거래 등록',   10,  3,  600,  '{"must_have_image": true, "min_length": 20}'::jsonb,       24, 7, '중고거래 글 등록 시 적립'),
  ('sharing.create',     '나눔 등록',       20,  3,  3600, '{"must_have_image": true}'::jsonb,                         24, 7, '나눔 글 등록 시 적립'),
  ('group_buying.create','공구 등록',       30,  2,  7200, '{"must_have_image": true, "min_length": 30}'::jsonb,       24, 7, '공동구매 등록 시 적립'),
  ('local_food.create',  '로컬푸드 등록',   30,  2,  7200, '{"must_have_image": true, "min_length": 30}'::jsonb,       24, 7, '로컬푸드 등록 시 적립'),
  ('jobs.create',        '구인구직 등록',   15,  3,  3600, '{"min_length": 30}'::jsonb,                                24, 7, '구인구직 글 등록 시 적립'),
  ('new_store.create',   '신장개업 등록',   30,  2,  3600, '{"must_have_image": true, "min_length": 30}'::jsonb,       24, 7, '신장개업 등록 시 적립 (사장님)'),
  ('club.create',        '모임 개설',       20,  2,  3600, '{"min_length": 30}'::jsonb,                                24, 7, '모임 개설 시 적립'),
  ('like.received',      '좋아요 받기',     1,   30, 0,    '{}'::jsonb,                                                0,  0, '내 글에 좋아요 받을 때마다'),
  ('signup.bonus',       '가입 보너스',     100, 1,  0,    '{}'::jsonb,                                                0,  7, '첫 가입 (휴대폰 인증 + 7일 후)'),
  ('daily.login',        '일일 출석',       5,   1,  86400,'{}'::jsonb,                                                0,  0, '하루 1회 로그인 시 적립')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE point_rules IS '활동별 적립 규칙. 관리자 페이지에서 조정.';

-- ============================================================================
-- 4. point_daily_counters — 일/주 한도 추적
-- ============================================================================
CREATE TABLE IF NOT EXISTS point_daily_counters (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL REFERENCES point_rules(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, rule_id, date)
);

CREATE INDEX IF NOT EXISTS idx_point_counters_date ON point_daily_counters(date);

COMMENT ON TABLE point_daily_counters IS '일일 적립 한도 추적용. 자정 지나면 새 row.';

-- ============================================================================
-- 5. point_redemption_settings — 사용처 정책 (관리자 조정)
-- ============================================================================
CREATE TABLE IF NOT EXISTS point_redemption_settings (
  category TEXT PRIMARY KEY,                  -- 'group_buying' | 'local_food' | 'boost' | ...
  display_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  max_redemption_pct INTEGER NOT NULL DEFAULT 30 CHECK (max_redemption_pct >= 0 AND max_redemption_pct <= 100),
  exchange_rate INTEGER NOT NULL DEFAULT 1,   -- 1 포인트 = N 원
  daily_limit_pt INTEGER,                     -- 일일 사용 한도 (null = 무제한)
  min_balance_required INTEGER NOT NULL DEFAULT 0,  -- 최소 잔액 요구
  required_account_age_days INTEGER NOT NULL DEFAULT 30,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO point_redemption_settings (category, display_name, max_redemption_pct, daily_limit_pt, description) VALUES
  ('group_buying', '공동구매',       30, 5000,  '결제액의 30% 까지 포인트 사용 가능'),
  ('local_food',   '로컬푸드',       30, 5000,  '결제액의 30% 까지 포인트 사용 가능'),
  ('boost',        '매물 부스트',    100, 10000, '부스트 결제 100% 포인트로 가능'),
  ('ai_video',     'AI 영상 크레딧', 100, 5000,  'AI 영상 크레딧 100% 포인트 사용'),
  ('event',        '이벤트 응모',    100, 1000,  '이벤트 응모권 교환 (정액)'),
  ('giftcard',     '기프티콘 교환',  100, 10000, '커피/편의점 기프티콘 교환')
ON CONFLICT (category) DO NOTHING;

COMMENT ON TABLE point_redemption_settings IS '카테고리별 포인트 사용 정책.';

-- ============================================================================
-- updated_at 트리거 (이미 billing 마이그레이션에 함수 있음)
-- ============================================================================
DO $$
DECLARE
  t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'billing_set_updated_at') THEN
    FOREACH t IN ARRAY ARRAY[
      'point_transactions','user_points','point_rules','point_redemption_settings'
    ] LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', t, t);
      EXECUTE format(
        'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I '
        'FOR EACH ROW EXECUTE FUNCTION billing_set_updated_at()',
        t, t
      );
    END LOOP;
  END IF;
END $$;

-- ============================================================================
-- Feature Flag 추가
-- ============================================================================
INSERT INTO feature_flags (key, enabled, description) VALUES
  ('monetization.points', FALSE, '포인트 시스템 (글쓰기 적립 + 결제 사용)')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- RLS 정책
-- ============================================================================
ALTER TABLE point_transactions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_points                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_rules                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_daily_counters        ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_redemption_settings   ENABLE ROW LEVEL SECURITY;

-- ----- point_transactions: 본인만 읽기, 관리자 전체 -----
DROP POLICY IF EXISTS "point_tx read own" ON point_transactions;
CREATE POLICY "point_tx read own" ON point_transactions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

DROP POLICY IF EXISTS "point_tx admin only write" ON point_transactions;
CREATE POLICY "point_tx admin only write" ON point_transactions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- ----- user_points: 본인만 읽기 (잔액), 관리자 전체 -----
DROP POLICY IF EXISTS "user_points read own" ON user_points;
CREATE POLICY "user_points read own" ON user_points
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

DROP POLICY IF EXISTS "user_points admin manage" ON user_points;
CREATE POLICY "user_points admin manage" ON user_points
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- ----- point_rules: 모두 읽기 (포인트 안내 페이지용), 관리자만 쓰기 -----
DROP POLICY IF EXISTS "point_rules read all" ON point_rules;
CREATE POLICY "point_rules read all" ON point_rules FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "point_rules admin write" ON point_rules;
CREATE POLICY "point_rules admin write" ON point_rules
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- ----- point_redemption_settings: 모두 읽기, 관리자만 쓰기 -----
DROP POLICY IF EXISTS "point_redemption read all" ON point_redemption_settings;
CREATE POLICY "point_redemption read all" ON point_redemption_settings FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "point_redemption admin write" ON point_redemption_settings;
CREATE POLICY "point_redemption admin write" ON point_redemption_settings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- ----- point_daily_counters: 관리자 전용 (서버사이드만 조작) -----
DROP POLICY IF EXISTS "point_counters admin only" ON point_daily_counters;
CREATE POLICY "point_counters admin only" ON point_daily_counters
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

NOTIFY pgrst, 'reload schema';

COMMIT;
