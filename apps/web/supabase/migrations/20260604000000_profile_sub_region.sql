-- ============================================================================
-- profiles.sub_region — 광장 내 세부 지역 (e.g. 춘천광장의 춘천/홍천/화천/양구/인제)
--
-- 활용:
--   · 가입 시 사용자가 본인 거주지 선택
--   · 뉴스/이벤트 페이지에서 기본 필터로 적용 (인제 사용자 → 인제 뉴스 기본)
-- ============================================================================

BEGIN;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sub_region TEXT;

COMMENT ON COLUMN profiles.sub_region IS
  '광장 내 세부 지역. plazas.coverage 의 한 항목. NULL 이면 전체 광장 뉴스.';

-- plaza_profiles 에도 광장별로 다른 sub_region 가능 (한 사용자가 여러 광장 회원일 때)
ALTER TABLE plaza_profiles ADD COLUMN IF NOT EXISTS sub_region TEXT;

COMMENT ON COLUMN plaza_profiles.sub_region IS
  '이 광장에 속한 회원의 세부 지역 (광장 가입 시 선택).';

COMMIT;

NOTIFY pgrst, 'reload schema';
