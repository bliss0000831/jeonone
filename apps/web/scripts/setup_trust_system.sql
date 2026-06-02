-- 1. 프로필 테이블에 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trust_score DECIMAL(3,1) DEFAULT 36.5;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;

-- 2. 거래 후기 테이블 생성
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reviewed_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  chat_room_id UUID REFERENCES chat_rooms(id) ON DELETE SET NULL,
  
  -- 평가 항목 (1-5점)
  response_speed INTEGER CHECK (response_speed >= 1 AND response_speed <= 5),
  accuracy INTEGER CHECK (accuracy >= 1 AND accuracy <= 5),
  kindness INTEGER CHECK (kindness >= 1 AND kindness <= 5),
  
  -- 총점
  total_score DECIMAL(2,1) GENERATED ALWAYS AS (
    ROUND(((response_speed + accuracy + kindness) / 3.0)::numeric, 1)
  ) STORED,
  
  -- 후기 내용
  content TEXT,
  
  -- 거래 완료 여부
  transaction_completed BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 한 거래당 한 번만 후기 작성 가능
  UNIQUE(reviewer_id, reviewed_user_id, property_id)
);

-- 3. 리뷰 생성/수정 시 프로필의 신뢰지수 업데이트 트리거
CREATE OR REPLACE FUNCTION update_trust_score()
RETURNS TRIGGER AS $$
DECLARE
  avg_score DECIMAL(3,1);
  review_cnt INTEGER;
BEGIN
  SELECT 
    ROUND(AVG(total_score)::numeric, 1),
    COUNT(*)
  INTO avg_score, review_cnt
  FROM reviews
  WHERE reviewed_user_id = COALESCE(NEW.reviewed_user_id, OLD.reviewed_user_id);
  
  UPDATE profiles
  SET 
    trust_score = CASE 
      WHEN avg_score IS NOT NULL THEN ROUND((36.5 + (avg_score - 3) * 12.7)::numeric, 1)
      ELSE 36.5
    END,
    review_count = COALESCE(review_cnt, 0)
  WHERE id = COALESCE(NEW.reviewed_user_id, OLD.reviewed_user_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_trust_score ON reviews;
CREATE TRIGGER trigger_update_trust_score
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW
EXECUTE FUNCTION update_trust_score();

-- 4. RLS 정책 설정
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reviews are viewable by everyone" ON reviews;
CREATE POLICY "Reviews are viewable by everyone" ON reviews
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create reviews" ON reviews;
CREATE POLICY "Users can create reviews" ON reviews
  FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

DROP POLICY IF EXISTS "Users can update own reviews" ON reviews;
CREATE POLICY "Users can update own reviews" ON reviews
  FOR UPDATE USING (auth.uid() = reviewer_id);

DROP POLICY IF EXISTS "Users can delete own reviews" ON reviews;
CREATE POLICY "Users can delete own reviews" ON reviews
  FOR DELETE USING (auth.uid() = reviewer_id);
