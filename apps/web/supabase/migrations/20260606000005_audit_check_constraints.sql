-- 보안/정합성 — 음수/0 가격 INSERT 방어
ALTER TABLE bump_settings DROP CONSTRAINT IF EXISTS bump_settings_prices_nonneg;
ALTER TABLE bump_settings ADD CONSTRAINT bump_settings_prices_nonneg
  CHECK (points_cost >= 0 AND krw_cost >= 0 AND free_per_day >= 0 AND cooldown_seconds >= 0);

ALTER TABLE bump_ticket_packs DROP CONSTRAINT IF EXISTS bump_ticket_packs_prices_nonneg;
ALTER TABLE bump_ticket_packs ADD CONSTRAINT bump_ticket_packs_prices_nonneg
  CHECK (points_price >= 0 AND krw_price >= 0);

ALTER TABLE point_rules DROP CONSTRAINT IF EXISTS point_rules_amount_nonneg;
ALTER TABLE point_rules ADD CONSTRAINT point_rules_amount_nonneg
  CHECK (amount >= 0);

ALTER TABLE user_points DROP CONSTRAINT IF EXISTS user_points_available_nonneg;
ALTER TABLE user_points ADD CONSTRAINT user_points_available_nonneg
  CHECK (available >= 0);
