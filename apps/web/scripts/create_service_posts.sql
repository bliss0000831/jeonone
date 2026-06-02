-- 기존 인테리어 테이블을 서비스 테이블로 확장 (이미 interior_posts가 있다면 그대로 사용)
-- 새로운 서비스 유형: moving(이사), cleaning(청소), repair(수리)

-- 기존 체크 제약조건 삭제 후 새로운 제약조건 추가
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_account_type_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_account_type_check 
CHECK (account_type IN ('individual', 'agent', 'interior', 'moving', 'cleaning', 'repair'));

-- 이사 서비스 테이블
CREATE TABLE IF NOT EXISTS moving_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT '가정이사',
  service_region VARCHAR(100),
  service_district VARCHAR(100),
  images TEXT[] DEFAULT '{}',
  contact_phone VARCHAR(20),
  min_price INTEGER,
  max_price INTEGER,
  price_unit VARCHAR(20) DEFAULT '만원',
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 청소 서비스 테이블
CREATE TABLE IF NOT EXISTS cleaning_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT '입주청소',
  service_region VARCHAR(100),
  service_district VARCHAR(100),
  images TEXT[] DEFAULT '{}',
  contact_phone VARCHAR(20),
  min_price INTEGER,
  max_price INTEGER,
  price_unit VARCHAR(20) DEFAULT '만원',
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 수리 서비스 테이블
CREATE TABLE IF NOT EXISTS repair_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT '설비수리',
  service_region VARCHAR(100),
  service_district VARCHAR(100),
  images TEXT[] DEFAULT '{}',
  contact_phone VARCHAR(20),
  min_price INTEGER,
  max_price INTEGER,
  price_unit VARCHAR(20) DEFAULT '만원',
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 정책
ALTER TABLE moving_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaning_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_posts ENABLE ROW LEVEL SECURITY;

-- 이사 RLS
CREATE POLICY "Moving posts viewable by everyone" ON moving_posts FOR SELECT USING (true);
CREATE POLICY "Moving users can create posts" ON moving_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own moving posts" ON moving_posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own moving posts" ON moving_posts FOR DELETE USING (auth.uid() = user_id);

-- 청소 RLS
CREATE POLICY "Cleaning posts viewable by everyone" ON cleaning_posts FOR SELECT USING (true);
CREATE POLICY "Cleaning users can create posts" ON cleaning_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own cleaning posts" ON cleaning_posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own cleaning posts" ON cleaning_posts FOR DELETE USING (auth.uid() = user_id);

-- 수리 RLS
CREATE POLICY "Repair posts viewable by everyone" ON repair_posts FOR SELECT USING (true);
CREATE POLICY "Repair users can create posts" ON repair_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own repair posts" ON repair_posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own repair posts" ON repair_posts FOR DELETE USING (auth.uid() = user_id);
