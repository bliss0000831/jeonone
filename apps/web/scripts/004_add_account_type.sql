-- Add account_type column to profiles (individual or agent)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_type text DEFAULT 'individual';

-- Add role column to profiles (user, admin, superadmin)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';

-- Add seller_type column to properties
ALTER TABLE properties ADD COLUMN IF NOT EXISTS seller_type text DEFAULT 'individual';
