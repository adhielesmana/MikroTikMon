#!/bin/bash

# ========================================
# Database Restoration Script
# Restores from compressed or uncompressed SQL backup
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
echo "  Database Restoration Script"
echo "  MikroTik Network Monitoring Platform"
echo "========================================="
echo ""

# Check for backup file argument
if [ -z "$1" ]; then
    print_error "No backup file specified!"
    echo ""
    echo "Usage: $0 <backup_file>"
    echo ""
    echo "Examples:"
    echo "  $0 backups/backup_20251115_123115.sql"
    echo "  $0 backups/mikrotik_monitor_backup_20251117_164130.sql.gz"
    echo ""
    print_info "Available backups:"
    ls -lh backups/*.sql backups/*.sql.gz 2>/dev/null || print_warning "No backups found in backups/ directory"
    exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    print_error "Backup file not found: $BACKUP_FILE"
    exit 1
fi

print_success "Found backup file: $BACKUP_FILE"
FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
print_info "File size: $FILE_SIZE"

# Load environment variables
if [ -f .env ]; then
    source .env
else
    print_error ".env file not found!"
    exit 1
fi

# Determine docker-compose command
if docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# Warning
echo ""
print_warning "This will REPLACE your current database with the backup!"
print_info "Press Ctrl+C to cancel, or press Enter to continue..."
read

# Stop application
print_step "Stopping application..."
$DOCKER_COMPOSE stop app
print_success "Application stopped"

# Prepare backup file (decompress if .gz)
TEMP_SQL="/tmp/restore_backup.sql"

if [[ "$BACKUP_FILE" == *.gz ]]; then
    print_step "Decompressing backup..."
    gunzip -c "$BACKUP_FILE" > "$TEMP_SQL"
    print_success "Backup decompressed"
else
    print_step "Copying backup..."
    cp "$BACKUP_FILE" "$TEMP_SQL"
    print_success "Backup prepared"
fi

# Copy to container
print_step "Copying backup to database container..."
docker cp "$TEMP_SQL" mikrotik-monitor-db:/tmp/backup.sql
print_success "Backup copied to container"

# Drop and recreate schema
print_step "Dropping and recreating database schema..."
docker exec -i mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" <<EOF
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO $PGUSER;
GRANT ALL ON SCHEMA public TO public;
EOF
print_success "Schema recreated"

# Restore from backup
print_step "Restoring data from backup (this may take a few minutes)..."
docker exec -i mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" -f /tmp/backup.sql 2>&1 | \
    grep -v "ERROR.*already exists\|ERROR.*does not exist" || true

# Cleanup
print_step "Cleaning up temporary files..."
docker exec mikrotik-monitor-db rm /tmp/backup.sql
rm "$TEMP_SQL"
print_success "Cleanup complete"

# Start application
print_step "Starting application..."
$DOCKER_COMPOSE start app
sleep 5
print_success "Application started"

# Verify restoration
echo ""
echo "========================================="
print_success "Restoration Complete - Verification"
echo "========================================="
echo ""

USER_COUNT=$(docker exec mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" -tA -c "SELECT COUNT(*) FROM users;" 2>/dev/null | tr -d '[:space:]')
ROUTER_COUNT=$(docker exec mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" -tA -c "SELECT COUNT(*) FROM routers;" 2>/dev/null | tr -d '[:space:]')
PORT_COUNT=$(docker exec mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" -tA -c "SELECT COUNT(*) FROM monitored_ports;" 2>/dev/null | tr -d '[:space:]')
TRAFFIC_COUNT=$(docker exec mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" -tA -c "SELECT COUNT(*) FROM traffic_data;" 2>/dev/null | tr -d '[:space:]')

print_info "Database statistics:"
echo "  Users:          $USER_COUNT"
echo "  Routers:        $ROUTER_COUNT"
echo "  Monitored Ports: $PORT_COUNT"
echo "  Traffic Records: $TRAFFIC_COUNT"

echo ""
print_info "Router list:"
docker exec mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" -c "SELECT name, ip_address, connected FROM routers;" 2>/dev/null || print_warning "Routers table may not exist yet"

echo ""
echo "========================================="
print_success "Database Restored Successfully!"
echo "========================================="
echo ""
print_info "Next steps:"
echo "  1. Access application: https://mon.maxnetplus.id"
echo "  2. Wait 60 seconds for scheduler to connect to routers"
echo "  3. Check scheduler logs: docker logs -f mikrotik-monitor-app | grep Scheduler"
echo ""
