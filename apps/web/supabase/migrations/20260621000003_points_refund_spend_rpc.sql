-- ============================================================================
-- points_refund_spend(tx_id, reason)
--
-- 배경: 기존 points_revert_one 은 'earn' tx 만 잔액 회수 (스팸/위반 시 적립
--       회수). 'spend' tx 는 환불 시 사용자에게 포인트를 *돌려줘야* 하는데
--       반대 방향이라서 별도 함수가 필요.
--
-- 사용처:
--   - 주문 cancel/refund 시 points_used 복구
--   - 멱등성: status='reverted' 인 tx 재호출 시 no-op
--
-- 동작:
--   - spend tx → status='reverted' + user_points.available += amount
--   - amount 가 음수 저장(spend 관례)이면 ABS 로 처리
--   - earn 또는 다른 type 이면 에러 반환
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.points_refund_spend(UUID, TEXT);
-- ============================================================================

BEGIN;

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
  RETURNING user_id, plaza_id, amount INTO v_tx;

  IF v_tx IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'already_processed_or_not_spend');
  END IF;

  -- spend tx 의 amount 는 양수로 저장돼있다고 가정 (points_spend_atomic 컨벤션)
  -- 음수 저장 케이스도 방어
  v_amount := ABS(v_tx.amount);

  UPDATE user_points
     SET available = available + v_amount
   WHERE user_id = v_tx.user_id AND plaza_id = v_tx.plaza_id;

  RETURN json_build_object('ok', true, 'refunded', v_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.points_refund_spend(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.points_refund_spend(UUID, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
