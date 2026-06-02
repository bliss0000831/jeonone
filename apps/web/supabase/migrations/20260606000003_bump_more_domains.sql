-- 8개 도메인 추가: interior/moving/cleaning/repair/group_buying/local_food/jobs/new_store
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['interior_posts','moving_posts','cleaning_posts','repair_posts','group_buying_posts','local_food','jobs_posts','new_store_posts'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS bumped_at TIMESTAMPTZ', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS effective_at TIMESTAMPTZ GENERATED ALWAYS AS (COALESCE(bumped_at, created_at)) STORED', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_effective ON %I(plaza_id, effective_at DESC)', t, t);
  END LOOP;
END $$;

INSERT INTO bump_settings (target_type, free_per_day, cooldown_seconds, points_cost, krw_cost, required_account_age_days) VALUES
  ('interior',     2, 1800, 30, 300, 7),
  ('moving',       2, 1800, 30, 300, 7),
  ('cleaning',     2, 1800, 30, 300, 7),
  ('repair',       2, 1800, 30, 300, 7),
  ('group_buying', 2, 1800, 50, 500, 7),
  ('local_food',   2, 1800, 50, 500, 7),
  ('jobs',         2, 1800, 30, 300, 7),
  ('new_store',    2, 1800, 50, 500, 7)
ON CONFLICT (target_type) DO NOTHING;
