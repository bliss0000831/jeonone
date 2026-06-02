-- ============================================================================
-- 홈 화면 위젯 (내 주변 화장실 / 주유소 등) 헤더 라벨·아이콘 시드
-- ============================================================================

INSERT INTO public.site_labels (key, value, fallback, description, group_name, sort_order, max_length, recommended_size) VALUES

-- 내 주변 화장실 위젯 헤더
('home.widget.toilets.icon',     '', '', '내 주변 화장실 위젯 아이콘', 'home-widgets', 100, 4, '정사각 96x96px (PNG/WebP, 투명 배경)'),
('home.widget.toilets.title',    '내 주변 화장실', '내 주변 화장실',
 '위젯 제목. 권장 6~10자', 'home-widgets', 101, 14, NULL),
('home.widget.toilets.subtitle', '반경 1km 이내 공공화장실', '반경 1km 이내 공공화장실',
 '위젯 부제. 권장 12~20자', 'home-widgets', 102, 24, NULL),

-- 춘천 소식 위젯 헤더 ({{plaza_city}} 토큰으로 도시명 자동 치환)
('home.widget.news.icon',     '', '', '광장 소식 위젯 아이콘 (예: 📰)', 'home-widgets', 200, 4, '정사각 96x96px (PNG/WebP, 투명 배경)'),
('home.widget.news.title',    '{{plaza_city}} 소식', '{{plaza_city}} 소식',
 '위젯 제목. 권장 4~10자. {{plaza_city}} = 광장 도시명', 'home-widgets', 201, 14, NULL),
('home.widget.news.subtitle', '뉴스 · 행사 · 날씨 한눈에', '뉴스 · 행사 · 날씨 한눈에',
 '위젯 부제. 권장 12~24자', 'home-widgets', 202, 24, NULL)

ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
