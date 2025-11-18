-- ============================================================================
-- MikroTik Network Monitoring Platform - Fresh Database Initialization
-- ============================================================================
-- This script creates all tables, indexes, and the hardcoded superadmin user
-- for a completely fresh deployment.
-- 
-- Usage:
--   psql -h your-host -U your-user -d your-database -f migrations/00_fresh_init.sql
--
-- OR use Drizzle Kit:
--   npm run db:push
-- ============================================================================

-- Drop all tables if they exist (for clean slate)
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS traffic_data CASCADE;
DROP TABLE IF EXISTS monitored_ports CASCADE;
DROP TABLE IF EXISTS routers CASCADE;
DROP TABLE IF EXISTS router_groups CASCADE;
DROP TABLE IF EXISTS app_settings CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;

-- ============================================================================
-- SESSIONS TABLE (Required for authentication)
-- ============================================================================
CREATE TABLE sessions (
  sid VARCHAR PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMP NOT NULL
);

CREATE INDEX idx_session_expire ON sessions(expire);

-- ============================================================================
-- USERS TABLE (Multi-provider authentication)
-- ============================================================================
CREATE TABLE users (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  username VARCHAR UNIQUE,                    -- For local authentication
  email VARCHAR UNIQUE,                        -- For OAuth providers
  first_name VARCHAR,
  last_name VARCHAR,
  profile_image_url VARCHAR,
  role VARCHAR(20) NOT NULL DEFAULT 'user',   -- 'admin' or 'user'
  is_superadmin BOOLEAN NOT NULL DEFAULT false, -- Hardcoded superadmin flag
  enabled BOOLEAN NOT NULL DEFAULT false,      -- Users disabled by default (approval required)
  password_hash TEXT,                          -- For local authentication
  must_change_password BOOLEAN NOT NULL DEFAULT false, -- Force password change
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert hardcoded superadmin (adhielesmana/admin123)
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
  enabled,
  created_at,
  updated_at
) VALUES (
  'super-admin-001',
  'adhielesmana',
  'adhielesmana@local',
  'Super',
  'Admin',
  '',
  '$2b$10$ASst66/GZvS3LHAnC5671ep42D8MQtyPguAkUMFittEvbrXXg//tW', -- bcrypt hash of 'admin123'
  false,
  'admin',
  true,
  true,
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- ROUTER GROUPS TABLE (Organization/categorization)
-- ============================================================================
CREATE TABLE router_groups (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  color VARCHAR(7) DEFAULT '#3b82f6',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- ============================================================================
-- ROUTERS TABLE (MikroTik router configurations)
-- ============================================================================
CREATE TABLE routers (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id VARCHAR REFERENCES router_groups(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  ip_address VARCHAR(255) NOT NULL,
  port INTEGER NOT NULL DEFAULT 8728,
  username VARCHAR(255) NOT NULL,
  encrypted_password TEXT NOT NULL,
  connected BOOLEAN NOT NULL DEFAULT false,
  reachable BOOLEAN NOT NULL DEFAULT false,
  last_connected TIMESTAMP,
  -- REST API configuration (RouterOS v7.1+)
  rest_enabled BOOLEAN NOT NULL DEFAULT false,
  rest_port INTEGER NOT NULL DEFAULT 443,
  -- SNMP configuration (fallback monitoring)
  snmp_enabled BOOLEAN NOT NULL DEFAULT false,
  snmp_community VARCHAR(255) DEFAULT 'public',
  snmp_version VARCHAR(10) DEFAULT '2c',
  snmp_port INTEGER NOT NULL DEFAULT 161,
  -- Interface display settings
  interface_display_mode VARCHAR(20) NOT NULL DEFAULT 'static',
  -- Connection optimization
  last_successful_connection_method VARCHAR(20) DEFAULT 'native',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- MONITORED PORTS TABLE (Interface monitoring configuration)
-- ============================================================================
CREATE TABLE monitored_ports (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  router_id VARCHAR NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
  port_name VARCHAR(255) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  min_threshold_bps INTEGER NOT NULL DEFAULT 0,
  email_notifications BOOLEAN NOT NULL DEFAULT true,
  popup_notifications BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(router_id, port_name)
);

-- ============================================================================
-- TRAFFIC DATA TABLE (Historical traffic metrics)
-- ============================================================================
CREATE TABLE traffic_data (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  router_id VARCHAR NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
  port_id VARCHAR REFERENCES monitored_ports(id) ON DELETE CASCADE,
  port_name VARCHAR(255) NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  rx_bytes_per_second REAL NOT NULL DEFAULT 0,
  tx_bytes_per_second REAL NOT NULL DEFAULT 0,
  total_bytes_per_second REAL NOT NULL DEFAULT 0
);

-- Optimized indexes for time-series queries
CREATE INDEX idx_traffic_data_router_port_name_time ON traffic_data(router_id, port_name, timestamp);
CREATE INDEX idx_traffic_data_timestamp ON traffic_data(timestamp);

-- ============================================================================
-- ALERTS TABLE (Threshold violation alerts)
-- ============================================================================
CREATE TABLE alerts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  router_id VARCHAR NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
  port_id VARCHAR NOT NULL REFERENCES monitored_ports(id) ON DELETE CASCADE,
  port_name VARCHAR(255) NOT NULL,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  severity VARCHAR(20) NOT NULL DEFAULT 'warning',
  message TEXT NOT NULL,
  current_traffic_bps REAL NOT NULL,
  threshold_bps REAL NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_alerts_user_created ON alerts(user_id, created_at);
CREATE INDEX idx_alerts_router ON alerts(router_id);

-- ============================================================================
-- NOTIFICATIONS TABLE (Notification history)
-- ============================================================================
CREATE TABLE notifications (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_id VARCHAR REFERENCES alerts(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_sent ON notifications(user_id, sent_at);

-- ============================================================================
-- APP SETTINGS TABLE (Global application configuration)
-- ============================================================================
CREATE TABLE app_settings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  logo_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Verify superadmin account was created
SELECT 
  id, 
  username, 
  email, 
  role, 
  is_superadmin, 
  enabled,
  created_at
FROM users 
WHERE is_superadmin = true;

-- Show all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Show table row counts
SELECT 
  'sessions' as table_name, COUNT(*) as row_count FROM sessions
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL
SELECT 'router_groups', COUNT(*) FROM router_groups
UNION ALL
SELECT 'routers', COUNT(*) FROM routers
UNION ALL
SELECT 'monitored_ports', COUNT(*) FROM monitored_ports
UNION ALL
SELECT 'traffic_data', COUNT(*) FROM traffic_data
UNION ALL
SELECT 'alerts', COUNT(*) FROM alerts
UNION ALL
SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL
SELECT 'app_settings', COUNT(*) FROM app_settings;
