#!/bin/bash
#
# Cleanup Script: Remove 5-Minute Interface Graph System
# This removes the redundant 5-minute polling system since we already
# have 60-second traffic_data with 2-year retention and compression.
#

echo "=========================================="
echo "Removing 5-Minute Interface Graph System"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're on production server
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}Error: docker-compose.yml not found!${NC}"
    echo "Please run this script from /root/MikroTikMon directory"
    exit 1
fi

echo -e "${YELLOW}Step 1: Checking if interface_graph table exists...${NC}"
TABLE_EXISTS=$(docker exec -i mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'interface_graph');" 2>/dev/null | xargs)

if [ "$TABLE_EXISTS" = "t" ]; then
    echo -e "${GREEN}✓ Table exists, removing it...${NC}"
    
    # Drop the table and all related objects
    docker exec -i mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE << 'SQL'
-- Drop continuous aggregates first (they depend on the table)
DROP MATERIALIZED VIEW IF EXISTS interface_graph_daily CASCADE;
DROP MATERIALIZED VIEW IF EXISTS interface_graph_hourly CASCADE;

-- Drop the main table
DROP TABLE IF EXISTS interface_graph CASCADE;

-- Success message
SELECT '✓ interface_graph table and all related objects removed successfully!' AS result;
SQL
    
    echo -e "${GREEN}✓ Database cleanup complete!${NC}"
else
    echo -e "${YELLOW}⊘ Table doesn't exist (nothing to remove)${NC}"
fi

echo ""
echo -e "${YELLOW}Step 2: Checking storage methods...${NC}"

# Check if storage methods exist
if docker exec -i mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -t -c "\df *interface_graph*" 2>/dev/null | grep -q "interface"; then
    echo -e "${YELLOW}⚠ Found interface_graph related functions in database${NC}"
else
    echo -e "${GREEN}✓ No interface_graph functions in database${NC}"
fi

echo ""
echo -e "${YELLOW}Step 3: Current database status...${NC}"

# Show current tables
echo -e "${GREEN}Remaining tables:${NC}"
docker exec -i mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -c "\dt" 2>/dev/null | grep -E "traffic_data|monitored_ports|routers" || echo "  (Unable to query)"

echo ""
echo -e "${YELLOW}Step 4: Traffic data summary...${NC}"
docker exec -i mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE << 'SQL'
SELECT 
    COUNT(*) as total_records,
    COUNT(DISTINCT router_id) as routers,
    COUNT(DISTINCT port_name) as interfaces,
    MIN(timestamp) as first_capture,
    MAX(timestamp) as latest_capture
FROM traffic_data;
SQL

echo ""
echo "=========================================="
echo -e "${GREEN}✓ Cleanup Complete!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Update application code to remove 5-minute polling"
echo "2. Redeploy application"
echo "3. Verify 60-second polling still works"
echo ""
echo "The 60-second traffic_data table continues to:"
echo "  ✓ Capture all monitored ports every 60 seconds"
echo "  ✓ Store data for 2 years with compression"
echo "  ✓ Provide complete historical analysis"
echo ""

# ===========================================
# INSTRUCTIONS FOR PRODUCTION SERVER
# ===========================================
#
# Run this script on production server:
#
# 1. SSH to production:
#    ssh root@mon.maxnetplus.id
#
# 2. Navigate to project directory:
#    cd /root/MikroTikMon
#
# 3. Upload this script:
#    (From your local machine)
#    scp cleanup-5min-polling.sh root@mon.maxnetplus.id:/root/MikroTikMon/
#
# 4. Run the cleanup script:
#    chmod +x cleanup-5min-polling.sh
#    ./cleanup-5min-polling.sh
#
# 5. Deploy updated code (removes 5-min polling):
#    git pull origin main
#    bash intelligent-deploy.sh
#
# 6. Verify 60-second polling still works:
#    docker compose logs -f app | grep Scheduler
#
# Done! Your system now uses only the 60-second
# traffic_data table with 2-year retention.
#
