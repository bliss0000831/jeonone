-- ============================================================================
-- site_labels — 이미지 업로드 + 권장 사이즈 컬럼 추가
--
-- 슈퍼관리자가 라벨 자리에 이미지(로고/아이콘/배너)를 업로드해 텍스트/이모지
-- 대신 사용 가능. image_url 이 비어있으면 기존(텍스트 value 또는 lucide 아이콘)
-- 동작 그대로.
-- ============================================================================

ALTER TABLE public.site_labels
  ADD COLUMN IF NOT EXISTS image_url       TEXT,
  ADD COLUMN IF NOT EXISTS recommended_size TEXT;

COMMENT ON COLUMN public.site_labels.image_url IS
  '슈퍼관리자가 업로드한 이미지 URL. 설정 시 텍스트/이모지 대신 이 이미지가 표시됨.';
COMMENT ON COLUMN public.site_labels.recommended_size IS
  '권장 이미지 크기 안내. 예: "정사각 96x96px, PNG/WebP 권장"';

-- ── 권장 사이즈 가이드 채우기 ─────────────────────────────────
-- 햄버거 아이콘 (32x32 슬롯, 2x retina = 64x64)
UPDATE public.site_labels SET recommended_size = '정사각 64x64px (PNG/WebP, 투명 배경)'
WHERE group_name = 'nav-icons';

-- 홈 화면 카드 (디스플레이 약 64x64 슬롯, retina 128x128)
UPDATE public.site_labels SET recommended_size = '정사각 128x128px (PNG/WebP, 투명 배경)'
WHERE group_name = 'home' AND key LIKE '%.icon';

-- 텍스트 라벨에는 이미지 안내 안 함 (image_url 사용 권장 안 됨)

-- ── 추가 시드: 홈 화면 섹션 아이콘 키 (이미지 업로드 자리)──────────
INSERT INTO public.site_labels (key, value, fallback, description, group_name, sort_order, max_length, recommended_size) VALUES

('home.section.realestate.icon', '', '', '홈 매물 섹션 아이콘. 이미지 업로드 또는 이모지(예: 🏘) 가능.', 'home-icons', 100, 4,
 '정사각 128x128px (PNG/WebP, 투명 배경)'),
('home.section.holmes.icon',     '', '', '홈 홈즈 섹션 아이콘 (예: 🛠).',                                        'home-icons', 200, 4,
 '정사각 128x128px (PNG/WebP, 투명 배경)'),
('home.section.market.icon',     '', '', '홈 동네장터 카드 아이콘 (예: 🛍).',                                    'home-icons', 300, 4,
 '정사각 128x128px (PNG/WebP, 투명 배경)'),
('home.section.fresh.icon',      '', '', '홈 공동구매·로컬푸드 카드 아이콘 (예: 🥬).',                          'home-icons', 400, 4,
 '정사각 128x128px (PNG/WebP, 투명 배경)'),
('home.section.jobs_clubs.icon', '', '', '홈 일자리·모임 카드 아이콘 (예: 🎁).',                                 'home-icons', 500, 4,
 '정사각 128x128px (PNG/WebP, 투명 배경)'),

-- 동네 일자리·동네 모임 섹션도 (홈 화면 카드)
('home.section.jobs_clubs.title',    '동네 일자리 · 동네 모임',  '동네 일자리 · 동네 모임',
 '홈 일자리·모임 카드 제목. 권장 8~16자', 'home', 500, 20, NULL),
('home.section.jobs_clubs.subtitle', '일도 취미도 가까이',        '일도 취미도 가까이',
 '카드 부제. 권장 10~20자', 'home', 501, 24, NULL)

ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
