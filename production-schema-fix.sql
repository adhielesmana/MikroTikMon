-- ============================================================================
-- Production Database Schema Fix
-- ============================================================================
-- Run this on your production PostgreSQL database to fix schema issues
-- Usage: psql -h your-host -U your-user -d your-database -f production-schema-fix.sql
--
-- Or from Docker: 
-- docker exec -i mikrotik-postgres psql -U yourusername -d yourdbname < production-schema-fix.sql
-- ============================================================================

-- Enable TimescaleDB extension (fixes time_bucket error)
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Create router_ip_addresses table if missing
CREATE TABLE IF NOT EXISTS router_ip_addresses (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id VARCHAR NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
  address VARCHAR(255) NOT NULL,
  network VARCHAR(255) NOT NULL,
  interface_name VARCHAR(255) NOT NULL,
  disabled BOOLEAN NOT NULL DEFAULT false,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(router_id, address, interface_name)
);

CREATE INDEX IF NOT EXISTS idx_router_ip_addresses_router 
ON router_ip_addresses(router_id);

-- Create router_routes table if missing
CREATE TABLE IF NOT EXISTS router_routes (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id VARCHAR NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
  dst_address VARCHAR(255) NOT NULL,
  gateway VARCHAR(255) NOT NULL,
  distance VARCHAR(10) NOT NULL DEFAULT '1',
  scope VARCHAR(10),
  target_scope VARCHAR(10),
  disabled BOOLEAN NOT NULL DEFAULT false,
  dynamic BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(router_id, dst_address, gateway)
);

CREATE INDEX IF NOT EXISTS idx_router_routes_router 
ON router_routes(router_id);

-- Add acknowledged_by column to alerts table if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'alerts' AND column_name = 'acknowledged_by'
  ) THEN
    ALTER TABLE alerts ADD COLUMN acknowledged_by VARCHAR(255);
    RAISE NOTICE 'Added acknowledged_by column to alerts table';
  END IF;
END $$;

-- Add port_comment column to alerts table if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'alerts' AND column_name = 'port_comment'
  ) THEN
    ALTER TABLE alerts ADD COLUMN port_comment VARCHAR(255);
    RAISE NOTICE 'Added port_comment column to alerts table';
  END IF;
END $$;

-- Make port_id nullable in alerts table (for router-level alerts)
DO $$ 
BEGIN
  ALTER TABLE alerts ALTER COLUMN port_id DROP NOT NULL;
  RAISE NOTICE 'Made port_id nullable in alerts table';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'port_id already nullable or does not exist';
END $$;

-- Make port_name nullable in alerts table (for router-level alerts)
DO $$ 
BEGIN
  ALTER TABLE alerts ALTER COLUMN port_name DROP NOT NULL;
  RAISE NOTICE 'Made port_name nullable in alerts table';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'port_name already nullable or does not exist';
END $$;

-- Make current_traffic_bps nullable in alerts table (for router-level alerts)
DO $$ 
BEGIN
  ALTER TABLE alerts ALTER COLUMN current_traffic_bps DROP NOT NULL;
  RAISE NOTICE 'Made current_traffic_bps nullable in alerts table';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'current_traffic_bps already nullable or does not exist';
END $$;

-- Make threshold_bps nullable in alerts table (for router-level alerts)
DO $$ 
BEGIN
  ALTER TABLE alerts ALTER COLUMN threshold_bps DROP NOT NULL;
  RAISE NOTICE 'Made threshold_bps nullable in alerts table';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'threshold_bps already nullable or does not exist';
END $$;

-- Add performance indexes for traffic_data if missing
CREATE INDEX IF NOT EXISTS idx_traffic_router_timestamp 
ON traffic_data(router_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_traffic_router_port_timestamp 
ON traffic_data(router_id, port_name, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_traffic_port_timestamp 
ON traffic_data(port_id, timestamp DESC) 
WHERE port_id IS NOT NULL;

-- Add composite indexes for alerts table to optimize /api/alerts endpoint
-- Primary index for superadmin query (ORDER BY created_at DESC LIMIT 200)
CREATE INDEX IF NOT EXISTS idx_alerts_created_at 
ON alerts(created_at DESC);

-- Index for normal user queries filtering by router_id and ordering by created_at
CREATE INDEX IF NOT EXISTS idx_alerts_router_created 
ON alerts(router_id, created_at DESC);

-- Index for port-specific queries
CREATE INDEX IF NOT EXISTS idx_alerts_port_created 
ON alerts(port_id, created_at DESC) 
WHERE port_id IS NOT NULL;

-- Index for user-specific queries
CREATE INDEX IF NOT EXISTS idx_alerts_user_created 
ON alerts(user_id, created_at DESC) 
WHERE user_id IS NOT NULL;

-- Convert traffic_data to hypertable if not already (TimescaleDB)
DO $$ 
BEGIN
  PERFORM create_hypertable(
    'traffic_data',
    'timestamp',
    if_not_exists => TRUE,
    chunk_time_interval => INTERVAL '1 day'
  );
  RAISE NOTICE 'Converted traffic_data to TimescaleDB hypertable';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'traffic_data already a hypertable or conversion failed: %', SQLERRM;
END $$;

-- Add compression policy to traffic_data (if not exists)
DO $$ 
BEGIN
  ALTER TABLE traffic_data SET (
    timescaledb.compress,
    timescaledb.compress_orderby = 'timestamp DESC',
    timescaledb.compress_segmentby = 'router_id, port_name'
  );
  RAISE NOTICE 'Enabled compression for traffic_data';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Compression already enabled or failed: %', SQLERRM;
END $$;

-- Add compression policy (compress data older than 7 days)
DO $$ 
BEGIN
  PERFORM add_compression_policy('traffic_data', INTERVAL '7 days');
  RAISE NOTICE 'Added compression policy for traffic_data';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Compression policy already exists or failed: %', SQLERRM;
END $$;

-- Create user_routers table if missing (for multi-user router assignments)
CREATE TABLE IF NOT EXISTS user_routers (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  router_id VARCHAR NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, router_id)
);

CREATE INDEX IF NOT EXISTS idx_user_routers_user 
ON user_routers(user_id);

CREATE INDEX IF NOT EXISTS idx_user_routers_router 
ON user_routers(router_id);

-- Create interface_graph table if missing (for 5-minute historical snapshots)
CREATE TABLE IF NOT EXISTS interface_graph (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id VARCHAR NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
  port_name VARCHAR(255) NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  rx_bytes_per_second REAL NOT NULL DEFAULT 0,
  tx_bytes_per_second REAL NOT NULL DEFAULT 0,
  total_bytes_per_second REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_interface_graph_router_port_time 
ON interface_graph(router_id, port_name, timestamp);

-- Convert interface_graph to hypertable if not already
DO $$ 
BEGIN
  PERFORM create_hypertable(
    'interface_graph',
    'timestamp',
    if_not_exists => TRUE,
    chunk_time_interval => INTERVAL '7 days'
  );
  RAISE NOTICE 'Converted interface_graph to TimescaleDB hypertable';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'interface_graph already a hypertable or conversion failed: %', SQLERRM;
END $$;

-- Add is_superadmin column to users if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'is_superadmin'
  ) THEN
    ALTER TABLE users ADD COLUMN is_superadmin BOOLEAN NOT NULL DEFAULT false;
    RAISE NOTICE 'Added is_superadmin column to users table';
  END IF;
END $$;

-- Add cloud_ddns_hostname column to routers if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'routers' AND column_name = 'cloud_ddns_hostname'
  ) THEN
    ALTER TABLE routers ADD COLUMN cloud_ddns_hostname VARCHAR(255);
    RAISE NOTICE 'Added cloud_ddns_hostname column to routers table';
  END IF;
END $$;

-- Add retention_days column to app_settings if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'app_settings' AND column_name = 'retention_days'
  ) THEN
    ALTER TABLE app_settings ADD COLUMN retention_days INTEGER DEFAULT 730;
    RAISE NOTICE 'Added retention_days column to app_settings table (default 730 days / 2 years)';
  END IF;
END $$;

-- ============================================================================
-- Verification
-- ============================================================================
\echo ''
\echo '========================================='
\echo 'Schema Fix Complete!'
\echo '========================================='
\echo ''
\echo 'Checking TimescaleDB version:'
SELECT extversion FROM pg_extension WHERE extname = 'timescaledb';

\echo ''
\echo 'Checking hypertables:'
SELECT hypertable_name, num_chunks 
FROM timescaledb_information.hypertables
ORDER BY hypertable_name;

\echo ''
\echo 'Verifying critical tables exist:'
SELECT 
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'router_ip_addresses') 
    THEN '✓' ELSE '✗' END || ' router_ip_addresses' as status
UNION ALL
SELECT 
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'router_routes') 
    THEN '✓' ELSE '✗' END || ' router_routes'
UNION ALL
SELECT 
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'alerts' AND column_name = 'acknowledged_by') 
    THEN '✓' ELSE '✗' END || ' alerts.acknowledged_by column'
UNION ALL
SELECT 
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'alerts' AND column_name = 'port_comment') 
    THEN '✓' ELSE '✗' END || ' alerts.port_comment column';

\echo ''
\echo 'All schema fixes applied successfully!'
\echo 'You can now restart your Docker containers.'
