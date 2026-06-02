-- ============================================================================
-- site_labels — 홈 화면 미니 네비 (8-아이콘 스트립) + 섹션 카드 헤더 아이콘 시드
--
-- 이미 nav-icons / home-icons 그룹은 있지만 home-page.tsx 에서 추가로 쓰이는
-- 아이콘 자리들이 있어 키를 보충한다.
-- ============================================================================

INSERT INTO public.site_labels (key, value, fallback, description, group_name, sort_order, max_length, recommended_size) VALUES

-- 홈 미니 네비 (상단 컬러 바 8 아이콘)
('home.minimav.board.icon',         '', '', '홈 미니네비 — 게시판 아이콘',         'home-mininav-icons', 1, 4, '정사각 64x64px (PNG/WebP, 투명 배경)'),
('home.minimav.secondhand.icon',    '', '', '홈 미니네비 — 중고거래 아이콘',       'home-mininav-icons', 2, 4, '정사각 64x64px (PNG/WebP, 투명 배경)'),
('home.minimav.sharing.icon',       '', '', '홈 미니네비 — 나눔 아이콘',           'home-mininav-icons', 3, 4, '정사각 64x64px (PNG/WebP, 투명 배경)'),
('home.minimav.clubs.icon',         '', '', '홈 미니네비 — 모임 아이콘',           'home-mininav-icons', 4, 4, '정사각 64x64px (PNG/WebP, 투명 배경)'),
('home.minimav.local_food.icon',    '', '', '홈 미니네비 — 로컬푸드 아이콘',       'home-mininav-icons', 5, 4, '정사각 64x64px (PNG/WebP, 투명 배경)'),
('home.minimav.group_buying.icon',  '', '', '홈 미니네비 — 공동구매 아이콘',       'home-mininav-icons', 6, 4, '정사각 64x64px (PNG/WebP, 투명 배경)'),
('home.minimav.jobs.icon',          '', '', '홈 미니네비 — 구인구직 아이콘',       'home-mininav-icons', 7, 4, '정사각 64x64px (PNG/WebP, 투명 배경)'),
('home.minimav.new_store.icon',     '', '', '홈 미니네비 — 신장개업 아이콘',       'home-mininav-icons', 8, 4, '정사각 64x64px (PNG/WebP, 투명 배경)'),

-- 섹션 카드 헤더 아이콘 (이미 home.section.*.icon 시드는 있으나, 일자리/모임 분리 카드 헤더용 별도 아이콘)
('home.section.holmes.header_icon',  '', '', '홈즈 섹션 헤더 작은 아이콘',         'home-section-icons', 100, 4, '정사각 64x64px (PNG/WebP)'),
('home.section.realestate.header_icon','', '', '매물 섹션 헤더 작은 아이콘',       'home-section-icons', 101, 4, '정사각 64x64px (PNG/WebP)'),
('home.section.market.header_icon',  '', '', '동네장터 섹션 헤더 작은 아이콘',     'home-section-icons', 102, 4, '정사각 64x64px (PNG/WebP)'),
('home.section.fresh.header_icon',   '', '', '신선식품 섹션 헤더 작은 아이콘',     'home-section-icons', 103, 4, '정사각 64x64px (PNG/WebP)'),
('home.section.jobs_clubs.header_icon','', '', '일자리/모임 섹션 헤더 작은 아이콘','home-section-icons', 104, 4, '정사각 64x64px (PNG/WebP)')

ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
