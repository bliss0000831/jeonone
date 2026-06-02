-- ─────────────────────────────────────────────────────────────
-- AI 홍보영상 — 크레딧 시스템 & 작업 큐
--
-- 저장 단위: 포인트 (INT)
--   · 10 포인트 = 1 크레딧 (UI 표시 단위)
--   · 15초 영상 = 5 포인트 / 30초 = 10 / 60초 = 20
--   · 상품 지급 예: 1크레딧 팩 → 10 포인트, 10크레딧 팩 → 100 포인트
--
-- BETA 기간 중에는 차감 스킵 (애플리케이션 레이어에서 제어)
-- ─────────────────────────────────────────────────────────────

-- ─── profiles.video_credits (포인트 단위 정수) ──────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS video_credits INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN profiles.video_credits IS
  'AI 홍보영상 크레딧(포인트 단위). 10포인트 = 1크레딧. 15초=5pt/30초=10pt/60초=20pt';

-- ─── ai_video_jobs (작업 큐 + 결과 저장) ────────────────
CREATE TABLE IF NOT EXISTS ai_video_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 상태
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed','cancelled')),

  -- 입력 스냅샷 (매물 정보 + 옵션 전부)
  -- { images, title, propertyType, transactionType, price, deposit, monthlyRent,
  --   address, addressDetail, area, floor, totalFloors, description,
  --   duration, ratio, style, voice, bgm, highlights, ctaText }
  input JSONB NOT NULL,

  -- 차감
  credits_used INT NOT NULL DEFAULT 0,
  beta_free BOOLEAN NOT NULL DEFAULT false,

  -- 결과
  result_url TEXT,
  thumbnail_url TEXT,
  duration_seconds INT,
  error_message TEXT,

  -- 메타 (Phase C 에서 활용)
  provider TEXT,          -- 'kling' | 'runway' | 'luma' | 'mock'
  provider_job_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ai_video_jobs_user_id_idx ON ai_video_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_video_jobs_status_idx ON ai_video_jobs(status) WHERE status IN ('pending','processing');

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION touch_ai_video_jobs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_video_jobs_touch_updated_at ON ai_video_jobs;
CREATE TRIGGER ai_video_jobs_touch_updated_at
  BEFORE UPDATE ON ai_video_jobs
  FOR EACH ROW EXECUTE FUNCTION touch_ai_video_jobs_updated_at();

-- RLS
ALTER TABLE ai_video_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_video_jobs_select_own ON ai_video_jobs;
CREATE POLICY ai_video_jobs_select_own ON ai_video_jobs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_video_jobs_insert_own ON ai_video_jobs;
CREATE POLICY ai_video_jobs_insert_own ON ai_video_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- UPDATE/DELETE 는 service_role 만 (status 변경은 서버에서만)

-- ─── credit_purchases (결제 내역) ───────────────────────
CREATE TABLE IF NOT EXISTS credit_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  product_code TEXT NOT NULL,     -- 'credit_1' | 'credit_5' | 'credit_10'
  amount_krw INT NOT NULL,        -- 결제 금액 (원)
  credits_granted INT NOT NULL,   -- 지급 포인트 (10,50,100)

  provider TEXT NOT NULL
    CHECK (provider IN ('toss','kakaopay','beta_grant','admin_grant')),
  payment_key TEXT,               -- 토스/카카오 결제 키
  order_id TEXT UNIQUE NOT NULL,  -- 우리쪽 주문 ID (idempotency)

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','failed','refunded','cancelled')),
  raw_response JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS credit_purchases_user_id_idx ON credit_purchases(user_id, created_at DESC);

ALTER TABLE credit_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_purchases_select_own ON credit_purchases;
CREATE POLICY credit_purchases_select_own ON credit_purchases
  FOR SELECT USING (auth.uid() = user_id);

-- INSERT/UPDATE 는 service_role 만 (결제 검증 서버에서)

-- ─── 크레딧 지급 함수 ───────────────────────────────────
-- 결제 완료 시 서버가 호출. SECURITY DEFINER 로 RLS 우회.
CREATE OR REPLACE FUNCTION grant_video_credits(
  p_user_id UUID,
  p_points INT
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_balance INT;
BEGIN
  IF p_points <= 0 THEN
    RAISE EXCEPTION 'INVALID_POINTS: % must be > 0', p_points;
  END IF;

  UPDATE profiles
     SET video_credits = COALESCE(video_credits, 0) + p_points
   WHERE id = p_user_id
   RETURNING video_credits INTO new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: %', p_user_id;
  END IF;

  RETURN new_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION grant_video_credits(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION grant_video_credits(UUID, INT) TO service_role;

-- ─── 크레딧 차감 함수 ───────────────────────────────────
-- 영상 생성 시작 시 서버가 호출. 잔액 부족하면 EXCEPTION.
CREATE OR REPLACE FUNCTION deduct_video_credits(
  p_user_id UUID,
  p_points INT
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_balance INT;
  new_balance INT;
BEGIN
  IF p_points <= 0 THEN
    RAISE EXCEPTION 'INVALID_POINTS: % must be > 0', p_points;
  END IF;

  SELECT COALESCE(video_credits, 0) INTO current_balance
    FROM profiles WHERE id = p_user_id FOR UPDATE;

  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: %', p_user_id;
  END IF;

  IF current_balance < p_points THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS: need % have %', p_points, current_balance;
  END IF;

  UPDATE profiles SET video_credits = current_balance - p_points
    WHERE id = p_user_id
    RETURNING video_credits INTO new_balance;

  RETURN new_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION deduct_video_credits(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION deduct_video_credits(UUID, INT) TO service_role;

-- ✅ 완료
