#!/bin/bash
# Verify Production Database After Import
# This script checks that the production database was imported correctly

set -e

echo "=================================================="
echo "  Production Database Verification Tool"
echo "=================================================="
echo ""

# Get production database URL
PROD_DB_URL="${PRODUCTION_DATABASE_URL:-$1}"

if [ -z "$PROD_DB_URL" ]; then
    echo "❌ ERROR: Production database URL not provided"
    echo ""
    echo "Usage: ./scripts/verify-prod-db.sh 'postgresql://user:pass@host/db'"
    echo "   or: export PRODUCTION_DATABASE_URL='...'"
    echo ""
    exit 1
fi

echo "🔍 Running verification checks..."
echo ""

# Run verification queries
psql "$PROD_DB_URL" << 'EOF'
\set ON_ERROR_STOP on

-- Database size
SELECT '📊 Database Size:' as info, pg_size_pretty(pg_database_size(current_database())) as size;

-- Table counts
SELECT '👥 Users:' as table_name, COUNT(*) as row_count FROM users
UNION ALL
SELECT '🖥️  Routers:', COUNT(*) FROM routers
UNION ALL
SELECT '👁️  Monitored Ports:', COUNT(*) FROM monitored_ports
UNION ALL
SELECT '📈 Traffic Data:', COUNT(*) FROM traffic_data
UNION ALL
SELECT '🚨 Alerts:', COUNT(*) FROM alerts
UNION ALL
SELECT '📂 Router Groups:', COUNT(*) FROM router_groups;

-- Admin users
SELECT '🔐 Admin Users:' as info;
SELECT id, username, email, role, enabled FROM users WHERE role = 'admin';

-- Recent data
SELECT '📅 Most Recent Traffic Data:' as info;
SELECT MAX(timestamp) as latest_timestamp FROM traffic_data;

-- Alerts summary
SELECT '🚨 Active Alerts:' as info;
SELECT severity, COUNT(*) as count 
FROM alerts 
WHERE acknowledged = false 
GROUP BY severity;

EOF

if [ $? -eq 0 ]; then
    echo ""
    echo "=================================================="
    echo "✅ Verification completed successfully!"
    echo "=================================================="
    echo ""
    echo "Your production database appears to be working correctly."
    echo ""
else
    echo ""
    echo "❌ Verification failed. Check the errors above."
    exit 1
fi
