-- 인테리어 게시글 테이블 생성
CREATE TABLE IF NOT EXISTS interior_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- 기본 정보
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  
  -- 카테고리 (시공, 수리, 청소, 이사, 기타)
  category VARCHAR(50) NOT NULL DEFAULT '시공',
  
  -- 서비스 지역
  service_region VARCHAR(100),
  service_district VARCHAR(100),
  
  -- 이미지 (최대 10장)
  images TEXT[] DEFAULT '{}',
  
  -- 연락처
  contact_phone VARCHAR(20),
  
  -- 가격 정보
  min_price INTEGER,
  max_price INTEGER,
  price_unit VARCHAR(20) DEFAULT '만원',
  
  -- 통계
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  
  -- 상태
  status VARCHAR(20) DEFAULT 'active',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_interior_posts_user_id ON interior_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_interior_posts_category ON interior_posts(category);
CREATE INDEX IF NOT EXISTS idx_interior_posts_service_region ON interior_posts(service_region);
CREATE INDEX IF NOT EXISTS idx_interior_posts_created_at ON interior_posts(created_at DESC);

-- RLS 정책 설정
ALTER TABLE interior_posts ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 조회 가능
DROP POLICY IF EXISTS "Interior posts are viewable by everyone" ON interior_posts;
CREATE POLICY "Interior posts are viewable by everyone" ON interior_posts
  FOR SELECT USING (true);

-- 인테리어 권한을 가진 사용자만 생성 가능
DROP POLICY IF EXISTS "Interior users can create posts" ON interior_posts;
CREATE POLICY "Interior users can create posts" ON interior_posts
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND 
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND account_type = 'interior'
    )
  );

-- 본인 글만 수정 가능
DROP POLICY IF EXISTS "Users can update own interior posts" ON interior_posts;
CREATE POLICY "Users can update own interior posts" ON interior_posts
  FOR UPDATE USING (auth.uid() = user_id);

-- 본인 글만 삭제 가능
DROP POLICY IF EXISTS "Users can delete own interior posts" ON interior_posts;
CREATE POLICY "Users can delete own interior posts" ON interior_posts
  FOR DELETE USING (auth.uid() = user_id);

-- 인테리어 찜 테이블
CREATE TABLE IF NOT EXISTS interior_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES interior_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, post_id)
);

-- RLS for favorites
ALTER TABLE interior_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own interior favorites" ON interior_favorites;
CREATE POLICY "Users can view own interior favorites" ON interior_favorites
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create interior favorites" ON interior_favorites;
CREATE POLICY "Users can create interior favorites" ON interior_favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own interior favorites" ON interior_favorites;
CREATE POLICY "Users can delete own interior favorites" ON interior_favorites
  FOR DELETE USING (auth.uid() = user_id);
