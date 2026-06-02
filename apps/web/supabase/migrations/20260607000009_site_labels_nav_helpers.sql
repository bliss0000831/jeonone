-- ============================================================================
-- 햄버거 메뉴 — 각 항목 부제 (helper) 키 추가
-- 이미 nav.toilets.helper / plaza_news.helper / gas_stations.helper 는 있음.
-- 우리동네 / 동네장터 / 게시판 항목들에 부제 추가.
-- ============================================================================

INSERT INTO public.site_labels (key, value, fallback, description, group_name, sort_order, max_length, recommended_size) VALUES

-- 우리동네
('nav.realestate.helper', '공인중개사 매물',     '공인중개사 매물',     '부동산 항목 부제',   'nav', 201, 16, NULL),
('nav.holmes.helper',     '집 꾸미기부터 이사까지', '집 꾸미기부터 이사까지', '홈즈 항목 부제',     'nav', 202, 18, NULL),
('nav.new_store.helper',  '새로 문 연 가게',     '새로 문 연 가게',     '신장개업 항목 부제', 'nav', 203, 14, NULL),
('nav.clubs.helper',      '동네 사람들',         '동네 사람들',         '모임 항목 부제',     'nav', 204, 12, NULL),

-- 동네장터
('nav.secondhand.helper',   '동네 이웃과 거래',   '동네 이웃과 거래',   '중고거래 항목 부제', 'nav', 301, 14, NULL),
('nav.sharing.helper',      '무료로 나눠요',       '무료로 나눠요',       '나눔 항목 부제',     'nav', 302, 12, NULL),
('nav.jobs.helper',         '일도 취미도',         '일도 취미도',         '구인구직 항목 부제', 'nav', 303, 12, NULL),
('nav.group_buying.helper', '같이 사면 저렴',     '같이 사면 저렴',     '공동구매 항목 부제', 'nav', 304, 12, NULL),
('nav.local_food.helper',   '동네 신선 식재료',   '동네 신선 식재료',   '로컬푸드 항목 부제', 'nav', 305, 14, NULL),

-- 게시판
('nav.board.free.helper',       '무엇이든 이야기',   '무엇이든 이야기',   '자유게시판 부제',     'nav', 401, 14, NULL),
('nav.board.restaurant.helper', '가볼만한 가게',     '가볼만한 가게',     '맛집 추천 부제',       'nav', 402, 12, NULL),
('nav.board.living.helper',     '꿀팁 모음',         '꿀팁 모음',         '생활 정보 부제',       'nav', 403, 10, NULL),
('nav.board.daily.helper',      '오늘의 한 컷',     '오늘의 한 컷',     '일상 공유 부제',       'nav', 404, 12, NULL),
('nav.board.qna.helper',        '동네에 물어보기',   '동네에 물어보기',   '질문 답변 부제',       'nav', 405, 14, NULL),

-- 홈즈 sub-items 아이콘 (햄버거 펼침 안)
('nav.holmes.interior.icon', '', '', '인테리어 sub 아이콘', 'nav-icons', 220, 4, '정사각 64x64px (PNG/WebP)'),
('nav.holmes.moving.icon',   '', '', '이사 sub 아이콘',     'nav-icons', 221, 4, '정사각 64x64px (PNG/WebP)'),
('nav.holmes.cleaning.icon', '', '', '청소 sub 아이콘',     'nav-icons', 222, 4, '정사각 64x64px (PNG/WebP)'),
('nav.holmes.repair.icon',   '', '', '수리 sub 아이콘',     'nav-icons', 223, 4, '정사각 64x64px (PNG/WebP)')

ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
