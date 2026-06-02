-- Add account_type column to profiles (일반인 or 공인중개사)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'individual' CHECK (account_type IN ('individual', 'agent'));

-- Add role column to profiles (user, admin, superadmin)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'superadmin'));

-- Set superadmin for cloudnine0831@gmail.com
UPDATE profiles 
SET role = 'superadmin' 
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'cloudnine0831@gmail.com'
);

-- Add seller_type column to properties to track if posted by agent or individual
ALTER TABLE properties ADD COLUMN IF NOT EXISTS seller_type TEXT DEFAULT 'individual' CHECK (seller_type IN ('individual', 'agent'));
