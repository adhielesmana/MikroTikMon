-- Migration: Add is_superadmin column to users table
-- Date: 2025-11-02
-- Description: Adds the is_superadmin flag to distinguish hardcoded superadmin from regular admins

-- Add is_superadmin column with default false
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT false;

-- Set the hardcoded superadmin (adhielesmana) to is_superadmin = true
UPDATE users SET is_superadmin = true WHERE id = 'super-admin-001';

-- Create the hardcoded superadmin user if it doesn't exist
INSERT INTO users (
  id, 
  username, 
  email, 
  first_name, 
  last_name, 
  profile_image_url, 
  password_hash, 
  must_change_password, 
  role, 
  is_superadmin, 
  enabled
) VALUES (
  'super-admin-001',
  'adhielesmana',
  'adhielesmana@local',
  'Super',
  'Admin',
  '',
  '$2b$10$ASst66/GZvS3LHAnC5671ep42D8MQtyPguAkUMFittEvbrXXg//tW', -- password: admin123
  false,
  'admin',
  true,
  true
)
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  password_hash = EXCLUDED.password_hash,
  is_superadmin = true,
  enabled = true,
  must_change_password = false;

-- Verify the migration
SELECT id, username, email, role, is_superadmin, enabled FROM users WHERE is_superadmin = true;
