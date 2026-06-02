-- ============================================================================
-- point_transactions 의 잘못된 updated_at 트리거 제거
--
-- 배경: 20260525000000_points_foundation 의 DO 블록이 point_transactions 에도
--       billing_set_updated_at() 트리거를 붙였는데, 그 테이블에는 updated_at
--       컬럼이 없어서 UPDATE 시 "record 'new' has no field 'updated_at'" 에러.
--
--       이 때문에 points_refund_spend RPC 에서 status='reverted' UPDATE 가
--       silently 실패하고 잔액 환원이 안 되는 버그.
--
-- 해결: point_transactions 의 updated_at 트리거만 제거.
--       point_transactions 는 본질상 immutable 이라 updated_at 필요 없음.
--       user_points / point_rules / point_redemption_settings 의 트리거는 유지.
--
-- Rollback: (필요 없음 — 잘못 붙은 트리거 제거)
-- ============================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_point_transactions_updated_at ON public.point_transactions;

COMMIT;
