-- ============================================================================
-- 홈페이지 11개 서비스 테이블 — `(plaza_id, status, created_at DESC)` 복합 인덱스.
--
-- 홈에서 매번 `WHERE status='active' AND plaza_id=? ORDER BY created_at DESC LIMIT N`
-- 패턴으로 호출되는데 단일 컬럼 인덱스만 있어 시퀀셜 스캔. 이 마이그레이션으로
-- index-only scan 가능 → 광장당 게시글 1만건 이상에서 체감 큼.
--
-- IF NOT EXISTS — 이미 있는 인덱스는 건드리지 않음.
-- ============================================================================

BEGIN;

-- 인테리어 / 이사 / 청소 / 수리 — 위치 기반 (region/district 조합 별도)
CREATE INDEX IF NOT EXISTS idx_interior_plaza_status_created
  ON interior_posts (plaza_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moving_plaza_status_created
  ON moving_posts (plaza_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cleaning_plaza_status_created
  ON cleaning_posts (plaza_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repair_plaza_status_created
  ON repair_posts (plaza_id, status, created_at DESC);

-- 나눔 / 신장개업 — likes DESC 도 자주 정렬되므로 별도 인덱스
CREATE INDEX IF NOT EXISTS idx_sharing_plaza_status_likes
  ON sharing_posts (plaza_id, status, likes DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_new_store_plaza_status_likes
  ON new_store_posts (plaza_id, status, likes DESC, created_at DESC);

-- 공동구매
CREATE INDEX IF NOT EXISTS idx_group_buying_plaza_status_created
  ON group_buying_posts (plaza_id, status, created_at DESC);

-- 로컬푸드
CREATE INDEX IF NOT EXISTS idx_local_food_plaza_status_created
  ON local_food (plaza_id, status, created_at DESC);

-- 모임
CREATE INDEX IF NOT EXISTS idx_clubs_plaza_status_created
  ON clubs (plaza_id, status, created_at DESC);

-- ============================================================================
-- chuncheon_events — 이벤트 목록 (활성 + 날짜 정렬)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_chuncheon_events_plaza_active_date
  ON chuncheon_events (plaza_id, is_active, event_date DESC);

COMMIT;

NOTIFY pgrst, 'reload schema';
