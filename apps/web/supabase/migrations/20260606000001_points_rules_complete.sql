-- 빠진 적립 룰 4개 추가 (secondhand/jobs/new_store/club)
-- foundation 마이그레이션 이후 신설된 도메인이라 룰만 후속으로 보강.
INSERT INTO point_rules (id, display_name, amount, daily_cap, cooldown_seconds, quality_threshold, evaluation_period_hours, required_account_age_days, description, enabled) VALUES
  ('secondhand.create', '중고거래 등록',  10, 3, 600,  '{"must_have_image": true, "min_length": 20}'::jsonb, 24, 7, '중고거래 글 등록 시 적립',          TRUE),
  ('jobs.create',       '구인구직 등록',  15, 3, 3600, '{"min_length": 30}'::jsonb,                          24, 7, '구인구직 글 등록 시 적립',          TRUE),
  ('new_store.create',  '신장개업 등록',  30, 2, 3600, '{"must_have_image": true, "min_length": 30}'::jsonb, 24, 7, '신장개업 등록 시 적립 (사장님)',     TRUE),
  ('club.create',       '모임 개설',     20, 2, 3600, '{"min_length": 30}'::jsonb,                          24, 7, '모임 개설 시 적립',                 TRUE)
ON CONFLICT (id) DO NOTHING;
