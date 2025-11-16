#!/bin/bash

set -e

echo "========================================="
echo "  DATABASE RESTORATION SCRIPT"
echo "========================================="
echo ""

cd ~/MikroTikMon
source .env

# Determine docker-compose command
if docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# Stop application
echo "1. Stopping application..."
$DOCKER_COMPOSE stop app

# Clean the backup file - remove empty lines from COPY blocks
echo "2. Cleaning backup file..."
awk '
/^COPY.*alerts/ { in_copy=1 }
/^\\\./ { if(in_copy) in_copy=0 }
in_copy && /^$/ { next }
{ print }
' /root/MikroTikMon/backup_20251115_123115.sql > /tmp/backup_cleaned.sql

echo "   Backup cleaned successfully"

# Copy cleaned backup to container
echo "3. Copying cleaned backup to database container..."
docker cp /tmp/backup_cleaned.sql mikrotik-monitor-db:/tmp/backup_clean.sql

# Drop and recreate public schema (clean slate)
echo "4. Dropping and recreating database schema..."
docker exec -i mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE <<EOF
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO $PGUSER;
GRANT ALL ON SCHEMA public TO public;
EOF

echo "   Schema recreated"

# Restore from cleaned backup
echo "5. Restoring data from backup..."
docker exec -i mikrotik-monitor-db psql -X -v ON_ERROR_STOP=1 -U $PGUSER -d $PGDATABASE -f /tmp/backup_clean.sql

# Clean up temp files
echo "6. Cleaning up..."
docker exec mikrotik-monitor-db rm /tmp/backup_clean.sql
rm /tmp/backup_cleaned.sql

# Start application
echo "7. Starting application..."
$DOCKER_COMPOSE start app

# Verify restoration
echo ""
echo "========================================="
echo "  RESTORATION COMPLETE - VERIFICATION"
echo "========================================="
echo ""

echo "Users:"
docker exec -i mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -t -c "SELECT COUNT(*) FROM users;" | xargs

echo "Routers:"
docker exec -i mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -t -c "SELECT COUNT(*) FROM routers;" | xargs

echo "Monitored Ports:"
docker exec -i mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -t -c "SELECT COUNT(*) FROM monitored_ports;" | xargs

echo "Traffic Data:"
docker exec -i mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -t -c "SELECT COUNT(*) FROM traffic_data;" | xargs

echo "Alerts:"
docker exec -i mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -t -c "SELECT COUNT(*) FROM alerts;" | xargs

echo ""
echo "Router List:"
docker exec -i mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -c "SELECT name, ip_address, connected FROM routers;"

echo ""
echo "========================================="
echo "  ✅ RESTORATION SUCCESSFUL!"
echo "========================================="
echo ""
echo "Your application is now restored and running."
echo "Access it at: https://mon.maxnetplus.id"
echo ""
