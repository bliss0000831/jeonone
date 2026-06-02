-- ============================================================================
-- 광장별 사업자 정보 (통신판매중개자 면책 고지 / 약관 사업자란 채우기용)
--   - plazas.business_info JSONB 컬럼
--   - 광장 관리자(plaza_admins 또는 superadmin) 가 자기 광장 정보 수정 가능
--   - 일반 사용자는 SELECT 만 가능 (이미 plazas_select_all 정책으로 허용됨)
--
-- business_info 스키마 (모두 optional, 빈 문자열 가능):
--   {
--     "business_name":     "상호 (예: 광장)",
--     "ceo_name":          "대표자명",
--     "business_number":   "사업자등록번호 (000-00-00000)",
--     "mailorder_number":  "통신판매업 신고번호 (제0000-춘천-0000호)",
--     "address":           "사업장 소재지",
--     "phone":             "대표전화",
--     "email":             "대표이메일",
--     "job_info_number":   "직업정보제공사업 신고번호 (선택)",
--     "privacy_officer":   "개인정보 보호책임자명 (선택)"
--   }
-- ============================================================================

BEGIN;

ALTER TABLE plazas
  ADD COLUMN IF NOT EXISTS business_info JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN plazas.business_info IS
  '광장별 사업자 정보 (상호·대표자·사업자번호·통신판매업신고·주소·연락처 등). 약관·푸터·면책고지 렌더링에 사용.';

-- ─── 광장 관리자도 자기 광장 plazas 행 UPDATE 가능 ────────────────────────
-- 기존엔 superadmin 만 plazas 쓰기 가능했음. 사업자 정보 입력을 위해 plaza_admin
-- 권한자도 자기 광장만 업데이트할 수 있도록 정책 추가.
DROP POLICY IF EXISTS plazas_plaza_admin_update ON plazas;
CREATE POLICY plazas_plaza_admin_update ON plazas
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM plaza_admins
      WHERE plaza_admins.plaza_id = plazas.id
        AND plaza_admins.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM plaza_admins
      WHERE plaza_admins.plaza_id = plazas.id
        AND plaza_admins.user_id = auth.uid()
    )
  );

-- ─── RPC: 광장 사업자 정보 업데이트 (권한 체크 포함) ──────────────────────
-- 컬럼 단위 권한 제약을 RLS 로는 못 거니까 RPC 로 감싸서 business_info 만
-- 수정하도록 강제. 광장 관리자/슈퍼관리자만 호출 가능.
CREATE OR REPLACE FUNCTION update_plaza_business_info(
  p_plaza_id TEXT,
  p_info     JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_result JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  -- superadmin 이거나 해당 광장의 plaza_admin 인지 확인
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_uid AND role = 'superadmin'
  ) OR EXISTS (
    SELECT 1 FROM plaza_admins
    WHERE plaza_admins.plaza_id = p_plaza_id
      AND plaza_admins.user_id = v_uid
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'permission denied: not a plaza admin of %', p_plaza_id;
  END IF;

  UPDATE plazas
    SET business_info = COALESCE(p_info, '{}'::jsonb),
        updated_at    = NOW()
    WHERE id = p_plaza_id
  RETURNING business_info INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION update_plaza_business_info(TEXT, JSONB) TO authenticated;

COMMIT;
