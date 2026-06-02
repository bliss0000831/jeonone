-- effective_at 인덱스 — 도메인별 실제 list 쿼리에서 사용하는 status 와 매칭하는 partial index 로 재생성.
-- 효과: 인덱스 크기 ↓, list 쿼리 latency ↓ (테이블이 커질수록 효과 큼).

-- properties / secondhand_posts / interior/moving/cleaning/repair_posts / jobs_posts / new_store_posts → status='active'
-- group_buying_posts → status='recruiting'
-- local_food → status='available'

DROP INDEX IF EXISTS idx_interior_posts_effective;
CREATE INDEX IF NOT EXISTS idx_interior_posts_effective_active
  ON interior_posts(plaza_id, effective_at DESC) WHERE status = 'active';

DROP INDEX IF EXISTS idx_moving_posts_effective;
CREATE INDEX IF NOT EXISTS idx_moving_posts_effective_active
  ON moving_posts(plaza_id, effective_at DESC) WHERE status = 'active';

DROP INDEX IF EXISTS idx_cleaning_posts_effective;
CREATE INDEX IF NOT EXISTS idx_cleaning_posts_effective_active
  ON cleaning_posts(plaza_id, effective_at DESC) WHERE status = 'active';

DROP INDEX IF EXISTS idx_repair_posts_effective;
CREATE INDEX IF NOT EXISTS idx_repair_posts_effective_active
  ON repair_posts(plaza_id, effective_at DESC) WHERE status = 'active';

DROP INDEX IF EXISTS idx_group_buying_posts_effective;
CREATE INDEX IF NOT EXISTS idx_group_buying_posts_effective_recruiting
  ON group_buying_posts(plaza_id, effective_at DESC) WHERE status = 'recruiting';

DROP INDEX IF EXISTS idx_local_food_effective;
CREATE INDEX IF NOT EXISTS idx_local_food_effective_available
  ON local_food(plaza_id, effective_at DESC) WHERE status = 'available';

DROP INDEX IF EXISTS idx_jobs_posts_effective;
CREATE INDEX IF NOT EXISTS idx_jobs_posts_effective_active
  ON jobs_posts(plaza_id, effective_at DESC) WHERE status = 'active';

DROP INDEX IF EXISTS idx_new_store_posts_effective;
CREATE INDEX IF NOT EXISTS idx_new_store_posts_effective_active
  ON new_store_posts(plaza_id, effective_at DESC) WHERE status = 'active';
