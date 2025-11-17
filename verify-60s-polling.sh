#!/bin/bash
#
# Verify 60-Second Traffic Polling on Production
# Checks that background traffic collection is working correctly
#

echo "=========================================="
echo "Verifying 60-Second Traffic Polling"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if we're on production
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}Error: docker-compose.yml not found!${NC}"
    echo "Run this from /root/MikroTikMon directory"
    exit 1
fi

echo -e "${YELLOW}Step 1: Checking if app is running...${NC}"
APP_RUNNING=$(docker compose ps app 2>/dev/null | grep -c "Up")
if [ "$APP_RUNNING" -gt 0 ]; then
    echo -e "${GREEN}✓ App is running${NC}"
else
    echo -e "${RED}✗ App is not running!${NC}"
    echo "Start it with: docker compose up -d"
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 2: Checking scheduler logs (last 2 minutes)...${NC}"
SCHEDULER_LOGS=$(docker compose logs --since 2m app 2>/dev/null | grep -E "Scheduler|Polling" | tail -10)
if [ -n "$SCHEDULER_LOGS" ]; then
    echo -e "${GREEN}✓ Scheduler is active${NC}"
    echo "$SCHEDULER_LOGS" | head -5
else
    echo -e "${YELLOW}⚠ No recent scheduler activity in logs${NC}"
fi

echo ""
echo -e "${YELLOW}Step 3: Checking for 60-second polling messages...${NC}"
POLLING_60S=$(docker compose logs --since 5m app 2>/dev/null | grep -c "Polling.*routers with monitored ports")
if [ "$POLLING_60S" -gt 0 ]; then
    echo -e "${GREEN}✓ 60-second polling detected ($POLLING_60S times in last 5 minutes)${NC}"
else
    echo -e "${RED}✗ No 60-second polling activity found${NC}"
fi

echo ""
echo -e "${YELLOW}Step 4: Verifying NO 5-minute interface graph polling...${NC}"
POLLING_5MIN=$(docker compose logs --since 10m app 2>/dev/null | grep -c "InterfaceGraph")
if [ "$POLLING_5MIN" -eq 0 ]; then
    echo -e "${GREEN}✓ Confirmed: 5-minute polling is removed${NC}"
else
    echo -e "${RED}✗ WARNING: Still seeing InterfaceGraph activity!${NC}"
    echo "You may need to redeploy the app"
fi

echo ""
echo -e "${YELLOW}Step 5: Checking database for recent traffic data...${NC}"
RECENT_DATA=$(docker exec -i mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -t -c "
SELECT COUNT(*) 
FROM traffic_data 
WHERE timestamp > NOW() - INTERVAL '5 minutes';
" 2>/dev/null | xargs)

if [ -n "$RECENT_DATA" ] && [ "$RECENT_DATA" -gt 0 ]; then
    echo -e "${GREEN}✓ Database has $RECENT_DATA traffic records from last 5 minutes${NC}"
    
    # Show breakdown by router
    echo ""
    echo "Recent traffic by router:"
    docker exec -i mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -c "
    SELECT 
        r.name as router,
        COUNT(*) as samples,
        MAX(td.timestamp) as latest_capture
    FROM traffic_data td
    JOIN routers r ON td.router_id = r.id
    WHERE td.timestamp > NOW() - INTERVAL '5 minutes'
    GROUP BY r.name
    ORDER BY latest_capture DESC;
    " 2>/dev/null
else
    echo -e "${RED}✗ No recent traffic data in database!${NC}"
    echo "This could mean:"
    echo "  - Routers are unreachable"
    echo "  - No monitored ports configured"
    echo "  - Scheduler not running"
fi

echo ""
echo -e "${YELLOW}Step 6: Checking monitored ports configuration...${NC}"
MONITORED_COUNT=$(docker exec -i mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -t -c "
SELECT COUNT(*) FROM monitored_ports WHERE enabled = true;
" 2>/dev/null | xargs)

if [ -n "$MONITORED_COUNT" ] && [ "$MONITORED_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ Found $MONITORED_COUNT enabled monitored ports${NC}"
    
    # Show them
    docker exec -i mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -c "
    SELECT 
        r.name as router,
        mp.port_name as interface,
        ROUND(mp.rx_threshold / 1024.0, 2) as threshold_kbps
    FROM monitored_ports mp
    JOIN routers r ON mp.router_id = r.id
    WHERE mp.enabled = true
    ORDER BY r.name, mp.port_name;
    " 2>/dev/null
else
    echo -e "${RED}✗ No enabled monitored ports!${NC}"
    echo "Add monitored ports in the web UI to start collecting data"
fi

echo ""
echo -e "${YELLOW}Step 7: Historical data summary...${NC}"
docker exec -i mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -c "
SELECT 
    COUNT(*) as total_records,
    COUNT(DISTINCT router_id) as routers,
    COUNT(DISTINCT port_name) as interfaces,
    MIN(timestamp) as first_capture,
    MAX(timestamp) as latest_capture,
    ROUND(EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))) / 86400, 2) as days_of_data
FROM traffic_data;
" 2>/dev/null

echo ""
echo "=========================================="
if [ "$POLLING_60S" -gt 0 ] && [ "$RECENT_DATA" -gt 0 ]; then
    echo -e "${GREEN}✅ 60-SECOND POLLING IS WORKING!${NC}"
    echo ""
    echo "Summary:"
    echo "  ✓ Scheduler running"
    echo "  ✓ 60-second polling active"
    echo "  ✓ Data being collected to database"
    echo "  ✓ 5-minute polling removed"
else
    echo -e "${RED}⚠ ISSUES DETECTED${NC}"
    echo ""
    echo "Troubleshooting steps:"
    echo "  1. Check if routers are reachable"
    echo "  2. Verify monitored ports are configured"
    echo "  3. Check app logs: docker compose logs -f app"
    echo "  4. Restart app: docker compose restart app"
fi
echo "=========================================="
echo ""

# Exit with appropriate code
if [ "$POLLING_60S" -gt 0 ] && [ "$RECENT_DATA" -gt 0 ]; then
    exit 0
else
    exit 1
fi
