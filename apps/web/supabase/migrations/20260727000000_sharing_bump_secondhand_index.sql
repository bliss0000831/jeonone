-- ============================================================================
-- 1) sharing_posts 에 끌올(bump) 지원 컬럼 추가
--    기존 bump_more_domains 마이그레이션에서 누락됨
-- 2) secondhand_posts 에 partial effective_at 인덱스 추가
--    partial_effective_at_indexes 마이그레이션에서 누락됨
-- ============================================================================

-- ── sharing_posts: bumped_at + effective_at ──────────────────────────────────
ALTER TABLE sharing_posts ADD COLUMN IF NOT EXISTS bumped_at TIMESTAMPTZ;
ALTER TABLE sharing_posts
  ADD COLUMN IF NOT EXISTS effective_at TIMESTAMPTZ
  GENERATED ALWAYS AS (COALESCE(bumped_at, created_at)) STORED;

-- bump_settings 에 sharing 등록 (이미 있으면 무시)
INSERT INTO bump_settings (target_type, free_per_day, cooldown_seconds, points_cost, krw_cost, required_account_age_days)
VALUES ('sharing', 2, 1800, 30, 300, 7)
ON CONFLICT (target_type) DO NOTHING;

-- sharing_posts: 목록 정렬용 인덱스
CREATE INDEX IF NOT EXISTS idx_sharing_posts_effective_active
  ON sharing_posts(plaza_id, effective_at DESC) WHERE status = 'active';

-- ── secondhand_posts: 누락된 partial effective_at 인덱스 ─────────────────────
-- idx_secondhand_effective (plaza_id, effective_at DESC WHERE status='active') 는
-- bump_foundation 에서 생성됐지만, 통합 partial 인덱스 마이그레이션에서 빠짐.
-- 중복 방지를 위해 IF NOT EXISTS 사용.
CREATE INDEX IF NOT EXISTS idx_secondhand_posts_effective_active
  ON secondhand_posts(plaza_id, effective_at DESC) WHERE status = 'active';

NOTIFY pgrst, 'reload schema';
