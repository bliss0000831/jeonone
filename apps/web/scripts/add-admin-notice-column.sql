-- chat_messages 테이블에 is_admin_notice 컬럼 추가
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_admin_notice BOOLEAN DEFAULT false;

-- chat_rooms 테이블의 post_type에 admin_notice 값 허용 확인
-- (이미 TEXT 타입이므로 별도 제약조건 수정 불필요)
