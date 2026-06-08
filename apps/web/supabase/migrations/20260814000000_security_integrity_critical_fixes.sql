-- ============================================================================
-- CRITICAL 보안·무결성 패치 (코드리뷰 C1~C5)
--
-- 배경: "광장 격리 해제(20260729)" 이후 user_points PK 가 (user_id, plaza_id)
--       → (user_id) 로 바뀌고 plaza_id 가 NULL 이 되면서, 옛 plaza_id 를 참조하던
--       포인트 RPC 들이 조용히 실패(잔액 증발/적립 누락)하는 회귀가 발생.
--       또한 일부 SECURITY DEFINER 함수가 GRANT/REVOKE 누락으로 PUBLIC EXECUTE
--       노출되어 권한상승·포인트 무제한 발행이 가능했음. profiles 본인 UPDATE
--       정책은 WITH CHECK 가 없어 role 자기승격(superadmin)이 가능했음.
--
-- 이 마이그레이션은 모두 멱등(CREATE OR REPLACE / DROP IF EXISTS / REVOKE·GRANT)
-- 하며, 데이터 변경 없이 정책·함수 정의만 교정한다.
--
-- 적용: Supabase 대시보드 SQL Editor 에 전체 붙여넣어 실행하거나 `supabase db push`.
-- Rollback 은 각 섹션 주석 참조.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- C1. profiles 본인 UPDATE: role 자기승격 차단 (WITH CHECK 추가)
--   기존 "profiles_update_own" 는 USING 만 있고 WITH CHECK 가 없어, 본인 행의
--   role 을 'superadmin' 으로 직접 PATCH 하여 전 시스템 장악이 가능했다.
--   role 은 자기 자신이 못 바꾸도록 고정(관리자 정책 20260521000018 과 동일 패턴).
--   닉네임·아바타 등 다른 컬럼 self-update 는 그대로 허용된다.
-- Rollback:
--   DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
--   CREATE POLICY "profiles_update_own" ON public.profiles
--     FOR UPDATE USING (auth.uid() = id);
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- role 은 현재 저장값과 동일해야만 통과 → 본인이 role 변경 불가
    AND role IS NOT DISTINCT FROM (
      SELECT p2.role FROM public.profiles p2 WHERE p2.id = profiles.id
    )
  );

-- ----------------------------------------------------------------------------
-- C2. SECURITY DEFINER 포인트/평판 함수 PUBLIC EXECUTE 차단
--   increment_user_points / decrement_reputation / decrement_point_daily_counter
--   는 내부에 auth.uid() 바인딩이 없어, PUBLIC 노출 시 임의 user_id·임의 delta 로
--   포인트 무제한 발행·타인 평판 차감이 가능했다. 서버(points 서비스)는 전부
--   service_role(admin client) 로만 호출하므로 service_role 에만 EXECUTE 부여.
-- Rollback: GRANT EXECUTE ON FUNCTION ... TO authenticated;  (권장 안 함)
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.increment_user_points(UUID, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_user_points(UUID, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT) TO service_role;

REVOKE ALL ON FUNCTION public.decrement_reputation(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_reputation(UUID, INT) TO service_role;

REVOKE ALL ON FUNCTION public.decrement_point_daily_counter(UUID, TEXT, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_point_daily_counter(UUID, TEXT, DATE) TO service_role;

-- search_path 고정 (definer 함수 하이재킹 방지 — 심층방어)
ALTER FUNCTION public.increment_user_points(UUID, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT) SET search_path = public;
ALTER FUNCTION public.decrement_reputation(UUID, INT) SET search_path = public;
ALTER FUNCTION public.decrement_point_daily_counter(UUID, TEXT, DATE) SET search_path = public;

-- ----------------------------------------------------------------------------
-- C3. admin_adjust_points: PUBLIC 차단 + 깨진 plaza_id 참조 교정
--   PUBLIC 노출로 관리자 권한 없이 포인트 조작이 가능했고, 본문이 옛 PK
--   (user_id, plaza_id) 를 참조해 현재 스키마에서 동작 불가. service_role 전용으로
--   잠그고 user_points 단일키(user_id) 기준으로 재작성.
-- Rollback: 20260525010000_atomic_point_adjust.sql 의 원본 정의로 CREATE OR REPLACE.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_adjust_points(
  p_user_id UUID,
  p_plaza_id TEXT,            -- 하위호환용 파라미터(무시됨)
  p_delta BIGINT,
  p_admin_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new BIGINT;
BEGIN
  -- user_points 행 없으면 생성 (PK = user_id 단일)
  INSERT INTO user_points (user_id, available, pending, lifetime_earned, lifetime_spent, lifetime_reverted)
  VALUES (p_user_id, 0, 0, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  IF p_delta > 0 THEN
    UPDATE user_points
       SET available = available + p_delta,
           lifetime_earned = lifetime_earned + p_delta
     WHERE user_id = p_user_id
    RETURNING available INTO v_new;
  ELSE
    UPDATE user_points
       SET available = available + p_delta,
           lifetime_reverted = lifetime_reverted + abs(p_delta)
     WHERE user_id = p_user_id
       AND available + p_delta >= 0
    RETURNING available INTO v_new;

    IF v_new IS NULL THEN
      RAISE EXCEPTION 'insufficient_balance';
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'newBalance', v_new);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_points(UUID, TEXT, BIGINT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_points(UUID, TEXT, BIGINT, UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- C4. points_refund_spend: 깨진 plaza_id 조건 제거 (포인트 환불 잔액 증발 수정)
--   기존: WHERE user_id = X AND plaza_id = v_tx.plaza_id  (plaza_id 가 NULL → 0행)
--   수정: WHERE user_id = X  (user_points PK 단일키)
--   GRANT 는 기존(authenticated, service_role) 유지 — 호출 클라 무관하게 동작.
-- Rollback: 20260621000003_points_refund_spend_rpc.sql 원본 정의.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.points_refund_spend(
  p_tx_id UUID,
  p_reason TEXT
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx record;
  v_amount INTEGER;
BEGIN
  UPDATE point_transactions
     SET status = 'reverted',
         reverted_at = NOW(),
         reverted_reason = p_reason
   WHERE id = p_tx_id
     AND status IN ('pending', 'confirmed')
     AND type = 'spend'
  RETURNING user_id, amount INTO v_tx;

  IF v_tx IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'already_processed_or_not_spend');
  END IF;

  v_amount := ABS(v_tx.amount);

  -- user_points 단일키(user_id) 기준 환원
  UPDATE user_points
     SET available = available + v_amount
   WHERE user_id = v_tx.user_id;

  RETURN json_build_object('ok', true, 'refunded', v_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.points_refund_spend(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.points_refund_spend(UUID, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- C5. grant_points_atomic: ON CONFLICT (user_id, plaza_id) → (user_id)
--   user_points PK 가 (user_id) 단일이라 기존 ON CONFLICT 가 42P10 에러 → 적립 미반영.
--   단일키로 교정. GRANT 는 기존(service_role 전용) 유지.
-- Rollback: 20260625000000_points_idempotency.sql 원본 정의.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_points_atomic(
  p_user UUID,
  p_plaza TEXT,             -- 하위호환용 파라미터(무시됨)
  p_amount INT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO user_points (user_id, available, lifetime_earned)
  VALUES (p_user, p_amount, p_amount)
  ON CONFLICT (user_id) DO UPDATE
    SET available = user_points.available + EXCLUDED.available,
        lifetime_earned = user_points.lifetime_earned + EXCLUDED.lifetime_earned,
        updated_at = NOW();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_points_atomic(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_points_atomic(UUID, TEXT, INT) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
