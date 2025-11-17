#!/bin/bash
# Emergency Database Restore Script
# Usage: ssh root@mon.maxnetplus.id 'bash -s' < EMERGENCY_RESTORE.sh

echo "=========================================="
echo "  Emergency Database Restore"
echo "=========================================="
echo ""

# Find the most recent backup
LATEST_BACKUP=$(ls -t /root/MikroTikMon/*.sql 2>/dev/null | head -1)

if [ -z "$LATEST_BACKUP" ]; then
    echo "ERROR: No backup files found!"
    echo "Looking for: /root/MikroTikMon/*.sql"
    echo ""
    echo "Available files:"
    ls -lh /root/MikroTikMon/*.sql 2>/dev/null || echo "None found"
    exit 1
fi

echo "Found backup: $LATEST_BACKUP"
echo ""

# Load environment
cd /root/MikroTikMon
source .env

# Stop app container (keep database running)
echo "Stopping application..."
docker compose stop app

# Restore database
echo "Restoring database from backup..."
docker exec -i mikrotik-monitor-db psql -U "$PGUSER" -d postgres << EOSQL
DROP DATABASE IF EXISTS ${PGDATABASE};
CREATE DATABASE ${PGDATABASE};
GRANT ALL PRIVILEGES ON DATABASE ${PGDATABASE} TO ${PGUSER};
EOSQL

# Import backup
echo "Importing backup data..."
docker exec -i mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" < "$LATEST_BACKUP"

# Restart app
echo "Restarting application..."
docker compose start app

echo ""
echo "=========================================="
echo "✓ Database restored successfully!"
echo "=========================================="
