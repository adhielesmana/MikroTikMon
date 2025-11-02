#!/bin/bash
# ============================================================================
# Database Schema Verification Script
# ============================================================================
# This script verifies that your database schema is correctly set up
# for the MikroTik Network Monitoring Platform
#
# Usage: ./scripts/verify-schema.sh
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Database connection details from environment or defaults
DB_HOST="${PGHOST:-localhost}"
DB_PORT="${PGPORT:-5432}"
DB_USER="${PGUSER:-mikrotik_user}"
DB_NAME="${PGDATABASE:-mikrotik_monitor}"

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}  MikroTik Monitor - Database Schema Verification${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

# Function to run SQL query
run_query() {
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -c "$1"
}

# Function to check table exists
check_table() {
    local table_name=$1
    local exists=$(run_query "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table_name');")
    
    if [ "$exists" = "t" ]; then
        echo -e "${GREEN}✓${NC} Table '$table_name' exists"
        return 0
    else
        echo -e "${RED}✗${NC} Table '$table_name' NOT FOUND"
        return 1
    fi
}

# Function to check column exists
check_column() {
    local table_name=$1
    local column_name=$2
    local exists=$(run_query "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '$table_name' AND column_name = '$column_name');")
    
    if [ "$exists" = "t" ]; then
        return 0
    else
        echo -e "  ${RED}✗${NC} Column '$column_name' missing in '$table_name'"
        return 1
    fi
}

echo -e "${YELLOW}[1/6] Checking Database Connection...${NC}"
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Database connection successful"
else
    echo -e "${RED}✗${NC} Database connection failed"
    echo -e "${RED}Please check your database credentials and ensure PostgreSQL is running${NC}"
    exit 1
fi
echo ""

echo -e "${YELLOW}[2/6] Checking Required Tables...${NC}"
TABLES_OK=true

check_table "users" || TABLES_OK=false
check_table "sessions" || TABLES_OK=false
check_table "router_groups" || TABLES_OK=false
check_table "routers" || TABLES_OK=false
check_table "monitored_ports" || TABLES_OK=false
check_table "traffic_data" || TABLES_OK=false
check_table "alerts" || TABLES_OK=false
check_table "notifications" || TABLES_OK=false
check_table "app_settings" || TABLES_OK=false

if [ "$TABLES_OK" = false ]; then
    echo -e "\n${RED}Some tables are missing!${NC}"
    echo -e "${YELLOW}Run: psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f migrations/00_fresh_init.sql${NC}"
    exit 1
fi
echo ""

echo -e "${YELLOW}[3/6] Checking Critical Columns...${NC}"
COLUMNS_OK=true

# Users table
check_column "users" "id" || COLUMNS_OK=false
check_column "users" "username" || COLUMNS_OK=false
check_column "users" "email" || COLUMNS_OK=false
check_column "users" "role" || COLUMNS_OK=false
check_column "users" "is_superadmin" || COLUMNS_OK=false
check_column "users" "enabled" || COLUMNS_OK=false
check_column "users" "password_hash" || COLUMNS_OK=false
check_column "users" "must_change_password" || COLUMNS_OK=false

# Routers table
check_column "routers" "id" || COLUMNS_OK=false
check_column "routers" "user_id" || COLUMNS_OK=false
check_column "routers" "name" || COLUMNS_OK=false
check_column "routers" "ip_address" || COLUMNS_OK=false
check_column "routers" "encrypted_password" || COLUMNS_OK=false
check_column "routers" "last_successful_connection_method" || COLUMNS_OK=false

# Monitored Ports table
check_column "monitored_ports" "id" || COLUMNS_OK=false
check_column "monitored_ports" "router_id" || COLUMNS_OK=false
check_column "monitored_ports" "port_name" || COLUMNS_OK=false
check_column "monitored_ports" "min_threshold_bps" || COLUMNS_OK=false

if [ "$COLUMNS_OK" = false ]; then
    echo -e "\n${RED}Some columns are missing!${NC}"
    echo -e "${YELLOW}Your database schema may be outdated${NC}"
    exit 1
fi
echo ""

echo -e "${YELLOW}[4/6] Checking Indexes...${NC}"
INDEX_COUNT=$(run_query "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';")
echo -e "${GREEN}✓${NC} Found $INDEX_COUNT indexes"

# Check specific critical indexes
check_index() {
    local index_name=$1
    local exists=$(run_query "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = '$index_name');")
    if [ "$exists" = "t" ]; then
        echo -e "${GREEN}✓${NC} Index '$index_name' exists"
    else
        echo -e "${YELLOW}⚠${NC} Index '$index_name' not found (may affect performance)"
    fi
}

check_index "idx_traffic_data_router_port_name_time"
check_index "idx_traffic_data_timestamp"
check_index "idx_alerts_user_created"
check_index "idx_session_expire"
echo ""

echo -e "${YELLOW}[5/6] Checking Superadmin Account...${NC}"
SUPERADMIN=$(run_query "SELECT COUNT(*) FROM users WHERE is_superadmin = true;")

if [ "$SUPERADMIN" -eq 0 ]; then
    echo -e "${RED}✗${NC} No superadmin account found!"
    echo -e "${YELLOW}Run: psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f migrations/00_fresh_init.sql${NC}"
    exit 1
elif [ "$SUPERADMIN" -eq 1 ]; then
    USERNAME=$(run_query "SELECT username FROM users WHERE is_superadmin = true LIMIT 1;")
    echo -e "${GREEN}✓${NC} Superadmin account exists: '$USERNAME'"
    
    # Check if it's the hardcoded superadmin
    if [ "$USERNAME" = "adhielesmana" ]; then
        echo -e "${GREEN}✓${NC} Hardcoded superadmin (adhielesmana) configured correctly"
    else
        echo -e "${YELLOW}⚠${NC} Superadmin username is '$USERNAME' (expected: adhielesmana)"
    fi
else
    echo -e "${YELLOW}⚠${NC} Multiple superadmin accounts found ($SUPERADMIN)"
    echo -e "${BLUE}Superadmin accounts:${NC}"
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT id, username, email FROM users WHERE is_superadmin = true;"
fi
echo ""

echo -e "${YELLOW}[6/6] Database Statistics...${NC}"
echo -e "${BLUE}Table Row Counts:${NC}"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
SELECT 
  'users' as table_name, COUNT(*) as row_count FROM users
UNION ALL
SELECT 'routers', COUNT(*) FROM routers
UNION ALL
SELECT 'router_groups', COUNT(*) FROM router_groups
UNION ALL
SELECT 'monitored_ports', COUNT(*) FROM monitored_ports
UNION ALL
SELECT 'traffic_data', COUNT(*) FROM traffic_data
UNION ALL
SELECT 'alerts', COUNT(*) FROM alerts
UNION ALL
SELECT 'notifications', COUNT(*) FROM notifications
ORDER BY table_name;
"

DB_SIZE=$(run_query "SELECT pg_size_pretty(pg_database_size('$DB_NAME'));")
echo -e "${BLUE}Database Size:${NC} $DB_SIZE"
echo ""

echo -e "${BLUE}============================================================================${NC}"
echo -e "${GREEN}✓ Database schema verification complete!${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""
echo -e "${GREEN}Your database is ready for deployment!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Start the application: npm run dev (development) or npm start (production)"
echo "2. Access the web interface: http://your-server:5000"
echo "3. Login with username: adhielesmana, password: admin123"
echo "4. Change the default superadmin password (recommended)"
echo ""
