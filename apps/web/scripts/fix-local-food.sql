-- local_food 테이블 삭제 (기존 잘못된 구조)
DROP TABLE IF EXISTS local_food_likes CASCADE;
DROP TABLE IF EXISTS local_food CASCADE;

-- local_food 테이블 생성 (user_id로 올바르게 설정)
CREATE TABLE IF NOT EXISTS local_food (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  content TEXT,
  price INTEGER,
  original_price INTEGER,
  unit TEXT DEFAULT '1kg',
  category TEXT DEFAULT '채소',
  images TEXT[],
  location TEXT,
  district TEXT,
  status TEXT DEFAULT 'available',
  view_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- local_food_likes 테이블
CREATE TABLE IF NOT EXISTS local_food_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  local_food_id UUID REFERENCES local_food(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, local_food_id)
);

-- RLS 활성화
ALTER TABLE local_food ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_food_likes ENABLE ROW LEVEL SECURITY;

-- local_food RLS 정책
CREATE POLICY "Anyone can view local_food" ON local_food FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert local_food" ON local_food FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Authors can update local_food" ON local_food FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Authors can delete local_food" ON local_food FOR DELETE USING (auth.uid() = user_id);

-- local_food_likes RLS 정책
CREATE POLICY "Anyone can view local_food_likes" ON local_food_likes FOR SELECT USING (true);
CREATE POLICY "Users can manage their own local_food_likes" ON local_food_likes FOR ALL USING (user_id = auth.uid());

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_local_food_user_id ON local_food(user_id);
CREATE INDEX IF NOT EXISTS idx_local_food_district ON local_food(district);
CREATE INDEX IF NOT EXISTS idx_local_food_category ON local_food(category);
CREATE INDEX IF NOT EXISTS idx_local_food_created_at ON local_food(created_at DESC);
