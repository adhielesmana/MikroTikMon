-- Initialize database with required extensions
-- This file runs automatically when PostgreSQL container starts for the first time

-- Enable UUID generation (needed for sessions and other tables)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Grant all privileges to the application user
GRANT ALL PRIVILEGES ON DATABASE mikrotik_monitor TO mikrotik_user;
GRANT ALL ON SCHEMA public TO mikrotik_user;

-- Optional: Create additional schemas if needed
-- CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION mikrotik_user;
