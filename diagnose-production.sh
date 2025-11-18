#!/bin/bash

# ========================================
# Production Diagnostic Script
# Run this on production server to diagnose issues
# ========================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_info() { echo -e "${BLUE}ℹ${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_step() { echo -e "${CYAN}▶${NC} $1"; }

echo ""
echo "========================================="
echo "  Production Diagnostic Tool"
echo "  MikroTik Network Monitoring Platform"
echo "========================================="
echo ""

# ========================================
# Check Docker Containers
# ========================================

print_step "Checking Docker containers..."
echo ""

if docker ps -a | grep -q "mikrotik-monitor"; then
    docker ps -a --filter "name=mikrotik-monitor" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo ""
else
    print_error "No MikroTik Monitor containers found!"
    exit 1
fi

# Check if containers are running
DB_RUNNING=$(docker ps --filter "name=mikrotik-monitor-db" --format "{{.Names}}" | grep -q "mikrotik-monitor-db" && echo "yes" || echo "no")
APP_RUNNING=$(docker ps --filter "name=mikrotik-monitor-app" --format "{{.Names}}" | grep -q "mikrotik-monitor-app" && echo "yes" || echo "no")

if [ "$DB_RUNNING" = "yes" ]; then
    print_success "Database container is running"
else
    print_error "Database container is NOT running!"
fi

if [ "$APP_RUNNING" = "yes" ]; then
    print_success "Application container is running"
else
    print_error "Application container is NOT running!"
fi

echo ""

# ========================================
# Check Database Data
# ========================================

print_step "Checking database data..."
echo ""

# Source environment variables
if [ -f .env ]; then
    source .env
else
    print_error ".env file not found!"
    exit 1
fi

# Get counts
USER_COUNT=$(docker exec mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" -tA -c "SELECT COUNT(*) FROM users;" 2>/dev/null | tr -d '[:space:]' || echo "ERROR")
ROUTER_COUNT=$(docker exec mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" -tA -c "SELECT COUNT(*) FROM routers;" 2>/dev/null | tr -d '[:space:]' || echo "ERROR")
PORT_COUNT=$(docker exec mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" -tA -c "SELECT COUNT(*) FROM monitored_ports;" 2>/dev/null | tr -d '[:space:]' || echo "ERROR")
TRAFFIC_COUNT=$(docker exec mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" -tA -c "SELECT COUNT(*) FROM traffic_data;" 2>/dev/null | tr -d '[:space:]' || echo "ERROR")

if [ "$USER_COUNT" = "ERROR" ]; then
    print_error "Cannot query database - is it running?"
else
    print_info "Database statistics:"
    echo "  Users:          $USER_COUNT"
    echo "  Routers:        $ROUTER_COUNT"
    echo "  Monitored Ports: $PORT_COUNT"
    echo "  Traffic Records: $TRAFFIC_COUNT"
    
    if [ "$USER_COUNT" = "0" ] && [ "$ROUTER_COUNT" = "0" ]; then
        print_warning "Database is EMPTY! This suggests data loss."
    else
        print_success "Database has data"
    fi
fi

echo ""

# ========================================
# Check Docker Volume
# ========================================

print_step "Checking Docker volume..."
echo ""

# Auto-detect actual volume name (may be prefixed with project directory)
VOLUME_NAME=$(docker volume ls --format "{{.Name}}" | grep "postgres_data" | head -n 1)

if [ -n "$VOLUME_NAME" ]; then
    VOLUME_SIZE=$(docker volume inspect "$VOLUME_NAME" --format '{{.Mountpoint}}' | xargs du -sh 2>/dev/null | awk '{print $1}' || echo "unknown")
    print_success "Volume '$VOLUME_NAME' exists (Size: $VOLUME_SIZE)"
    
    # Show volume details
    print_info "Volume details:"
    docker volume inspect "$VOLUME_NAME" | grep -E "CreatedAt|Mountpoint"
else
    print_error "No postgres_data volume found!"
    print_info "Available volumes:"
    docker volume ls
fi

echo ""

# ========================================
# Check Application Logs
# ========================================

print_step "Checking application logs (last 50 lines)..."
echo ""

if [ "$APP_RUNNING" = "yes" ]; then
    docker logs --tail 50 mikrotik-monitor-app 2>&1 | grep -E "\[Scheduler\]|Error|error|failed|Failed" || print_info "No scheduler/error logs found"
else
    print_warning "Application is not running - cannot check logs"
fi

echo ""

# ========================================
# Check for Scheduler Activity
# ========================================

print_step "Checking for recent scheduler activity..."
echo ""

if [ "$APP_RUNNING" = "yes" ]; then
    SCHEDULER_LOGS=$(docker logs --since 5m mikrotik-monitor-app 2>&1 | grep "\[Scheduler\]" | wc -l)
    
    if [ "$SCHEDULER_LOGS" -gt 0 ]; then
        print_success "Scheduler is active ($SCHEDULER_LOGS log entries in last 5 minutes)"
        docker logs --since 5m mikrotik-monitor-app 2>&1 | grep "\[Scheduler\]" | tail -10
    else
        print_error "No scheduler activity in last 5 minutes!"
        print_info "Showing last 100 lines of app logs:"
        docker logs --tail 100 mikrotik-monitor-app
    fi
else
    print_warning "Application is not running - cannot check scheduler"
fi

echo ""

# ========================================
# Check Environment Variables
# ========================================

print_step "Checking environment variables in container..."
echo ""

if [ "$APP_RUNNING" = "yes" ]; then
    NODE_ENV=$(docker exec mikrotik-monitor-app printenv NODE_ENV 2>/dev/null || echo "NOT SET")
    DATABASE_URL=$(docker exec mikrotik-monitor-app printenv DATABASE_URL 2>/dev/null || echo "NOT SET")
    
    print_info "NODE_ENV: $NODE_ENV"
    
    if [ "$NODE_ENV" != "production" ]; then
        print_warning "NODE_ENV is not set to 'production'!"
    fi
    
    if [ "$DATABASE_URL" = "NOT SET" ]; then
        print_error "DATABASE_URL is not set!"
    else
        print_success "DATABASE_URL is configured"
    fi
fi

echo ""

# ========================================
# Summary and Recommendations
# ========================================

echo "========================================="
echo "  Diagnostic Summary"
echo "========================================="
echo ""

if [ "$DB_RUNNING" = "no" ]; then
    print_error "CRITICAL: Database container is not running!"
    echo "  Fix: docker start mikrotik-monitor-db"
fi

if [ "$APP_RUNNING" = "no" ]; then
    print_error "CRITICAL: Application container is not running!"
    echo "  Fix: docker-compose up -d app"
fi

if [ "$USER_COUNT" = "0" ] && [ "$ROUTER_COUNT" = "0" ]; then
    print_error "CRITICAL: Database is empty - data loss occurred!"
    echo "  Possible causes:"
    echo "    1. Database volume was deleted during deployment"
    echo "    2. docker-compose down -v was used (NEVER use -v flag!)"
    echo "    3. Database initialization script overwrote data"
    echo ""
    echo "  Recovery:"
    echo "    1. Check if backup exists: ls -lh backups/"
    echo "    2. Restore from backup: ./scripts/restore-database.sh backups/backup-YYYY-MM-DD.sql.gz"
fi

if [ "$SCHEDULER_LOGS" = "0" ]; then
    print_error "WARNING: Scheduler is not active!"
    echo "  This means:"
    echo "    - No traffic monitoring"
    echo "    - No alerts checking"
    echo "    - Routers will show as disconnected"
    echo ""
    echo "  Possible causes:"
    echo "    1. Application crashed on startup"
    echo "    2. Database connection failed"
    echo "    3. Empty database (no routers to monitor)"
fi

echo ""
print_info "For detailed logs: docker logs -f mikrotik-monitor-app"
print_info "For database shell: docker exec -it mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE"
echo ""
