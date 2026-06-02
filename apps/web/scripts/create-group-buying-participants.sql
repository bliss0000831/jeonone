-- Group buying participants table
CREATE TABLE IF NOT EXISTS group_buying_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES group_buying_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- Group buying wishlist table
CREATE TABLE IF NOT EXISTS group_buying_wishlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES group_buying_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- Enable RLS
ALTER TABLE group_buying_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_buying_wishlist ENABLE ROW LEVEL SECURITY;

-- Policies for participants
CREATE POLICY "Anyone can view participants" ON group_buying_participants
  FOR SELECT USING (true);

CREATE POLICY "Users can join group buying" ON group_buying_participants
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave group buying" ON group_buying_participants
  FOR DELETE USING (auth.uid() = user_id);

-- Policies for wishlist
CREATE POLICY "Users can view own wishlist" ON group_buying_wishlist
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can add to wishlist" ON group_buying_wishlist
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove from wishlist" ON group_buying_wishlist
  FOR DELETE USING (auth.uid() = user_id);
