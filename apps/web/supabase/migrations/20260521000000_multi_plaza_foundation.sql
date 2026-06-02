-- ============================================================================
-- 멀티-광장 (멀티테넌시) 토대 마이그레이션
--   - plazas         : 광장(테넌트) 메타데이터. 'chuncheon', 'gangneung' 등
--   - plaza_admins   : 광장별 관리자 (광장 격리. super_admin 은 모든 광장 접근)
--   - plaza_profiles : 광장별 사용자 가입 (사용자는 광장마다 따로 가입)
--   - 모든 콘텐츠 테이블에 plaza_id 컬럼 추가, 기존 데이터는 'chuncheon' 백필
--
-- 기존 'regions' 테이블은 *광장 내부* 의 동/지역 카테고리이므로 이름 충돌 없음.
-- 광장 = top-level tenant, region = 광장 내 하위 분류.
-- ============================================================================

BEGIN;

-- ─── plazas ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plazas (
  id              TEXT PRIMARY KEY,           -- 'chuncheon', 'gangneung' (서브도메인과 동일)
  name            TEXT NOT NULL,              -- '춘천광장'
  parent_region   TEXT,                       -- '강원권', '서울권' 등
  center_lat      DECIMAL(10, 6),
  center_lng      DECIMAL(10, 6),
  bounds          JSONB,                      -- 지도 경계
  theme           JSONB DEFAULT '{}'::jsonb,  -- { primaryColor, logoUrl, ... }
  is_active       BOOLEAN NOT NULL DEFAULT false,  -- 사용자 진입 가능 여부
  is_open_soon    BOOLEAN NOT NULL DEFAULT false,  -- "오픈예정" 표시
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS plazas_active_idx ON plazas(is_active, sort_order);

ALTER TABLE plazas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plazas_select_all ON plazas;
CREATE POLICY plazas_select_all ON plazas FOR SELECT USING (true);

DROP POLICY IF EXISTS plazas_super_admin_write ON plazas;
CREATE POLICY plazas_super_admin_write ON plazas
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles
                 WHERE profiles.id = auth.uid()
                   AND profiles.role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles
                      WHERE profiles.id = auth.uid()
                        AND profiles.role = 'superadmin'));

-- 시드: 춘천(active), 강릉(active, 더미시드), 그 외 7권역 주요 광장은 오픈예정
INSERT INTO plazas (id, name, parent_region, center_lat, center_lng, theme, is_active, is_open_soon, sort_order)
VALUES
  ('chuncheon',   '춘천광장',   '강원권', 37.881315, 127.729859, '{"primaryColor":"#0066CC"}'::jsonb, true,  false, 1),
  ('gangneung',   '강릉광장',   '강원권', 37.751853, 128.876057, '{"primaryColor":"#0EA5E9"}'::jsonb, true,  false, 2),
  ('wonju',       '원주광장',   '강원권', 37.342239, 127.920225, '{}'::jsonb, false, true, 3),
  ('sokcho',      '속초광장',   '강원권', 38.207050, 128.591892, '{}'::jsonb, false, true, 4),
  ('donghae',     '동해광장',   '강원권', 37.524739, 129.114394, '{}'::jsonb, false, true, 5),
  ('taebaek',     '태백광장',   '강원권', 37.164120, 128.985618, '{}'::jsonb, false, true, 6),
  ('seoul-south', '남부광장',   '서울권', 37.516840, 127.035410, '{}'::jsonb, false, true, 10),
  ('seoul-north', '북부광장',   '서울권', 37.601460, 127.041420, '{}'::jsonb, false, true, 11),
  ('seoul-west',  '서부광장',   '서울권', 37.553330, 126.918010, '{}'::jsonb, false, true, 12),
  ('seoul-mid',   '중부광장',   '서울권', 37.563690, 126.978900, '{}'::jsonb, false, true, 13),
  ('suwon',       '수원광장',   '경기권', 37.263570, 127.028611, '{}'::jsonb, false, true, 20),
  ('seongnam',    '성남광장',   '경기권', 37.420000, 127.126650, '{}'::jsonb, false, true, 21),
  ('daejeon',     '대전광장',   '충청권', 36.350412, 127.384547, '{}'::jsonb, false, true, 30),
  ('cheongju',    '청주광장',   '충청권', 36.642434, 127.489054, '{}'::jsonb, false, true, 31),
  ('mokpo',       '목포광장',   '전라권', 34.811679, 126.391847, '{}'::jsonb, false, true, 40),
  ('gwangju-jn',  '광주광장',   '전라권', 35.159545, 126.852601, '{}'::jsonb, false, true, 41),
  ('jeju',        '제주광장',   '제주권', 33.499621, 126.531188, '{}'::jsonb, false, true, 50)
ON CONFLICT (id) DO NOTHING;

-- ─── plaza_admins ───────────────────────────────────────────────────────────
-- 광장별 관리자 권한. role = 'super' 면 모든 광장 admin 페이지 접근 가능.
CREATE TABLE IF NOT EXISTS plaza_admins (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plaza_id    TEXT NOT NULL REFERENCES plazas(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'admin',  -- 'admin' | 'moderator' | 'super'
  granted_by  UUID REFERENCES auth.users(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, plaza_id)
);

CREATE INDEX IF NOT EXISTS plaza_admins_plaza_idx ON plaza_admins(plaza_id, role);

ALTER TABLE plaza_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plaza_admins_select_self ON plaza_admins;
CREATE POLICY plaza_admins_select_self ON plaza_admins
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM plaza_admins pa2
      WHERE pa2.user_id = auth.uid()
        AND (pa2.role = 'super' OR pa2.plaza_id = plaza_admins.plaza_id)
    )
  );

DROP POLICY IF EXISTS plaza_admins_super_write ON plaza_admins;
CREATE POLICY plaza_admins_super_write ON plaza_admins
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM plaza_admins pa
                 WHERE pa.user_id = auth.uid() AND pa.role = 'super'))
  WITH CHECK (EXISTS (SELECT 1 FROM plaza_admins pa
                      WHERE pa.user_id = auth.uid() AND pa.role = 'super'));

-- 기존 superadmin profile 들을 모든 광장의 super 로 자동 등록
INSERT INTO plaza_admins (user_id, plaza_id, role)
SELECT p.id, plz.id, 'super'
FROM profiles p
CROSS JOIN plazas plz
WHERE p.role = 'superadmin'
ON CONFLICT (user_id, plaza_id) DO NOTHING;

-- 기존 admin profile 들을 chuncheon 광장 admin 으로 등록 (현 운영자 권한 유지)
INSERT INTO plaza_admins (user_id, plaza_id, role)
SELECT p.id, 'chuncheon', 'admin'
FROM profiles p
WHERE p.role = 'admin'
ON CONFLICT (user_id, plaza_id) DO NOTHING;

-- ─── plaza_profiles ─────────────────────────────────────────────────────────
-- 사용자의 광장별 가입 정보. 같은 auth.user 가 여러 광장에 가입할 수도 있고,
-- 한 광장에만 가입할 수도 있음 (사용자 입장에선 광장별 독립 계정처럼 느껴짐).
CREATE TABLE IF NOT EXISTS plaza_profiles (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plaza_id    TEXT NOT NULL REFERENCES plazas(id) ON DELETE CASCADE,
  nickname    TEXT,                  -- 광장별 닉네임 (다르게 쓸 수 있음)
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, plaza_id)
);

CREATE INDEX IF NOT EXISTS plaza_profiles_plaza_idx ON plaza_profiles(plaza_id);

ALTER TABLE plaza_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plaza_profiles_select ON plaza_profiles;
CREATE POLICY plaza_profiles_select ON plaza_profiles
  FOR SELECT USING (true);  -- 닉네임은 공개 (게시글 작성자 표시 위해)

DROP POLICY IF EXISTS plaza_profiles_self_write ON plaza_profiles;
CREATE POLICY plaza_profiles_self_write ON plaza_profiles
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 기존 profiles 모두를 chuncheon 가입자로 백필
INSERT INTO plaza_profiles (user_id, plaza_id, nickname, joined_at, is_active)
SELECT id, 'chuncheon', nickname, COALESCE(created_at, NOW()), true
FROM profiles
ON CONFLICT (user_id, plaza_id) DO NOTHING;

-- ─── plaza_id 컬럼 추가 (모든 콘텐츠 테이블) ─────────────────────────────────
-- 추가 → 백필(chuncheon) → NOT NULL → 인덱스. RLS 는 차후 PR 에서 강화.

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    -- 매물 도메인
    'properties',
    'property_reports',
    'property_highlights',
    'property_requests',
    'property_request_responses',
    -- 게시판 / 커뮤니티
    'board_posts',
    'board_comments',
    'board_post_likes',
    'board_categories',
    -- 중고/구인
    'secondhand_posts',
    'secondhand_likes',
    'jobs_posts',
    'jobs_likes',
    'post_reports',
    -- 클럽 / 모임
    'club_members',
    'club_chat_messages',
    'club_likes',
    -- 공동구매 / 나눔 / 인테리어 / 신규매장 / 청소·이사·수리
    'group_buying_chat_messages',
    'sharing_likes',
    'new_store_likes',
    'interior_favorites',
    'moving_favorites',
    'cleaning_favorites',
    'repair_favorites',
    -- 운영
    'notices',
    'faqs',
    'support_inquiries',
    'popups',
    'hero_banners',
    'homepage_menu',
    'homepage_slider',
    'page_heroes',
    'popular_searches',
    'search_queries',
    -- 분석
    'visitor_logs',
    -- 이벤트
    'chuncheon_events'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- 테이블이 존재할 때만 처리
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS plaza_id TEXT', t);
      EXECUTE format('UPDATE %I SET plaza_id = ''chuncheon'' WHERE plaza_id IS NULL', t);
      EXECUTE format('ALTER TABLE %I ALTER COLUMN plaza_id SET DEFAULT ''chuncheon''', t);
      -- FK 는 체크 비용 있으니 일단 미추가. CHECK constraint 로 가볍게 검증.
      EXECUTE format(
        'DO $inner$ BEGIN
           IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = %L) THEN
             ALTER TABLE %I ADD CONSTRAINT %I CHECK (plaza_id IS NOT NULL);
           END IF;
         END $inner$;',
        t || '_plaza_id_not_null', t, t || '_plaza_id_not_null'
      );
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(plaza_id)', t || '_plaza_id_idx', t);
    END IF;
  END LOOP;
END $$;

-- ─── board_categories: slug 의 unique 를 (plaza_id, slug) 로 ──────────────
-- 광장마다 동일 slug ('free', 'restaurant') 를 별도로 만들 수 있어야 함.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='board_categories') THEN
    -- 기존 slug-only unique 제거 (이름이 자동생성됐을 수 있어 모든 후보 시도)
    BEGIN
      ALTER TABLE board_categories DROP CONSTRAINT IF EXISTS board_categories_slug_key;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    -- 복합 unique 추가 (이미 있으면 에러 무시)
    BEGIN
      ALTER TABLE board_categories
        ADD CONSTRAINT board_categories_plaza_slug_key UNIQUE (plaza_id, slug);
    EXCEPTION WHEN duplicate_object THEN NULL;
             WHEN OTHERS THEN NULL;
    END;
  END IF;
END $$;

-- ─── 헬퍼 함수: 현재 광장 컨텍스트 ──────────────────────────────────────────
-- Next.js 서버에서 supabase.rpc('set_current_plaza', ...) 로 세션별 광장 박을 때 사용.
-- 클라이언트는 application 레벨에서 .eq('plaza_id', plaza) 로 명시적 필터하는 게
-- 안전하므로, 이 함수는 RLS 를 강화할 때만 활용.

CREATE OR REPLACE FUNCTION set_current_plaza(plaza TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM set_config('app.current_plaza', plaza, true);
END;
$$;

CREATE OR REPLACE FUNCTION current_plaza()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('app.current_plaza', true);
$$;

-- 현재 사용자가 특정 광장의 admin 인지 확인 (super 포함)
CREATE OR REPLACE FUNCTION is_plaza_admin(plaza TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM plaza_admins
    WHERE user_id = auth.uid()
      AND (role = 'super' OR plaza_id = plaza)
  );
$$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM plaza_admins
    WHERE user_id = auth.uid() AND role = 'super'
  );
$$;

GRANT EXECUTE ON FUNCTION set_current_plaza(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION current_plaza() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_plaza_admin(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated;

COMMIT;
