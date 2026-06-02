-- ============================================================================
-- 올리기권 (Bump Tickets) — 사용자가 미리 사놓고 쓰는 묶음 결제
--
-- 컨셉:
--   - 1장 = 한 번 글 올리기
--   - 팩으로 사면 할인 (1/5/10/30 장)
--   - 포인트 또는 현금으로 충전
--   - 도메인 무관 — 1장 = 어떤 글에든 사용 가능
-- ============================================================================
BEGIN;

-- 1. 사용자 잔액 (광장 단위)
CREATE TABLE IF NOT EXISTS bump_tickets (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plaza_id TEXT NOT NULL,
  balance INT NOT NULL DEFAULT 0,
  lifetime_purchased INT NOT NULL DEFAULT 0,
  lifetime_used INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, plaza_id),
  CONSTRAINT bump_tickets_balance_nonneg CHECK (balance >= 0)
);

-- 2. 팩 (관리자 조정 가능)
CREATE TABLE IF NOT EXISTS bump_ticket_packs (
  id TEXT PRIMARY KEY,                      -- 'pack_1' | 'pack_5' | ...
  size INT NOT NULL,                         -- 장수
  krw_price INT NOT NULL,                    -- 현금 가격
  points_price INT NOT NULL,                 -- 포인트 가격
  display_label TEXT NOT NULL,
  description TEXT,                          -- "20% 할인" 같은 설명
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  CONSTRAINT bump_ticket_packs_size_pos CHECK (size > 0)
);

INSERT INTO bump_ticket_packs (id, size, krw_price, points_price, display_label, description, sort_order) VALUES
  ('pack_1',  1,  500,   50,   '1장',  '한 번 사용',                  10),
  ('pack_5',  5,  2250,  225,  '5장',  '10% 할인 — 1장당 450원',     20),
  ('pack_10', 10, 4000,  400,  '10장', '20% 할인 — 1장당 400원',     30),
  ('pack_30', 30, 10500, 1050, '30장', '30% 할인 — 1장당 350원 ⭐',  40)
ON CONFLICT (id) DO NOTHING;

-- 3. 구매 기록
CREATE TABLE IF NOT EXISTS bump_ticket_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plaza_id TEXT NOT NULL,
  pack_id TEXT NOT NULL REFERENCES bump_ticket_packs(id),
  qty INT NOT NULL,                          -- 산 장수 (= pack.size)
  payment TEXT NOT NULL CHECK (payment IN ('points', 'cash')),
  cost_points INT NOT NULL DEFAULT 0,
  cost_krw   INT NOT NULL DEFAULT 0,
  payment_id UUID,                           -- 현금 결제 시 외부 결제 참조
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bump_ticket_orders_user
  ON bump_ticket_orders(user_id, created_at DESC);

-- 4. RLS
ALTER TABLE bump_tickets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bump_ticket_packs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bump_ticket_orders  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bump_tickets own" ON bump_tickets;
CREATE POLICY "bump_tickets own" ON bump_tickets
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "bump_ticket_packs read all" ON bump_ticket_packs;
CREATE POLICY "bump_ticket_packs read all" ON bump_ticket_packs
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "bump_ticket_packs admin write" ON bump_ticket_packs;
CREATE POLICY "bump_ticket_packs admin write" ON bump_ticket_packs
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role IN ('admin','superadmin'))
  );

DROP POLICY IF EXISTS "bump_ticket_orders own" ON bump_ticket_orders;
CREATE POLICY "bump_ticket_orders own" ON bump_ticket_orders
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 5. bump_settings 에 free_per_day 정책 변경 알림 컬럼 (선택)
--    이미 결제 방식이 'free' | 'points' | 'cash' 였는데 'ticket' 추가는 코드에서 처리.

COMMIT;
