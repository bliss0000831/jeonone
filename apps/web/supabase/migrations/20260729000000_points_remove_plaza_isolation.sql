-- ============================================================================
-- 포인트 시스템 광장 격리 해제
--
-- user_points: PK (user_id, plaza_id) → PK (user_id)
--   기존 여러 광장 row 를 하나로 합산 후 plaza_id 제거.
-- point_transactions: plaza_id NOT NULL → nullable (기존 데이터 보존)
-- points_spend_atomic RPC: p_plaza_id 제거
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. user_points — 광장별 row 를 유저별 하나로 합산
-- ============================================================================

-- 합산 임시 테이블
CREATE TEMP TABLE _user_points_merged AS
SELECT
  user_id,
  SUM(available)::INT          AS available,
  SUM(pending)::INT            AS pending,
  SUM(lifetime_earned)::INT    AS lifetime_earned,
  SUM(lifetime_spent)::INT     AS lifetime_spent,
  SUM(lifetime_reverted)::INT  AS lifetime_reverted,
  MAX(reputation_score)::INT   AS reputation_score,
  BOOL_OR(is_suspended)        AS is_suspended,
  MAX(suspended_reason)        AS suspended_reason,
  MAX(updated_at)              AS updated_at
FROM user_points
GROUP BY user_id;

-- 기존 데이터 삭제 + PK 변경
TRUNCATE user_points;

ALTER TABLE user_points DROP CONSTRAINT user_points_pkey;
ALTER TABLE user_points ALTER COLUMN plaza_id DROP NOT NULL;
ALTER TABLE user_points ALTER COLUMN plaza_id SET DEFAULT NULL;
ALTER TABLE user_points ADD PRIMARY KEY (user_id);

-- 합산 데이터 복원
INSERT INTO user_points (
  user_id, plaza_id, available, pending,
  lifetime_earned, lifetime_spent, lifetime_reverted,
  reputation_score, is_suspended, suspended_reason, updated_at
)
SELECT
  user_id, NULL, available, pending,
  lifetime_earned, lifetime_spent, lifetime_reverted,
  reputation_score, is_suspended, suspended_reason, updated_at
FROM _user_points_merged;

DROP TABLE _user_points_merged;

-- 불필요 인덱스 제거
DROP INDEX IF EXISTS idx_user_points_plaza;

-- ============================================================================
-- 2. point_transactions — plaza_id nullable (기존 데이터 보존, 신규는 NULL)
-- ============================================================================
ALTER TABLE point_transactions ALTER COLUMN plaza_id DROP NOT NULL;

-- ============================================================================
-- 3. points_spend_atomic RPC 재생성 — p_plaza_id 제거
-- ============================================================================
CREATE OR REPLACE FUNCTION points_spend_atomic(
  p_user_id UUID,
  p_plaza_id TEXT DEFAULT NULL,   -- 하위 호환 유지 (무시됨)
  p_category TEXT DEFAULT NULL,
  p_amount INT DEFAULT 0,
  p_payment_total INT DEFAULT NULL,
  p_source_id UUID DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setting record;
  v_max_pt INT;
  v_updated INT;
  v_tx_id UUID;
BEGIN
  -- 사용처 정책 확인
  SELECT * INTO v_setting
  FROM point_redemption_settings
  WHERE category = p_category AND enabled = TRUE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'reason', 'category_disabled');
  END IF;

  IF p_payment_total IS NOT NULL THEN
    v_max_pt := FLOOR(p_payment_total * v_setting.max_redemption_pct / 100);
    IF p_amount > v_max_pt THEN
      RETURN json_build_object('ok', false, 'reason', 'exceeds_redemption_pct');
    END IF;
  END IF;

  -- atomic balance 검증 + 차감 (PK 가 user_id 로 변경됨)
  UPDATE user_points
     SET available = available - p_amount,
         lifetime_spent = lifetime_spent + p_amount
   WHERE user_id = p_user_id
     AND available >= p_amount
     AND is_suspended = FALSE
  RETURNING 1 INTO v_updated;

  IF v_updated IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'insufficient_balance_or_suspended');
  END IF;

  -- 거래 기록 (plaza_id 는 NULL)
  INSERT INTO point_transactions (
    user_id, plaza_id, type, amount, source, source_id, status, confirmed_at, metadata
  ) VALUES (
    p_user_id, NULL, 'spend', p_amount,
    p_category || '.purchase', p_source_id, 'confirmed', NOW(),
    jsonb_build_object('category', p_category, 'payment_total', p_payment_total)
  )
  RETURNING id INTO v_tx_id;

  RETURN json_build_object('ok', true, 'tx_id', v_tx_id);
END;
$$;

REVOKE ALL ON FUNCTION points_spend_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION points_spend_atomic TO authenticated, service_role;

-- ============================================================================
-- 4. ensureUserPoints 에서 upsert 할 때 onConflict 가 user_id 만 되도록
--    (코드 변경과 동기 — migration 자체는 테이블 구조로 보장)
-- ============================================================================

NOTIFY pgrst, 'reload schema';

COMMIT;
