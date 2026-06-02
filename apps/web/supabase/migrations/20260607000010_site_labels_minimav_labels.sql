-- ============================================================================
-- 홈 미니네비 라벨 (게시판/중고거래 등 8개 텍스트) — 슈퍼관리자 편집 가능
-- ============================================================================

INSERT INTO public.site_labels (key, value, fallback, description, group_name, sort_order, max_length, recommended_size) VALUES

('home.minimav.board.label',        '게시판',   '게시판',   '미니네비 라벨 (권장 2~4자)', 'home-mininav', 1, 6, NULL),
('home.minimav.secondhand.label',   '중고거래', '중고거래', '미니네비 라벨', 'home-mininav', 2, 6, NULL),
('home.minimav.sharing.label',      '나눔',     '나눔',     '미니네비 라벨', 'home-mininav', 3, 6, NULL),
('home.minimav.clubs.label',        '모임',     '모임',     '미니네비 라벨', 'home-mininav', 4, 6, NULL),
('home.minimav.local_food.label',   '로컬푸드', '로컬푸드', '미니네비 라벨', 'home-mininav', 5, 6, NULL),
('home.minimav.group_buying.label', '공동구매', '공동구매', '미니네비 라벨', 'home-mininav', 6, 6, NULL),
('home.minimav.jobs.label',         '구인구직', '구인구직', '미니네비 라벨', 'home-mininav', 7, 6, NULL),
('home.minimav.new_store.label',    '신장개업', '신장개업', '미니네비 라벨', 'home-mininav', 8, 6, NULL)

ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
