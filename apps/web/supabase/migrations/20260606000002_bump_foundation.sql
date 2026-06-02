-- ============================================================================
-- 글 올리기 (Bump) — 번개장터 스타일
--
-- 컨셉:
--  - 본인 글을 최신순 맨 위로 다시 올림 (boost 와 다름: 항상 최상단 X)
--  - 무료 N회/일 + 추가 결제 (포인트 또는 현금)
--  - 정렬: COALESCE(bumped_at, created_at) DESC
--
-- 이 마이그레이션 범위:
--  - properties (부동산)
--  - secondhand (중고거래)
-- 다른 도메인은 후속 마이그레이션에서 동일 패턴으로 확장.
-- ============================================================================

BEGIN;

-- 1. bumped_at + effective_at (generated) 컬럼 — Supabase JS 가
--    COALESCE 정렬을 직접 못 해서, 정렬 키를 generated stored 컬럼으로 둠.
ALTER TABLE properties        ADD COLUMN IF NOT EXISTS bumped_at TIMESTAMPTZ;
ALTER TABLE secondhand_posts  ADD COLUMN IF NOT EXISTS bumped_at TIMESTAMPTZ;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS effective_at TIMESTAMPTZ
  GENERATED ALWAYS AS (COALESCE(bumped_at, created_at)) STORED;
ALTER TABLE secondhand_posts
  ADD COLUMN IF NOT EXISTS effective_at TIMESTAMPTZ
  GENERATED ALWAYS AS (COALESCE(bumped_at, created_at)) STORED;

CREATE INDEX IF NOT EXISTS idx_properties_effective
  ON properties(plaza_id, effective_at DESC)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_secondhand_effective
  ON secondhand_posts(plaza_id, effective_at DESC)
  WHERE status = 'active';

-- 2. bump_settings — 도메인별 가격/무료한도 (관리자 조정)
CREATE TABLE IF NOT EXISTS bump_settings (
  target_type TEXT PRIMARY KEY,
  free_per_day INT NOT NULL DEFAULT 1,
  cooldown_seconds INT NOT NULL DEFAULT 1800,   -- 같은 글 30분 내 재올리기 X
  points_cost INT NOT NULL DEFAULT 50,           -- 포인트로 살 때
  krw_cost INT NOT NULL DEFAULT 500,             -- 현금 결제 시
  required_account_age_days INT NOT NULL DEFAULT 7,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO bump_settings (target_type, free_per_day, cooldown_seconds, points_cost, krw_cost, required_account_age_days) VALUES
  ('property',   2, 1800, 50, 500, 7),
  ('secondhand', 2, 1800, 30, 300, 7)
ON CONFLICT (target_type) DO NOTHING;

-- 3. bump_daily — 일일 사용 카운터 (계정 × 광장 × 도메인 × 날짜)
CREATE TABLE IF NOT EXISTS bump_daily (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plaza_id   TEXT NOT NULL,
  target_type TEXT NOT NULL,
  date       DATE NOT NULL,
  free_used  INT NOT NULL DEFAULT 0,
  paid_used  INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, plaza_id, target_type, date)
);

-- 4. bump_history — 모든 올리기 기록
CREATE TABLE IF NOT EXISTS bump_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plaza_id   TEXT NOT NULL,
  target_type TEXT NOT NULL,                  -- 'property' | 'secondhand'
  target_id   UUID NOT NULL,
  payment    TEXT NOT NULL CHECK (payment IN ('free', 'points', 'cash')),
  cost_points INT NOT NULL DEFAULT 0,
  cost_krw   INT NOT NULL DEFAULT 0,
  payment_id UUID,                            -- 현금 결제 시 payments.id 참조 (Phase C)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bump_history_user
  ON bump_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bump_history_target
  ON bump_history(target_type, target_id);

-- 5. RLS
ALTER TABLE bump_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bump_daily     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bump_history   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bump_settings read all" ON bump_settings;
CREATE POLICY "bump_settings read all" ON bump_settings FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "bump_settings admin write" ON bump_settings;
CREATE POLICY "bump_settings admin write" ON bump_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role IN ('admin','superadmin'))
  );

-- bump_daily / bump_history: 본인 것만 (서버에서 service role 로 쓸 거라 strict)
DROP POLICY IF EXISTS "bump_daily own" ON bump_daily;
CREATE POLICY "bump_daily own" ON bump_daily
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "bump_history own" ON bump_history;
CREATE POLICY "bump_history own" ON bump_history
  FOR SELECT TO authenticated USING (user_id = auth.uid());

COMMIT;
