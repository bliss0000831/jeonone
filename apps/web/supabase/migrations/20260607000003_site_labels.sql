-- ============================================================================
-- 사이트 라벨 (Site Labels) — 슈퍼관리자 전역 텍스트 관리
--
-- 햄버거 메뉴, 섹션 헤더 등 화면 라벨을 코드 수정 없이 슈퍼관리자가
-- 변경할 수 있도록 하는 키/값 저장소. 모든 광장에 동일 적용.
--
-- key 네이밍 컨벤션: <scope>.<area>.<element>
--   예: nav.realestate.label, nav.realestate.helper
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.site_labels (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  fallback    TEXT NOT NULL,
  description TEXT,                    -- 슈퍼관리자에게 보여줄 가이드(크기 권장 등)
  group_name  TEXT NOT NULL DEFAULT 'misc',
  sort_order  INT  NOT NULL DEFAULT 0,
  max_length  INT,                     -- 권장 최대 글자수 (UI 힌트)
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID
);

ALTER TABLE public.site_labels ENABLE ROW LEVEL SECURITY;

-- 모든 사용자(비로그인 포함) 읽기 가능
DROP POLICY IF EXISTS site_labels_read ON public.site_labels;
CREATE POLICY site_labels_read ON public.site_labels
  FOR SELECT TO public USING (true);

-- 쓰기는 서버(service role) 만 — 슈퍼관리자 엔드포인트가 service role 로 처리

-- ── 초기 시드 ────────────────────────────────────────────────────────
-- {{plaza_city}} 토큰은 런타임에 광장 도시명으로 치환됨 (예: 춘천)

INSERT INTO public.site_labels (key, value, fallback, description, group_name, sort_order, max_length) VALUES

-- 햄버거 ▸ 광장 정보
('nav.section.plaza_info',     '{{plaza_city}} 정보',       '{{plaza_city}} 정보',
 '햄버거 첫 섹션 헤더. {{plaza_city}} 토큰 사용 가능 (광장 도시명 자동 치환)', 'nav', 100, 12),

('nav.plaza_news.label',       '{{plaza_city}} 소식',       '{{plaza_city}} 소식',
 '광장 뉴스/행사 진입 항목. 권장 6~10자', 'nav', 101, 12),
('nav.plaza_news.helper',      '뉴스 · 행사 · 날씨 한눈에',  '뉴스 · 행사 · 날씨 한눈에',
 '항목 부제. 권장 12~20자, 너무 길면 줄임표 처리됨', 'nav', 102, 24),

('nav.toilets.label',          '내 주변 화장실',             '내 주변 화장실',
 '내 주변 화장실 진입. 권장 6~10자', 'nav', 110, 12),
('nav.toilets.helper',         '반경 1km 공공화장실 찾기',   '반경 1km 공공화장실 찾기',
 '항목 부제. 권장 12~24자', 'nav', 111, 30),

('nav.gas_stations.label',     '내 주변 주유소',             '내 주변 주유소',
 '주유소 진입. 권장 6~10자', 'nav', 120, 12),
('nav.gas_stations.helper',    '실시간 가격 + 저렴한 순위',  '실시간 가격 + 저렴한 순위',
 '항목 부제. 권장 12~24자', 'nav', 121, 30),

-- 햄버거 ▸ 우리동네
('nav.section.community',      '우리동네',                   '우리동네',
 '두번째 섹션 헤더. 권장 4~6자', 'nav', 200, 8),
('nav.realestate.label',       '부동산',                     '부동산',
 '카테고리 라벨. 권장 2~4자', 'nav', 201, 6),
('nav.holmes.label',           '홈즈',                       '홈즈',
 '인테리어/이사/청소/수리 묶음. 권장 2~4자', 'nav', 202, 6),
('nav.new_store.label',        '신장개업',                   '신장개업',
 '새로 오픈한 가게. 권장 2~4자', 'nav', 203, 6),
('nav.clubs.label',            '모임',                       '모임',
 '동호회/소모임. 권장 2~4자', 'nav', 204, 6),

-- 햄버거 ▸ 동네장터
('nav.section.market',         '동네장터',                   '동네장터',
 '세번째 섹션 헤더. 권장 4~6자', 'nav', 300, 8),
('nav.secondhand.label',       '중고거래',                   '중고거래',
 '권장 2~4자', 'nav', 301, 6),
('nav.sharing.label',          '나눔',                       '나눔',
 '권장 2~4자', 'nav', 302, 6),
('nav.jobs.label',             '구인구직',                   '구인구직',
 '권장 2~4자', 'nav', 303, 6),
('nav.group_buying.label',     '공동구매',                   '공동구매',
 '권장 2~4자', 'nav', 304, 6),
('nav.local_food.label',       '로컬푸드',                   '로컬푸드',
 '권장 2~4자', 'nav', 305, 6),

-- 햄버거 ▸ 게시판
('nav.section.boards',         '게시판',                     '게시판',
 '네번째 섹션 헤더. 권장 4~6자', 'nav', 400, 8),
('nav.board.free.label',       '자유게시판',                 '자유게시판',
 '권장 4~8자', 'nav', 401, 10),
('nav.board.restaurant.label', '맛집 추천',                  '맛집 추천',
 '권장 4~8자', 'nav', 402, 10),
('nav.board.living.label',     '생활 정보',                  '생활 정보',
 '권장 4~8자', 'nav', 403, 10),
('nav.board.daily.label',      '일상 공유',                  '일상 공유',
 '권장 4~8자', 'nav', 404, 10),
('nav.board.qna.label',        '질문 답변',                  '질문 답변',
 '권장 4~8자', 'nav', 405, 10),

-- 홈 화면 섹션 카드 (이미 admin/banners 에서 일부 관리되지만 슈퍼 레벨 기본값으로 유지)
('home.section.realestate.title',    '우리동네 매물',                    '우리동네 매물',
 '홈 매물 섹션 카드 제목. 권장 6~10자', 'home', 100, 16),
('home.section.realestate.subtitle', '춘천시 부동산 정보를 한눈에',      '춘천시 부동산 정보를 한눈에',
 '카드 부제. 권장 12~24자', 'home', 101, 30),

('home.section.holmes.title',        '우리동네 홈즈',                    '우리동네 홈즈',
 '홈 홈즈 섹션 카드 제목. 권장 6~10자', 'home', 200, 16),
('home.section.holmes.subtitle',     '집 꾸미기부터 이사까지',           '집 꾸미기부터 이사까지',
 '카드 부제. 권장 12~24자', 'home', 201, 30),

('home.section.market.title',        '중고거래 · 나눔',                  '중고거래 · 나눔',
 '홈 동네장터 카드 제목. 권장 6~12자', 'home', 300, 16),
('home.section.market.subtitle',     '동네 이웃과 거래하고 나눠요',      '동네 이웃과 거래하고 나눠요',
 '카드 부제. 권장 12~24자', 'home', 301, 30),

('home.section.fresh.title',         '같이 사고, 신선하게 먹고',         '같이 사고, 신선하게 먹고',
 '홈 공동구매·로컬푸드 카드 제목. 권장 6~16자', 'home', 400, 20),
('home.section.fresh.subtitle',      '공동구매 · 로컬푸드로 알뜰하게',   '공동구매 · 로컬푸드로 알뜰하게',
 '카드 부제. 권장 12~24자', 'home', 401, 30)

ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
