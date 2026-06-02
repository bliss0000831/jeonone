-- ════════════════════════════════════════════════════════════════════════════
-- 관리자 페이지 전체 활성화 — 추가 테이블 (2026-04-21)
--
-- 목적: 40개 관리자 페이지(매물/서비스/커뮤니티/게시판/통계/SEO/테마/백업)가
--       실제 DB 저장·조회 되도록 필요한 보조 테이블을 생성한다.
--       IDEMPOTENT — 여러 번 실행해도 안전.
--
-- 포함:
--   · property_reports       (신고된 매물)
--   · property_highlights    (하이라이트 매물 배지)
--   · notices                (공지사항)
--   · faqs                   (FAQ)
--   · support_inquiries      (1:1 문의)
--   · popular_searches       (인기 검색어 집계)
--   · admin_backup_logs      (백업 이력)
--   · homepage_menu          (상단 메뉴)
--   · homepage_slider        (메인 슬라이더)
--   · admin_mail_log         (관리자 메일 발송 이력)
--
-- 단, 기존 리소스 테이블(properties/sharing_items/new_stores/clubs 등)은
-- 이미 운영 중이므로 여기서는 건드리지 않음.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 공통 헬퍼: 관리자 전용 RLS 정책 (재사용용) ─────────────────────────────
-- profiles.role IN ('admin','superadmin') 인지 검사

-- ─── property_reports (신고된 매물) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS property_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  UUID NOT NULL,
  reporter_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason       TEXT NOT NULL,
  detail       TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','reviewed','resolved','rejected')),
  reviewed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  admin_note   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE property_reports ADD COLUMN IF NOT EXISTS property_id UUID;
ALTER TABLE property_reports ADD COLUMN IF NOT EXISTS reporter_id UUID;
ALTER TABLE property_reports ADD COLUMN IF NOT EXISTS reason      TEXT;
ALTER TABLE property_reports ADD COLUMN IF NOT EXISTS detail      TEXT;
ALTER TABLE property_reports ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE property_reports ADD COLUMN IF NOT EXISTS reviewed_by UUID;
ALTER TABLE property_reports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE property_reports ADD COLUMN IF NOT EXISTS admin_note  TEXT;
ALTER TABLE property_reports ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS pr_property_idx ON property_reports(property_id);
CREATE INDEX IF NOT EXISTS pr_status_idx   ON property_reports(status);
ALTER TABLE property_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pr_select ON property_reports;
CREATE POLICY pr_select ON property_reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin')));
DROP POLICY IF EXISTS pr_insert ON property_reports;
CREATE POLICY pr_insert ON property_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid() OR reporter_id IS NULL);
DROP POLICY IF EXISTS pr_admin_update ON property_reports;
CREATE POLICY pr_admin_update ON property_reports FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin')));

-- ─── property_highlights (하이라이트 매물) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS property_highlights (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  UUID NOT NULL UNIQUE,
  badge        TEXT,   -- 'premium', 'hot', 'new', ...
  sort_order   INT NOT NULL DEFAULT 0,
  start_at     TIMESTAMPTZ,
  end_at       TIMESTAMPTZ,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE property_highlights ADD COLUMN IF NOT EXISTS property_id UUID;
ALTER TABLE property_highlights ADD COLUMN IF NOT EXISTS badge       TEXT;
ALTER TABLE property_highlights ADD COLUMN IF NOT EXISTS sort_order  INT NOT NULL DEFAULT 0;
ALTER TABLE property_highlights ADD COLUMN IF NOT EXISTS start_at    TIMESTAMPTZ;
ALTER TABLE property_highlights ADD COLUMN IF NOT EXISTS end_at      TIMESTAMPTZ;
ALTER TABLE property_highlights ADD COLUMN IF NOT EXISTS created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE property_highlights ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS ph_sort_idx ON property_highlights(sort_order, created_at DESC);
ALTER TABLE property_highlights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ph_select ON property_highlights;
CREATE POLICY ph_select ON property_highlights FOR SELECT USING (true);
DROP POLICY IF EXISTS ph_admin_write ON property_highlights;
CREATE POLICY ph_admin_write ON property_highlights FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin')));

-- ─── notices (공지사항) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  is_pinned    BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT true,
  author_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  view_count   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE notices ADD COLUMN IF NOT EXISTS title        TEXT;
ALTER TABLE notices ADD COLUMN IF NOT EXISTS content      TEXT;
ALTER TABLE notices ADD COLUMN IF NOT EXISTS is_pinned    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE notices ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE notices ADD COLUMN IF NOT EXISTS author_id    UUID;
ALTER TABLE notices ADD COLUMN IF NOT EXISTS view_count   INT NOT NULL DEFAULT 0;
ALTER TABLE notices ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE notices ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS notices_pinned_idx ON notices(is_pinned DESC, created_at DESC);
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notices_select ON notices;
CREATE POLICY notices_select ON notices FOR SELECT USING (is_published = true OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin')));
DROP POLICY IF EXISTS notices_admin_write ON notices;
CREATE POLICY notices_admin_write ON notices FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin')));

-- ─── faqs ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS faqs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category    TEXT NOT NULL DEFAULT 'general',
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE faqs ADD COLUMN IF NOT EXISTS category   TEXT NOT NULL DEFAULT 'general';
ALTER TABLE faqs ADD COLUMN IF NOT EXISTS question   TEXT;
ALTER TABLE faqs ADD COLUMN IF NOT EXISTS answer     TEXT;
ALTER TABLE faqs ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
ALTER TABLE faqs ADD COLUMN IF NOT EXISTS is_active  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE faqs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE faqs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS faqs_cat_idx ON faqs(category, sort_order);
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS faqs_select ON faqs;
CREATE POLICY faqs_select ON faqs FOR SELECT USING (is_active = true OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin')));
DROP POLICY IF EXISTS faqs_admin_write ON faqs;
CREATE POLICY faqs_admin_write ON faqs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin')));

-- ─── support_inquiries (1:1 문의) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_inquiries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name          TEXT,
  email         TEXT,
  phone         TEXT,
  category      TEXT DEFAULT 'general',
  subject       TEXT NOT NULL,
  message       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','answered','closed')),
  answer        TEXT,
  answered_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  answered_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE support_inquiries ADD COLUMN IF NOT EXISTS user_id     UUID;
ALTER TABLE support_inquiries ADD COLUMN IF NOT EXISTS name        TEXT;
ALTER TABLE support_inquiries ADD COLUMN IF NOT EXISTS email       TEXT;
ALTER TABLE support_inquiries ADD COLUMN IF NOT EXISTS phone       TEXT;
ALTER TABLE support_inquiries ADD COLUMN IF NOT EXISTS category    TEXT DEFAULT 'general';
ALTER TABLE support_inquiries ADD COLUMN IF NOT EXISTS subject     TEXT;
ALTER TABLE support_inquiries ADD COLUMN IF NOT EXISTS message     TEXT;
ALTER TABLE support_inquiries ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'open';
ALTER TABLE support_inquiries ADD COLUMN IF NOT EXISTS answer      TEXT;
ALTER TABLE support_inquiries ADD COLUMN IF NOT EXISTS answered_by UUID;
ALTER TABLE support_inquiries ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ;
ALTER TABLE support_inquiries ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS si_status_idx ON support_inquiries(status, created_at DESC);
CREATE INDEX IF NOT EXISTS si_user_idx ON support_inquiries(user_id);
ALTER TABLE support_inquiries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS si_select ON support_inquiries;
CREATE POLICY si_select ON support_inquiries FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin')));
DROP POLICY IF EXISTS si_insert ON support_inquiries;
CREATE POLICY si_insert ON support_inquiries FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS si_admin_update ON support_inquiries;
CREATE POLICY si_admin_update ON support_inquiries FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin')));

-- ─── popular_searches (인기 검색어) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS popular_searches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword     TEXT NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  context     TEXT DEFAULT 'global',  -- 'property','board','all'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE popular_searches ADD COLUMN IF NOT EXISTS keyword    TEXT;
ALTER TABLE popular_searches ADD COLUMN IF NOT EXISTS user_id    UUID;
ALTER TABLE popular_searches ADD COLUMN IF NOT EXISTS context    TEXT DEFAULT 'global';
ALTER TABLE popular_searches ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS ps_keyword_idx ON popular_searches(keyword);
CREATE INDEX IF NOT EXISTS ps_created_idx ON popular_searches(created_at DESC);
ALTER TABLE popular_searches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ps_insert ON popular_searches;
CREATE POLICY ps_insert ON popular_searches FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS ps_admin_select ON popular_searches;
CREATE POLICY ps_admin_select ON popular_searches FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin')));

-- ─── admin_backup_logs ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_backup_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,  -- 'export','restore'
  target       TEXT,           -- 'all','properties','board', ...
  status       TEXT NOT NULL DEFAULT 'success',
  detail       JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE admin_backup_logs ADD COLUMN IF NOT EXISTS admin_id   UUID;
ALTER TABLE admin_backup_logs ADD COLUMN IF NOT EXISTS action     TEXT;
ALTER TABLE admin_backup_logs ADD COLUMN IF NOT EXISTS target     TEXT;
ALTER TABLE admin_backup_logs ADD COLUMN IF NOT EXISTS status     TEXT NOT NULL DEFAULT 'success';
ALTER TABLE admin_backup_logs ADD COLUMN IF NOT EXISTS detail     JSONB;
ALTER TABLE admin_backup_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE admin_backup_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS abl_admin_all ON admin_backup_logs;
CREATE POLICY abl_admin_all ON admin_backup_logs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin')));

-- ─── admin_mail_log (관리자 메일/메시지 발송 이력) ────────────────────────
CREATE TABLE IF NOT EXISTS admin_mail_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  channel       TEXT NOT NULL DEFAULT 'mail', -- 'mail','message','push'
  target_type   TEXT NOT NULL DEFAULT 'all',  -- 'all','user','role','account_type'
  target_value  TEXT,
  subject       TEXT,
  body          TEXT NOT NULL,
  recipients    INT NOT NULL DEFAULT 0,
  success       INT NOT NULL DEFAULT 0,
  failed        INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE admin_mail_log ADD COLUMN IF NOT EXISTS admin_id     UUID;
ALTER TABLE admin_mail_log ADD COLUMN IF NOT EXISTS channel      TEXT NOT NULL DEFAULT 'mail';
ALTER TABLE admin_mail_log ADD COLUMN IF NOT EXISTS target_type  TEXT NOT NULL DEFAULT 'all';
ALTER TABLE admin_mail_log ADD COLUMN IF NOT EXISTS target_value TEXT;
ALTER TABLE admin_mail_log ADD COLUMN IF NOT EXISTS subject      TEXT;
ALTER TABLE admin_mail_log ADD COLUMN IF NOT EXISTS body         TEXT;
ALTER TABLE admin_mail_log ADD COLUMN IF NOT EXISTS recipients   INT NOT NULL DEFAULT 0;
ALTER TABLE admin_mail_log ADD COLUMN IF NOT EXISTS success      INT NOT NULL DEFAULT 0;
ALTER TABLE admin_mail_log ADD COLUMN IF NOT EXISTS failed       INT NOT NULL DEFAULT 0;
ALTER TABLE admin_mail_log ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE admin_mail_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aml_admin_all ON admin_mail_log;
CREATE POLICY aml_admin_all ON admin_mail_log FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin')));

-- ─── homepage_menu (상단 메뉴) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS homepage_menu (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT NOT NULL,
  href        TEXT NOT NULL,
  icon        TEXT,
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  parent_id   UUID REFERENCES homepage_menu(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE homepage_menu ADD COLUMN IF NOT EXISTS label      TEXT;
ALTER TABLE homepage_menu ADD COLUMN IF NOT EXISTS href       TEXT;
ALTER TABLE homepage_menu ADD COLUMN IF NOT EXISTS icon       TEXT;
ALTER TABLE homepage_menu ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
ALTER TABLE homepage_menu ADD COLUMN IF NOT EXISTS is_active  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE homepage_menu ADD COLUMN IF NOT EXISTS parent_id  UUID REFERENCES homepage_menu(id) ON DELETE CASCADE;
ALTER TABLE homepage_menu ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE homepage_menu ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hm_select ON homepage_menu;
CREATE POLICY hm_select ON homepage_menu FOR SELECT USING (true);
DROP POLICY IF EXISTS hm_admin_write ON homepage_menu;
CREATE POLICY hm_admin_write ON homepage_menu FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin')));

-- ─── homepage_slider (메인 슬라이더 이미지) ──────────────────────────────
CREATE TABLE IF NOT EXISTS homepage_slider (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT,
  image_url   TEXT NOT NULL,
  link_url    TEXT,
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE homepage_slider ADD COLUMN IF NOT EXISTS title      TEXT;
ALTER TABLE homepage_slider ADD COLUMN IF NOT EXISTS image_url  TEXT;
ALTER TABLE homepage_slider ADD COLUMN IF NOT EXISTS link_url   TEXT;
ALTER TABLE homepage_slider ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
ALTER TABLE homepage_slider ADD COLUMN IF NOT EXISTS is_active  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE homepage_slider ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE homepage_slider ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hs_select ON homepage_slider;
CREATE POLICY hs_select ON homepage_slider FOR SELECT USING (true);
DROP POLICY IF EXISTS hs_admin_write ON homepage_slider;
CREATE POLICY hs_admin_write ON homepage_slider FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin')));

-- ─── site_settings 에 SEO/테마 키 seed ─────────────────────────────────────
INSERT INTO site_settings (key, value) VALUES
  ('seo_basic', '{"title_suffix":" | 춘천광장","default_description":"춘천광장 - 우리 동네 부동산과 이웃","default_keywords":"춘천,부동산,공구,나눔,커뮤니티","robots":"index, follow","og_image":""}'::jsonb),
  ('seo_meta_tags', '{"google_site_verification":"","naver_site_verification":"","kakao_app_id":""}'::jsonb),
  ('theme_basic_info', '{"company_name":"춘천광장","address":"강원도 춘천시","phone":"","email":"","business_number":""}'::jsonb),
  ('theme_footer', '{"copyright":"© 2026 춘천광장. All rights reserved.","show_sns":true,"sns":{"instagram":"","youtube":"","blog":""},"links":[]}'::jsonb),
  ('theme_colors', '{"primary":"#10b981","accent":"#3b82f6"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ─── 공지/FAQ 기본값 seed (최초 1건만) ────────────────────────────────────
INSERT INTO notices (title, content, is_pinned)
SELECT '춘천광장에 오신 것을 환영합니다', '우리 동네 부동산부터 이웃 커뮤니티까지 — 춘천광장에서 만나보세요.', true
WHERE NOT EXISTS (SELECT 1 FROM notices);

INSERT INTO faqs (category, question, answer, sort_order) VALUES
  ('general', '회원가입은 어떻게 하나요?', '우측 상단 로그인 버튼을 눌러 카카오/구글 계정으로 간편 가입하실 수 있습니다.', 1),
  ('property', '매물 등록은 누구나 가능한가요?', '회원가입 후 누구나 매물을 등록할 수 있습니다. 공인중개사 인증 후에는 하이라이트 배지가 부여됩니다.', 2)
ON CONFLICT DO NOTHING;

-- ─── 트리거: updated_at 자동 갱신 (신규 테이블) ────────────────────────────
DROP TRIGGER IF EXISTS trg_notices_updated ON notices;
CREATE TRIGGER trg_notices_updated BEFORE UPDATE ON notices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_faqs_updated ON faqs;
CREATE TRIGGER trg_faqs_updated BEFORE UPDATE ON faqs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

NOTIFY pgrst, 'reload schema';
