-- 사용자 프로필 테이블
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname TEXT,
  phone TEXT,
  avatar_url TEXT,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_delete_own" ON public.profiles FOR DELETE USING (auth.uid() = id);

-- 매물 테이블
CREATE TABLE IF NOT EXISTS public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  property_type TEXT NOT NULL CHECK (property_type IN ('아파트', '빌라', '오피스텔', '원룸', '투룸', '주택', '상가', '사무실', '토지')),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('매매', '전세', '월세')),
  price BIGINT NOT NULL,
  deposit BIGINT,
  monthly_rent BIGINT,
  area_sqm DECIMAL(10, 2) NOT NULL,
  floor INTEGER,
  total_floors INTEGER,
  rooms INTEGER,
  bathrooms INTEGER,
  direction TEXT,
  parking BOOLEAN DEFAULT FALSE,
  elevator BOOLEAN DEFAULT FALSE,
  pets_allowed BOOLEAN DEFAULT FALSE,
  location TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  description TEXT,
  features TEXT[],
  images TEXT[],
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'reserved', 'completed', 'hidden')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 활성 매물을 볼 수 있음
CREATE POLICY "properties_select_all" ON public.properties FOR SELECT USING (status = 'active' OR auth.uid() = user_id);
-- 로그인한 사용자만 매물 등록 가능
CREATE POLICY "properties_insert_own" ON public.properties FOR INSERT WITH CHECK (auth.uid() = user_id);
-- 본인 매물만 수정 가능
CREATE POLICY "properties_update_own" ON public.properties FOR UPDATE USING (auth.uid() = user_id);
-- 본인 매물만 삭제 가능
CREATE POLICY "properties_delete_own" ON public.properties FOR DELETE USING (auth.uid() = user_id);

-- 찜 테이블
CREATE TABLE IF NOT EXISTS public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, property_id)
);

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "favorites_select_own" ON public.favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "favorites_insert_own" ON public.favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "favorites_delete_own" ON public.favorites FOR DELETE USING (auth.uid() = user_id);

-- 채팅방 테이블
CREATE TABLE IF NOT EXISTS public.chat_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(property_id, buyer_id, seller_id)
);

ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_rooms_select_own" ON public.chat_rooms FOR SELECT USING (auth.uid() = buyer_id OR auth.uid() = seller_id);
CREATE POLICY "chat_rooms_insert_own" ON public.chat_rooms FOR INSERT WITH CHECK (auth.uid() = buyer_id);

-- 채팅 메시지 테이블
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 채팅방 참여자만 메시지 조회 가능
CREATE POLICY "messages_select_own" ON public.messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.chat_rooms 
    WHERE id = room_id AND (buyer_id = auth.uid() OR seller_id = auth.uid())
  )
);
-- 채팅방 참여자만 메시지 전송 가능
CREATE POLICY "messages_insert_own" ON public.messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (
    SELECT 1 FROM public.chat_rooms 
    WHERE id = room_id AND (buyer_id = auth.uid() OR seller_id = auth.uid())
  )
);
