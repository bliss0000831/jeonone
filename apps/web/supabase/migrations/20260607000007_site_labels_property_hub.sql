-- ============================================================================
-- "매물 더 보기" 접이식 허브 + 그 안의 3 카드 (공인중개사·일반인·의뢰)
-- 슈퍼관리자 편집용 키 시드
-- ============================================================================

INSERT INTO public.site_labels (key, value, fallback, description, group_name, sort_order, max_length, recommended_size) VALUES

-- 매물 허브 메인
('home.hub.property.icon',     '', '', '"매물 더 보기" 알약 아이콘 (예: 🏘)', 'home-hub', 100, 4, '정사각 64x64px (PNG/WebP, 투명 배경)'),
('home.hub.property.title',    '매물 더 보기', '매물 더 보기',
 '"매물 더 보기" 알약 제목. 권장 6~10자', 'home-hub', 101, 14, NULL),
('home.hub.property.subtitle', '공인중개사 · 일반인 · 의뢰 요청', '공인중개사 · 일반인 · 의뢰 요청',
 '알약 부제. 권장 12~24자', 'home-hub', 102, 30, NULL),

-- 매물 허브 ▸ 공인중개사 매물
('home.hub.property.agent.icon',     '', '', '공인중개사 매물 카드 아이콘', 'home-hub', 110, 4, '정사각 80x80px (PNG/WebP)'),
('home.hub.property.agent.title',    '공인중개사 매물', '공인중개사 매물',
 '카드 제목. 권장 4~10자', 'home-hub', 111, 14, NULL),
('home.hub.property.agent.subtitle', '검증된 중개사 매물', '검증된 중개사 매물',
 '카드 부제. 권장 6~14자', 'home-hub', 112, 18, NULL),

-- 매물 허브 ▸ 일반인 매물
('home.hub.property.individual.icon',     '', '', '일반인 매물 카드 아이콘', 'home-hub', 120, 4, '정사각 80x80px (PNG/WebP)'),
('home.hub.property.individual.title',    '일반인 매물', '일반인 매물',
 '카드 제목. 권장 4~10자', 'home-hub', 121, 14, NULL),
('home.hub.property.individual.subtitle', '이웃이 내놓은 매물', '이웃이 내놓은 매물',
 '카드 부제. 권장 6~14자', 'home-hub', 122, 18, NULL),

-- 매물 허브 ▸ 구해주세요(의뢰)
('home.hub.property.request.icon',     '', '', '구해주세요 카드 아이콘', 'home-hub', 130, 4, '정사각 80x80px (PNG/WebP)'),
('home.hub.property.request.title',    '구해주세요', '구해주세요',
 '카드 제목. 권장 4~10자', 'home-hub', 131, 14, NULL),
('home.hub.property.request.subtitle', '중개사에게 매물 요청', '중개사에게 매물 요청',
 '카드 부제. 권장 6~14자', 'home-hub', 132, 18, NULL),

-- 우리동네 홈즈 메인 (홈케어 묶음 헤더)
('home.section.holmes.title2', '우리동네 홈즈', '우리동네 홈즈',
 '홈즈 섹션 헤더 제목. 권장 6~12자', 'home-hub', 200, 14, NULL),
('home.section.holmes.subtitle2', '집 꾸미기부터 이사까지', '집 꾸미기부터 이사까지',
 '홈즈 부제. 권장 8~16자', 'home-hub', 201, 20, NULL)

ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
