-- ============================================================================
-- 매물 ↔ account_type 동기화 + 일반 사용자 월 2건 제한 인프라
--
-- 정책:
--   1) account_type='agent' → 'individual' 등 (박탈 / 변경) 시:
--      해당 user 의 모든 properties → status='hidden', hidden_reason 기록
--      admin_actions 에 'agent_revoke' 액션 로그
--   2) account_type='?' → 'agent' 로 승급 시:
--      해당 user 의 모든 properties → seller_type='agent' 자동 갱신
--   3) 그 외 account_type 변경: 일반인 매물끼리 이동 → seller_type='individual' 동기화
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- properties 에 hidden_reason 컬럼이 없을 수도 있어서 안전 가드
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS hidden_reason TEXT;

-- ────────────────────────────────────────────────────────────────────────────
-- 트리거 함수 — profiles.account_type 변경 시 properties 동기화
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_sync_properties_on_account_type_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_was_agent BOOLEAN;
  v_is_agent  BOOLEAN;
BEGIN
  -- account_type 이 실제로 바뀐 경우에만 동작
  IF NEW.account_type IS NOT DISTINCT FROM OLD.account_type THEN
    RETURN NEW;
  END IF;

  v_was_agent := OLD.account_type = 'agent';
  v_is_agent  := NEW.account_type = 'agent';

  IF v_was_agent AND NOT v_is_agent THEN
    -- ─── 박탈: agent → 그 외 ─────────────────────────────────────────────
    -- 해당 user 의 모든 active 매물 hidden 처리
    UPDATE public.properties
       SET status = 'hidden',
           hidden_reason = '공인중개사 인증 박탈로 자동 숨김',
           updated_at = NOW()
     WHERE user_id = NEW.id
       AND status = 'active';

    -- 관리자 액션 로그 (admin_id 는 NEW.id 의 변경자가 누군지 알 수 없으므로
    --  본인 id 로 기록 — 운영자는 audit timeline 으로 추적)
    BEGIN
      INSERT INTO public.admin_actions (
        admin_id, action, target_table, target_id, target_user_id, reason
      )
      SELECT
        NEW.id,
        'agent_revoke',
        'properties',
        p.id::text,
        p.user_id,
        '공인중개사 인증 박탈 — 자동 숨김 처리'
      FROM public.properties p
      WHERE p.user_id = NEW.id
        AND p.hidden_reason = '공인중개사 인증 박탈로 자동 숨김';
    EXCEPTION WHEN OTHERS THEN
      -- admin_actions 가 없으면 무시
      NULL;
    END;

  ELSIF NOT v_was_agent AND v_is_agent THEN
    -- ─── 승급: 일반 → agent ─────────────────────────────────────────────
    -- 기존 매물 seller_type='agent' 로 갱신 (이미 등록된 매물도 공인중개사 카테고리로)
    UPDATE public.properties
       SET seller_type = 'agent',
           updated_at = NOW()
     WHERE user_id = NEW.id
       AND seller_type IS DISTINCT FROM 'agent';

  ELSE
    -- ─── 일반인 ↔ 일반인 (business ↔ individual 등) ─────────────────────
    UPDATE public.properties
       SET seller_type = 'individual',
           updated_at = NOW()
     WHERE user_id = NEW.id
       AND seller_type IS DISTINCT FROM 'individual';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_account_type_change ON public.profiles;
CREATE TRIGGER profiles_account_type_change
  AFTER UPDATE OF account_type ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION trg_sync_properties_on_account_type_change();

-- ────────────────────────────────────────────────────────────────────────────
-- 인덱스 — 월별 매물 등록 카운트 빠른 조회 (월 2건 제한 검증용)
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_properties_user_created_at
  ON public.properties(user_id, created_at DESC);

NOTIFY pgrst, 'reload schema';

COMMIT;
