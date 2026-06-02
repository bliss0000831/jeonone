-- ============================================================================
-- 사이트 라벨 — 아이콘 오버라이드 키 추가
--
-- 각 네비/홈 항목의 아이콘을 슈퍼관리자가 이모지로 덮어쓸 수 있도록.
-- value 가 비어있으면 코드의 기본 lucide 아이콘 사용, 값이 있으면 이모지 렌더링.
-- ============================================================================

INSERT INTO public.site_labels (key, value, fallback, description, group_name, sort_order, max_length) VALUES

-- 햄버거 메뉴 아이콘 (이모지 권장 — 비어있으면 기본 아이콘)
('nav.plaza_news.icon',     '', '', '광장 소식 아이콘. 이모지(예: 📰) 입력하면 덮어씀. 비우면 기본 아이콘.',  'nav-icons', 101, 4),
('nav.toilets.icon',        '', '', '내 주변 화장실 아이콘.',                                                'nav-icons', 110, 4),
('nav.gas_stations.icon',   '', '', '내 주변 주유소 아이콘.',                                                'nav-icons', 120, 4),
('nav.realestate.icon',     '', '', '부동산 아이콘 (예: 🏠).',                                              'nav-icons', 201, 4),
('nav.holmes.icon',         '', '', '홈즈 아이콘 (예: 🛠).',                                                'nav-icons', 202, 4),
('nav.new_store.icon',      '', '', '신장개업 아이콘 (예: 🎉).',                                            'nav-icons', 203, 4),
('nav.clubs.icon',          '', '', '모임 아이콘 (예: 👥).',                                                'nav-icons', 204, 4),
('nav.secondhand.icon',     '', '', '중고거래 아이콘 (예: 🛍).',                                            'nav-icons', 301, 4),
('nav.sharing.icon',        '', '', '나눔 아이콘 (예: 🎁).',                                                'nav-icons', 302, 4),
('nav.jobs.icon',           '', '', '구인구직 아이콘 (예: 💼).',                                            'nav-icons', 303, 4),
('nav.group_buying.icon',   '', '', '공동구매 아이콘 (예: 🛒).',                                            'nav-icons', 304, 4),
('nav.local_food.icon',     '', '', '로컬푸드 아이콘 (예: 🥬).',                                            'nav-icons', 305, 4),
('nav.board.free.icon',     '', '', '자유게시판 아이콘.',                                                    'nav-icons', 401, 4),
('nav.board.restaurant.icon','', '', '맛집 추천 아이콘 (예: 🍽).',                                          'nav-icons', 402, 4),
('nav.board.living.icon',   '', '', '생활 정보 아이콘 (예: 💡).',                                           'nav-icons', 403, 4),
('nav.board.daily.icon',    '', '', '일상 공유 아이콘 (예: 📷).',                                           'nav-icons', 404, 4),
('nav.board.qna.icon',      '', '', '질문 답변 아이콘 (예: ❓).',                                           'nav-icons', 405, 4)

ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
