-- Add images column to board_comments
ALTER TABLE board_comments ADD COLUMN IF NOT EXISTS images text[] DEFAULT ARRAY[]::text[];

-- Add thumbnail_url to board_posts (optional - we can derive from images[0])
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS thumbnail_url text DEFAULT NULL;
