-- ════════════════════════════════════════════════════════════════════════════
-- 관리자 페이지 통합 마이그레이션 (2026-04-21)
--
-- 목적: 관리자 페이지에서 사용하는 모든 테이블을 IDEMPOTENT하게 재생성한다.
--       사용자가 과거 다른 Supabase 프로젝트에 SQL을 실행한 경우에도 안전하게
--       현재 프로젝트(swllllltqkfqhpuqzacp)에서 전부 생성/정비되도록 한다.
--
-- 포함 테이블:
--   · site_settings          (key-value 설정 스토어)
--   · hero_banners           (홈 히어로 배너)
--   · popups                 (팝업 레이어)
--   · regions                (지역 계층)
--   · categories             (카테고리)
--   · point_history          (포인트 이력)
--   · verification_requests  (인증 요청)
--   · visitor_logs           (방문자 로그)
--   · profiles.role          (role 컬럼 보강)
--
-- 포함 기본값:
--   · site_settings 에 기본 키 seed (사이트명, 설명, 공지배너 OFF 등)
-- ════════════════════════════════════════════════════════════════════════════

-- ─── profiles.role 컬럼 보강 ────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
  END IF;
END $$;

-- role CHECK (존재하지 않으면 추가)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('user', 'admin', 'superadmin'));
  END IF;
END $$;

-- ─── site_settings (key-value) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS value      JSONB;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_settings_select_all ON site_settings;
CREATE POLICY site_settings_select_all ON site_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS site_settings_admin_write ON site_settings;
CREATE POLICY site_settings_admin_write ON site_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('admin', 'superadmin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('admin', 'superadmin'))
  );

-- 기본값 seed (이미 있으면 유지)
INSERT INTO site_settings (key, value) VALUES
  ('site_name', '"춘천광장"'::jsonb),
  ('site_description', '"춘천의 집, 지역 정보, 이웃 커뮤니티"'::jsonb),
  ('admin_email', '""'::jsonb),
  ('site_logo', '"/logo.png?v=3"'::jsonb),
  ('homepage_banner', '{"title":"춘천광장","subtitle":"더 나은 집, 더 가까운 이웃"}'::jsonb),
  ('smtp_enabled', 'false'::jsonb),
  ('maintenance_mode', 'false'::jsonb),
  ('maintenance_settings', '{"enabled":false,"title":"사이트 점검 중","message":"더 나은 서비스 제공을 위해 시스템 점검을 진행하고 있습니다.","start_at":"","end_at":"","allow_admin":true,"contact_email":""}'::jsonb),
  ('announcement_bar', '{"enabled":false,"message":"","link":"","variant":"info"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ─── hero_banners ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hero_banners (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  subtitle     TEXT,
  image_url    TEXT,
  link_url     TEXT,
  sort_order   INT NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  start_at     TIMESTAMPTZ,
  end_at       TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 기존 테이블에 누락된 컬럼 보강 (과거 버전 호환)
ALTER TABLE hero_banners ADD COLUMN IF NOT EXISTS title      TEXT;
ALTER TABLE hero_banners ADD COLUMN IF NOT EXISTS subtitle   TEXT;
ALTER TABLE hero_banners ADD COLUMN IF NOT EXISTS image_url  TEXT;
ALTER TABLE hero_banners ADD COLUMN IF NOT EXISTS link_url   TEXT;
ALTER TABLE hero_banners ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
ALTER TABLE hero_banners ADD COLUMN IF NOT EXISTS is_active  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE hero_banners ADD COLUMN IF NOT EXISTS start_at   TIMESTAMPTZ;
ALTER TABLE hero_banners ADD COLUMN IF NOT EXISTS end_at     TIMESTAMPTZ;
ALTER TABLE hero_banners ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE hero_banners ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS hero_banners_sort_idx
  ON hero_banners(sort_order, created_at DESC);

ALTER TABLE hero_banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hero_banners_select_all ON hero_banners;
CREATE POLICY hero_banners_select_all ON hero_banners
  FOR SELECT USING (true);

DROP POLICY IF EXISTS hero_banners_admin_write ON hero_banners;
CREATE POLICY hero_banners_admin_write ON hero_banners
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles
                 WHERE profiles.id = auth.uid()
                   AND profiles.role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles
                      WHERE profiles.id = auth.uid()
                        AND profiles.role IN ('admin','superadmin')));

-- ─── popups ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS popups (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  content        TEXT,
  image_url      TEXT,
  link_url       TEXT,
  position       TEXT DEFAULT 'center',
  width          INT DEFAULT 400,
  height         INT DEFAULT 300,
  display_pages  TEXT[] DEFAULT ARRAY['/']::TEXT[],
  is_active      BOOLEAN NOT NULL DEFAULT true,
  start_at       TIMESTAMPTZ,
  end_at         TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- popups 컬럼 보강
ALTER TABLE popups ADD COLUMN IF NOT EXISTS title         TEXT;
ALTER TABLE popups ADD COLUMN IF NOT EXISTS content       TEXT;
ALTER TABLE popups ADD COLUMN IF NOT EXISTS image_url     TEXT;
ALTER TABLE popups ADD COLUMN IF NOT EXISTS link_url      TEXT;
ALTER TABLE popups ADD COLUMN IF NOT EXISTS position      TEXT DEFAULT 'center';
ALTER TABLE popups ADD COLUMN IF NOT EXISTS width         INT DEFAULT 400;
ALTER TABLE popups ADD COLUMN IF NOT EXISTS height        INT DEFAULT 300;
ALTER TABLE popups ADD COLUMN IF NOT EXISTS display_pages TEXT[] DEFAULT ARRAY['/']::TEXT[];
ALTER TABLE popups ADD COLUMN IF NOT EXISTS is_active     BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE popups ADD COLUMN IF NOT EXISTS start_at      TIMESTAMPTZ;
ALTER TABLE popups ADD COLUMN IF NOT EXISTS end_at        TIMESTAMPTZ;
ALTER TABLE popups ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE popups ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE popups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS popups_select_all ON popups;
CREATE POLICY popups_select_all ON popups FOR SELECT USING (true);

DROP POLICY IF EXISTS popups_admin_write ON popups;
CREATE POLICY popups_admin_write ON popups
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles
                 WHERE profiles.id = auth.uid()
                   AND profiles.role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles
                      WHERE profiles.id = auth.uid()
                        AND profiles.role IN ('admin','superadmin')));

-- ─── regions ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS regions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   UUID REFERENCES regions(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  code        TEXT,
  level       INT NOT NULL DEFAULT 1,
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- regions 컬럼 보강
ALTER TABLE regions ADD COLUMN IF NOT EXISTS parent_id  UUID REFERENCES regions(id) ON DELETE CASCADE;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS name       TEXT;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS code       TEXT;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS level      INT NOT NULL DEFAULT 1;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS is_active  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS regions_parent_idx ON regions(parent_id);

ALTER TABLE regions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS regions_select_all ON regions;
CREATE POLICY regions_select_all ON regions FOR SELECT USING (true);

DROP POLICY IF EXISTS regions_admin_write ON regions;
CREATE POLICY regions_admin_write ON regions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles
                 WHERE profiles.id = auth.uid()
                   AND profiles.role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles
                      WHERE profiles.id = auth.uid()
                        AND profiles.role IN ('admin','superadmin')));

-- ─── categories ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL, -- 'property','sharing','group_buying','local_food','new_store','club'
  name        TEXT NOT NULL,
  slug        TEXT,
  icon        TEXT,
  color       TEXT,
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- categories 컬럼 보강
ALTER TABLE categories ADD COLUMN IF NOT EXISTS type       TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS name       TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS slug       TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon       TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS color      TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS categories_type_idx ON categories(type, sort_order);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categories_select_all ON categories;
CREATE POLICY categories_select_all ON categories FOR SELECT USING (true);

DROP POLICY IF EXISTS categories_admin_write ON categories;
CREATE POLICY categories_admin_write ON categories
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles
                 WHERE profiles.id = auth.uid()
                   AND profiles.role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles
                      WHERE profiles.id = auth.uid()
                        AND profiles.role IN ('admin','superadmin')));

-- ─── point_history ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'points'
  ) THEN
    ALTER TABLE profiles ADD COLUMN points INT NOT NULL DEFAULT 0;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS point_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      INT NOT NULL,
  balance     INT NOT NULL DEFAULT 0,
  reason      TEXT,
  admin_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE point_history ADD COLUMN IF NOT EXISTS user_id    UUID;
ALTER TABLE point_history ADD COLUMN IF NOT EXISTS amount     INT;
ALTER TABLE point_history ADD COLUMN IF NOT EXISTS balance    INT NOT NULL DEFAULT 0;
ALTER TABLE point_history ADD COLUMN IF NOT EXISTS reason     TEXT;
ALTER TABLE point_history ADD COLUMN IF NOT EXISTS admin_id   UUID;
ALTER TABLE point_history ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS point_history_user_idx
  ON point_history(user_id, created_at DESC);

ALTER TABLE point_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS point_history_select_own_or_admin ON point_history;
CREATE POLICY point_history_select_own_or_admin ON point_history
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('admin','superadmin'))
  );

DROP POLICY IF EXISTS point_history_admin_write ON point_history;
CREATE POLICY point_history_admin_write ON point_history
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles
                 WHERE profiles.id = auth.uid()
                   AND profiles.role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles
                      WHERE profiles.id = auth.uid()
                        AND profiles.role IN ('admin','superadmin')));

-- ─── verification_requests ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS verification_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL, -- 'agent','business','producer','service'
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected')),
  data          JSONB,
  documents     TEXT[],
  reject_reason TEXT,
  reviewed_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS user_id       UUID;
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS type          TEXT;
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS status        TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS data          JSONB;
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS documents     TEXT[];
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS reject_reason TEXT;
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS reviewed_by   UUID;
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS reviewed_at   TIMESTAMPTZ;
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS vr_user_idx ON verification_requests(user_id);
CREATE INDEX IF NOT EXISTS vr_status_idx ON verification_requests(status);
CREATE INDEX IF NOT EXISTS vr_type_idx ON verification_requests(type);

ALTER TABLE verification_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vr_select_own_or_admin ON verification_requests;
CREATE POLICY vr_select_own_or_admin ON verification_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('admin','superadmin'))
  );

DROP POLICY IF EXISTS vr_insert_own ON verification_requests;
CREATE POLICY vr_insert_own ON verification_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS vr_admin_update ON verification_requests;
CREATE POLICY vr_admin_update ON verification_requests
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles
                 WHERE profiles.id = auth.uid()
                   AND profiles.role IN ('admin','superadmin')));

-- ─── visitor_logs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS visitor_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id  TEXT,
  path        TEXT,
  referrer    TEXT,
  user_agent  TEXT,
  ip_hash     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE visitor_logs ADD COLUMN IF NOT EXISTS user_id    UUID;
ALTER TABLE visitor_logs ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE visitor_logs ADD COLUMN IF NOT EXISTS path       TEXT;
ALTER TABLE visitor_logs ADD COLUMN IF NOT EXISTS referrer   TEXT;
ALTER TABLE visitor_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE visitor_logs ADD COLUMN IF NOT EXISTS ip_hash    TEXT;
ALTER TABLE visitor_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS visitor_logs_created_idx
  ON visitor_logs(created_at DESC);

ALTER TABLE visitor_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS visitor_logs_insert_any ON visitor_logs;
CREATE POLICY visitor_logs_insert_any ON visitor_logs
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS visitor_logs_admin_select ON visitor_logs;
CREATE POLICY visitor_logs_admin_select ON visitor_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles
                 WHERE profiles.id = auth.uid()
                   AND profiles.role IN ('admin','superadmin')));

-- ─── trigger: updated_at 자동 갱신 (site_settings, hero_banners, popups) ────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_site_settings_updated ON site_settings;
CREATE TRIGGER trg_site_settings_updated
  BEFORE UPDATE ON site_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_hero_banners_updated ON hero_banners;
CREATE TRIGGER trg_hero_banners_updated
  BEFORE UPDATE ON hero_banners
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_popups_updated ON popups;
CREATE TRIGGER trg_popups_updated
  BEFORE UPDATE ON popups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── PostgREST 스키마 캐시 reload ──────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
