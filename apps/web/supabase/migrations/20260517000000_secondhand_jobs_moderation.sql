-- ═══════════════════════════════════════════════════════════
-- 동네장터: 중고거래 + 구인구직 + 신고/모더레이션 인프라
-- ═══════════════════════════════════════════════════════════

-- ───── 1. 중고거래 ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.secondhand_posts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT '기타',
  price        INTEGER NOT NULL DEFAULT 0,            -- 원 단위. 0 = 무료나눔/가격제안
  is_price_negotiable BOOLEAN NOT NULL DEFAULT FALSE, -- 가격 제안 가능 여부
  images       JSONB,                                 -- string[]
  location     TEXT,
  status       TEXT NOT NULL DEFAULT 'active',        -- active | reserved | completed | hidden
  views        INTEGER NOT NULL DEFAULT 0,
  likes        INTEGER NOT NULL DEFAULT 0,
  report_count INTEGER NOT NULL DEFAULT 0,            -- 누적 신고 수
  hidden_reason TEXT,                                 -- 자동/수동 숨김 사유
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_secondhand_posts_user_id     ON public.secondhand_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_secondhand_posts_status      ON public.secondhand_posts(status);
CREATE INDEX IF NOT EXISTS idx_secondhand_posts_category    ON public.secondhand_posts(category);
CREATE INDEX IF NOT EXISTS idx_secondhand_posts_created_at  ON public.secondhand_posts(created_at DESC);

CREATE TABLE IF NOT EXISTS public.secondhand_likes (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id    UUID NOT NULL REFERENCES public.secondhand_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

-- ───── 2. 구인구직 (알바 위주) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.jobs_posts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL DEFAULT 'hiring',      -- hiring(구인) | seeking(구직)
  title          TEXT NOT NULL,
  description    TEXT NOT NULL,
  category       TEXT NOT NULL DEFAULT '기타',         -- 음식점/카페/매장/물류/사무/과외 등
  work_type      TEXT,                                 -- 단기/주말/평일/장기/프리랜서
  hourly_wage    INTEGER NOT NULL,                     -- 시급 필수 (원 단위)
  work_days      TEXT,                                 -- 예: "월,수,금"
  work_hours     TEXT,                                 -- 예: "10:00-18:00"
  location       TEXT,
  contact        TEXT,                                 -- 선택: 전화/카톡ID (업자 방지를 위해 필터링 예정)
  images         JSONB,                                -- 선택: 매장 사진
  status         TEXT NOT NULL DEFAULT 'active',       -- active | closed | hidden
  views          INTEGER NOT NULL DEFAULT 0,
  likes          INTEGER NOT NULL DEFAULT 0,
  report_count   INTEGER NOT NULL DEFAULT 0,
  hidden_reason  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_posts_user_id     ON public.jobs_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_posts_status      ON public.jobs_posts(status);
CREATE INDEX IF NOT EXISTS idx_jobs_posts_category    ON public.jobs_posts(category);
CREATE INDEX IF NOT EXISTS idx_jobs_posts_kind        ON public.jobs_posts(kind);
CREATE INDEX IF NOT EXISTS idx_jobs_posts_created_at  ON public.jobs_posts(created_at DESC);

CREATE TABLE IF NOT EXISTS public.jobs_likes (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id    UUID NOT NULL REFERENCES public.jobs_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

-- ───── 3. 통합 신고 시스템 ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.post_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type   TEXT NOT NULL,                           -- 'secondhand' | 'jobs' | 'sharing' | 'board' 등
  target_id     UUID NOT NULL,
  target_user_id UUID,                                   -- 피신고자(빠른 조회용)
  reason        TEXT NOT NULL,                           -- 'commercial' | 'spam' | 'fraud' | 'inappropriate' | 'other'
  reason_detail TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',         -- pending | resolved | dismissed
  resolved_by   UUID REFERENCES auth.users(id),
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(reporter_id, target_type, target_id)            -- 중복 신고 방지
);

CREATE INDEX IF NOT EXISTS idx_post_reports_target      ON public.post_reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_post_reports_status      ON public.post_reports(status);
CREATE INDEX IF NOT EXISTS idx_post_reports_target_user ON public.post_reports(target_user_id);
CREATE INDEX IF NOT EXISTS idx_post_reports_created_at  ON public.post_reports(created_at DESC);

-- ───── 4. 키워드 필터 (관리자 설정) ──────────────────────────
-- 관리자가 대시보드에서 CRUD 할 업자/스팸 키워드 목록
CREATE TABLE IF NOT EXISTS public.moderation_keywords (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword     TEXT NOT NULL UNIQUE,
  scope       TEXT NOT NULL DEFAULT 'all',   -- all | secondhand | jobs
  action      TEXT NOT NULL DEFAULT 'flag',  -- flag(숨김+관리자큐) | block(등록자체차단) | warn(경고만)
  note        TEXT,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_keywords_scope ON public.moderation_keywords(scope);

-- 기본 업자 의심 키워드 몇 개 시드 (관리자가 나중에 편집 가능)
INSERT INTO public.moderation_keywords (keyword, scope, action, note) VALUES
  ('사업자',       'all',         'flag', '업자 의심'),
  ('세금계산서',   'all',         'flag', '업자 의심'),
  ('도매',         'all',         'flag', '업자 의심'),
  ('A/S 가능',     'secondhand',  'flag', '업자 의심'),
  ('정품 보장',    'secondhand',  'flag', '업자 의심'),
  ('택배비별도',   'secondhand',  'flag', '업자 의심'),
  ('계좌입금만',   'all',         'flag', '사기 위험'),
  ('비트코인',     'all',         'flag', '사기 위험')
ON CONFLICT (keyword) DO NOTHING;

-- ───── 5. 게시 이력 (Rate limit 추적) ────────────────────────
-- 단순: secondhand_posts/jobs_posts 의 created_at + user_id 만으로 하루 카운트 가능
-- 별도 테이블은 만들지 않고 API 레벨에서 집계 쿼리로 체크

-- ───── 6. RLS 정책 ──────────────────────────────────────
ALTER TABLE public.secondhand_posts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secondhand_likes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs_posts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs_likes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_reports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_keywords  ENABLE ROW LEVEL SECURITY;

-- secondhand_posts: 누구나 SELECT, 본인만 INSERT/UPDATE/DELETE (관리자는 API 레벨에서 처리)
DROP POLICY IF EXISTS "secondhand_select_all" ON public.secondhand_posts;
CREATE POLICY "secondhand_select_all" ON public.secondhand_posts
  FOR SELECT USING (status != 'hidden' OR auth.uid() = user_id);
DROP POLICY IF EXISTS "secondhand_insert_own" ON public.secondhand_posts;
CREATE POLICY "secondhand_insert_own" ON public.secondhand_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "secondhand_update_own" ON public.secondhand_posts;
CREATE POLICY "secondhand_update_own" ON public.secondhand_posts
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "secondhand_delete_own" ON public.secondhand_posts;
CREATE POLICY "secondhand_delete_own" ON public.secondhand_posts
  FOR DELETE USING (auth.uid() = user_id);

-- jobs_posts: 동일 패턴
DROP POLICY IF EXISTS "jobs_select_all" ON public.jobs_posts;
CREATE POLICY "jobs_select_all" ON public.jobs_posts
  FOR SELECT USING (status != 'hidden' OR auth.uid() = user_id);
DROP POLICY IF EXISTS "jobs_insert_own" ON public.jobs_posts;
CREATE POLICY "jobs_insert_own" ON public.jobs_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "jobs_update_own" ON public.jobs_posts;
CREATE POLICY "jobs_update_own" ON public.jobs_posts
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "jobs_delete_own" ON public.jobs_posts;
CREATE POLICY "jobs_delete_own" ON public.jobs_posts
  FOR DELETE USING (auth.uid() = user_id);

-- likes: 본인만 INSERT/DELETE, 모두 SELECT
DROP POLICY IF EXISTS "secondhand_likes_select_all" ON public.secondhand_likes;
CREATE POLICY "secondhand_likes_select_all" ON public.secondhand_likes
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "secondhand_likes_insert_own" ON public.secondhand_likes;
CREATE POLICY "secondhand_likes_insert_own" ON public.secondhand_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "secondhand_likes_delete_own" ON public.secondhand_likes;
CREATE POLICY "secondhand_likes_delete_own" ON public.secondhand_likes
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "jobs_likes_select_all" ON public.jobs_likes;
CREATE POLICY "jobs_likes_select_all" ON public.jobs_likes
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "jobs_likes_insert_own" ON public.jobs_likes;
CREATE POLICY "jobs_likes_insert_own" ON public.jobs_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "jobs_likes_delete_own" ON public.jobs_likes;
CREATE POLICY "jobs_likes_delete_own" ON public.jobs_likes
  FOR DELETE USING (auth.uid() = user_id);

-- post_reports: 본인 신고는 조회 가능, 관리자는 API 레벨에서 service role 사용
DROP POLICY IF EXISTS "reports_select_own" ON public.post_reports;
CREATE POLICY "reports_select_own" ON public.post_reports
  FOR SELECT USING (auth.uid() = reporter_id);
DROP POLICY IF EXISTS "reports_insert_own" ON public.post_reports;
CREATE POLICY "reports_insert_own" ON public.post_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- moderation_keywords: 모두 SELECT (필터 적용 위해 클라이언트까진 아니어도 server 에서 읽어야 함)
DROP POLICY IF EXISTS "moderation_keywords_select_all" ON public.moderation_keywords;
CREATE POLICY "moderation_keywords_select_all" ON public.moderation_keywords
  FOR SELECT USING (true);
-- INSERT/UPDATE/DELETE 는 API 레벨(관리자만)

-- ───── 7. 집계용 RPC: 하루 게시글 수 확인 ────────────────────
CREATE OR REPLACE FUNCTION public.count_user_posts_today(
  p_user_id UUID,
  p_table   TEXT    -- 'secondhand_posts' | 'jobs_posts'
) RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_table = 'secondhand_posts' THEN
    SELECT COUNT(*)::INT INTO v_count
      FROM public.secondhand_posts
      WHERE user_id = p_user_id
        AND created_at >= (NOW() - INTERVAL '24 hours');
  ELSIF p_table = 'jobs_posts' THEN
    SELECT COUNT(*)::INT INTO v_count
      FROM public.jobs_posts
      WHERE user_id = p_user_id
        AND created_at >= (NOW() - INTERVAL '24 hours');
  ELSE
    v_count := 0;
  END IF;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.count_user_posts_today(UUID, TEXT) TO authenticated;

COMMENT ON TABLE public.secondhand_posts     IS '중고거래 게시글';
COMMENT ON TABLE public.jobs_posts           IS '구인구직 게시글 (알바 중심)';
COMMENT ON TABLE public.post_reports         IS '게시글 신고 기록 (모든 게시판 통합)';
COMMENT ON TABLE public.moderation_keywords  IS '관리자 설정 업자/스팸 필터 키워드';
