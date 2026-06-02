-- 공인중개사 등록번호 컬럼 추가
-- 기존 business_number 는 사업자등록번호용, registration_number 는 공인중개사 전용 등록번호
ALTER TABLE account_type_requests
  ADD COLUMN IF NOT EXISTS registration_number text;

COMMENT ON COLUMN account_type_requests.registration_number
  IS '공인중개사 등록번호 (agent 유형 전용, 예: 2020-강원춘천-00001)';
