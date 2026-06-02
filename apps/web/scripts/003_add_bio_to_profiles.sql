-- profiles 테이블에 bio 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;
