-- 서비스 테이블에 service_dong 컬럼 추가
ALTER TABLE interior_posts ADD COLUMN IF NOT EXISTS service_dong VARCHAR(100);
ALTER TABLE moving_posts ADD COLUMN IF NOT EXISTS service_dong VARCHAR(100);
ALTER TABLE cleaning_posts ADD COLUMN IF NOT EXISTS service_dong VARCHAR(100);
ALTER TABLE repair_posts ADD COLUMN IF NOT EXISTS service_dong VARCHAR(100);
