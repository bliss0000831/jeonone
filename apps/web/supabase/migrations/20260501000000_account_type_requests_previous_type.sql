-- 유형 변경 신청 지원: 신청 시점의 기존 account_type 스냅샷을 저장
-- NULL / "user" / "individual" 이면 신규 신청, 그 외 값이면 변경 신청으로 해석
ALTER TABLE account_type_requests
  ADD COLUMN IF NOT EXISTS previous_type text;

COMMENT ON COLUMN account_type_requests.previous_type IS
  '신청 시점의 profiles.account_type 스냅샷. 변경 신청(non-null & !="user"/"individual")과 신규 신청 구분용';
