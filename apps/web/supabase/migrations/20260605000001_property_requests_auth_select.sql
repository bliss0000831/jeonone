-- ============================================================================
-- property_requests / property_request_responses SELECT 정책 강화
--
-- 이전: USING (true) — 비로그인 사용자도 SELECT 가능 → 봇 스크래핑으로 본문 PII 수집 위험
-- 이후: USING (auth.uid() IS NOT NULL) — 로그인 사용자만 조회
--
-- 게시판 자체의 공개성은 유지하되, 익명 대량 스크래핑을 차단.
-- ============================================================================

-- property_requests
DROP POLICY IF EXISTS pr_select_all ON property_requests;
CREATE POLICY pr_select_authenticated ON property_requests
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 작성자 + 관리자/슈퍼는 status='hidden' 등 비공개 상태도 조회 가능 (관리 목적)
DROP POLICY IF EXISTS pr_select_owner_admin ON property_requests;
CREATE POLICY pr_select_owner_admin ON property_requests
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- property_request_responses
DROP POLICY IF EXISTS prr_select_all ON property_request_responses;
CREATE POLICY prr_select_authenticated ON property_request_responses
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS prr_select_owner_admin ON property_request_responses;
CREATE POLICY prr_select_owner_admin ON property_request_responses
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  );

NOTIFY pgrst, 'reload schema';
