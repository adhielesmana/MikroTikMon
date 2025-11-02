-- Migration: Add user_routers junction table for router assignments
-- This allows super admins to assign routers to multiple users

-- Create user_routers table
CREATE TABLE IF NOT EXISTS user_routers (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  router_id VARCHAR NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
  assigned_by VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  
  -- Prevent duplicate assignments
  UNIQUE (user_id, router_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_routers_user ON user_routers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_routers_router ON user_routers(router_id);
