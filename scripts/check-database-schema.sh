#!/bin/bash
# Check Database Schema - View Current Database Structure
# This script shows you the current state of your database

set -e

echo "=================================================="
echo "  Database Schema Inspector"
echo "=================================================="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable is not set"
    exit 1
fi

echo "📊 Inspecting database structure..."
echo ""

# Check all tables
psql "$DATABASE_URL" << 'EOF'
\set ON_ERROR_STOP off

-- List all tables
SELECT '📁 Tables in Database:' as info;
SELECT table_name, 
       (SELECT COUNT(*) FROM information_schema.columns WHERE columns.table_name = tables.table_name) as column_count
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Show users table structure
SELECT '' as separator;
SELECT '👥 Users Table Structure:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;

-- Show routers table structure
SELECT '' as separator;
SELECT '🖥️  Routers Table Structure:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'routers'
ORDER BY ordinal_position;

-- Show monitored_ports table structure
SELECT '' as separator;
SELECT '👁️  Monitored Ports Table Structure:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'monitored_ports'
ORDER BY ordinal_position;

-- Show all indexes
SELECT '' as separator;
SELECT '🔍 Database Indexes:' as info;
SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

EOF

echo ""
echo "=================================================="
echo "✅ Schema inspection complete"
echo "=================================================="
echo ""
echo "To sync schema with code, run:"
echo "  ./scripts/sync-database-schema.sh"
echo ""
