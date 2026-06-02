-- 홈 배너 테이블 생성
CREATE TABLE IF NOT EXISTS hero_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  href TEXT NOT NULL,
  gradient TEXT NOT NULL DEFAULT 'from-blue-500 to-cyan-500',
  icon TEXT NOT NULL DEFAULT 'Building2',
  image_url TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 기존 테이블에 image_url 컬럼 추가 (이미 테이블이 있는 경우)
ALTER TABLE hero_banners ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS hero_banners_order_idx ON hero_banners(order_index);
CREATE INDEX IF NOT EXISTS hero_banners_active_idx ON hero_banners(is_active);

-- RLS 정책 설정 (모두가 읽을 수 있지만, 관리자만 수정 가능)
ALTER TABLE hero_banners ENABLE ROW LEVEL SECURITY;

-- 읽기: 모두 허용
CREATE POLICY "Anyone can view active banners" ON hero_banners
  FOR SELECT USING (is_active = true);

-- 쓰기: 관리자만 허용
CREATE POLICY "Admins can manage banners" ON hero_banners
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- 기본 배너 데이터 삽입
INSERT INTO hero_banners (title, subtitle, description, href, gradient, icon, order_index, is_active) VALUES
('우리동네 매물', '믿을 수 있는 부동산 정보', '공인중개사와 일반 매물을 한눈에 확인하세요', '/properties', 'from-blue-500 to-cyan-500', 'Building2', 0, true),
('우리동네 홈즈', '전문가와 함께하는 주거 관리', '인테리어, 이사, 청소, 수리 전문가를 찾아보세요', '/interior', 'from-purple-500 to-pink-500', 'Home', 1, true),
('이웃과 나눔', '따뜻한 우리 동네 나눔', '필요한 물건을 나누고 이웃과 소통하세요', '/sharing', 'from-green-500 to-emerald-500', 'Heart', 2, true),
('함께 사면 싸다', '똑똑한 공동구매', '이웃과 함께 더 저렴하게 구매하세요', '/group-buying', 'from-orange-500 to-red-500', 'ShoppingCart', 3, true),
('새로 오픈했어요', '우리 동네 신규 매장', '새로 생긴 가게를 만나보세요', '/new-store', 'from-yellow-500 to-orange-500', 'Store', 4, true),
('전문가 초대하기', '채팅에서 전문가와 상담', '매물 채팅방에 전문가를 초대해보세요', '/chat', 'from-indigo-500 to-purple-500', 'Users', 5, true)
ON CONFLICT DO NOTHING;
