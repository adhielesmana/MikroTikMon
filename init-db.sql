-- ============================================================================
-- MikroTik Network Monitoring Platform - Database Initialization
-- ============================================================================
-- This script runs automatically when the PostgreSQL container starts
-- for the first time. It creates ALL required tables, extensions, and
-- the default superadmin user for a fresh deployment.
-- ============================================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Grant privileges to the application user
GRANT ALL PRIVILEGES ON DATABASE mikrotik_monitor TO mikrotik_user;
GRANT ALL ON SCHEMA public TO mikrotik_user;

-- ============================================================================
-- SESSIONS TABLE (Required for authentication)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
  sid VARCHAR PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_expire ON sessions(expire);

-- ============================================================================
-- USERS TABLE (Multi-provider authentication)
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
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
CREATE TABLE IF NOT EXISTS router_groups (
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
CREATE TABLE IF NOT EXISTS routers (
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
  -- Cloud DDNS hostname (extracted from SSL certificate)
  cloud_ddns_hostname VARCHAR(255),
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
CREATE TABLE IF NOT EXISTS monitored_ports (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  router_id VARCHAR NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
  port_name VARCHAR(255) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  min_threshold_bps INTEGER NOT NULL DEFAULT 0,
  email_notifications BOOLEAN NOT NULL DEFAULT true,
  popup_notifications BOOLEAN NOT NULL DEFAULT true,
  -- Cached interface metadata (updated during polling)
  interface_comment TEXT,
  interface_mac_address VARCHAR(17),
  last_interface_update TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(router_id, port_name)
);

-- ============================================================================
-- ROUTER INTERFACES TABLE (Cached interface information)
-- ============================================================================
CREATE TABLE IF NOT EXISTS router_interfaces (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  router_id VARCHAR NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
  interface_name VARCHAR(255) NOT NULL,
  interface_comment TEXT,
  interface_mac_address VARCHAR(17),
  interface_type VARCHAR(50),
  is_running BOOLEAN DEFAULT false,
  is_disabled BOOLEAN DEFAULT false,
  last_seen TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(router_id, interface_name)
);

CREATE INDEX IF NOT EXISTS idx_router_interfaces_router ON router_interfaces(router_id);

-- ============================================================================
-- TRAFFIC DATA TABLE (Historical traffic metrics - TimescaleDB hypertable)
-- ============================================================================
CREATE TABLE IF NOT EXISTS traffic_data (
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
CREATE INDEX IF NOT EXISTS idx_traffic_data_router_port_name_time ON traffic_data(router_id, port_name, timestamp);
CREATE INDEX IF NOT EXISTS idx_traffic_data_timestamp ON traffic_data(timestamp);

-- ============================================================================
-- INTERFACE GRAPH TABLE (5-minute historical snapshots - TimescaleDB hypertable)
-- ============================================================================
CREATE TABLE IF NOT EXISTS interface_graph (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  router_id VARCHAR NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
  port_id VARCHAR REFERENCES monitored_ports(id) ON DELETE CASCADE,
  port_name VARCHAR(255) NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  rx_bytes_total REAL NOT NULL DEFAULT 0,
  tx_bytes_total REAL NOT NULL DEFAULT 0,
  rx_bytes_per_second REAL NOT NULL DEFAULT 0,
  tx_bytes_per_second REAL NOT NULL DEFAULT 0,
  total_bytes_per_second REAL NOT NULL DEFAULT 0
);

-- Optimized indexes for interface graph queries
CREATE INDEX IF NOT EXISTS idx_interface_graph_router_port_time ON interface_graph(router_id, port_name, timestamp);
CREATE INDEX IF NOT EXISTS idx_interface_graph_timestamp ON interface_graph(timestamp);
CREATE UNIQUE INDEX IF NOT EXISTS idx_interface_graph_unique_sample ON interface_graph(router_id, port_name, timestamp);

-- ============================================================================
-- ALERTS TABLE (Threshold violation alerts)
-- ============================================================================
CREATE TABLE IF NOT EXISTS alerts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  router_id VARCHAR NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
  port_id VARCHAR REFERENCES monitored_ports(id) ON DELETE CASCADE,
  port_name VARCHAR(255) NOT NULL,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  severity VARCHAR(20) NOT NULL DEFAULT 'warning',
  message TEXT NOT NULL,
  alert_type VARCHAR(50) NOT NULL DEFAULT 'traffic',
  current_traffic_bps REAL,
  threshold_bps REAL,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMP,
  acknowledged_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_user_created ON alerts(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_router ON alerts(router_id);
CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged);

-- ============================================================================
-- NOTIFICATIONS TABLE (Notification history)
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_id VARCHAR REFERENCES alerts(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_sent ON notifications(user_id, sent_at);

-- ============================================================================
-- APP SETTINGS TABLE (Global application configuration)
-- ============================================================================
CREATE TABLE IF NOT EXISTS app_settings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  logo_url TEXT,
  retention_days INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- USER ROUTERS TABLE (Router assignments for normal users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_routers (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  router_id VARCHAR NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
  assigned_by VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, router_id)
);

CREATE INDEX IF NOT EXISTS idx_user_routers_user ON user_routers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_routers_router ON user_routers(router_id);

-- ============================================================================
-- VERIFICATION AND SUMMARY
-- ============================================================================

-- Display superadmin account
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

-- Display all tables created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Display table counts
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
SELECT 'router_interfaces', COUNT(*) FROM router_interfaces
UNION ALL
SELECT 'traffic_data', COUNT(*) FROM traffic_data
UNION ALL
SELECT 'interface_graph', COUNT(*) FROM interface_graph
UNION ALL
SELECT 'alerts', COUNT(*) FROM alerts
UNION ALL
SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL
SELECT 'app_settings', COUNT(*) FROM app_settings
UNION ALL
SELECT 'user_routers', COUNT(*) FROM user_routers
ORDER BY table_name;
