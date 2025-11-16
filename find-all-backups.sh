#!/bin/bash

echo "========================================="
echo "  COMPREHENSIVE BACKUP SEARCH"
echo "========================================="
echo ""

# 1. Search entire filesystem for PostgreSQL dumps (most likely location)
echo "1. Searching entire system for .dump and .sql files..."
find / -name "*.dump" -o -name "*backup*.sql" -o -name "*mikrotik*.sql" 2>/dev/null | grep -v "/proc\|/sys\|/dev\|node_modules" | head -20
echo ""

# 2. Check common backup directories
echo "2. Checking common backup directories..."
for dir in /var/backups /backup /backups ~/backups ~/backup /opt/backups /tmp; do
    if [ -d "$dir" ]; then
        echo "   Checking: $dir"
        find "$dir" -name "*postgres*" -o -name "*mikrotik*" -o -name "*.dump" 2>/dev/null | head -10
    fi
done
echo ""

# 3. Check Docker volume location directly
echo "3. Checking Docker volume mountpoint..."
MOUNTPOINT=$(docker volume inspect mikrotik-monitor_postgres_data 2>/dev/null | grep Mountpoint | cut -d'"' -f4)
if [ -n "$MOUNTPOINT" ]; then
    echo "   Volume mountpoint: $MOUNTPOINT"
    echo "   Searching for backups in volume..."
    find "$MOUNTPOINT" -name "*backup*" -o -name "*.dump" 2>/dev/null | head -10
fi
echo ""

# 4. Check inside the database container
echo "4. Checking inside database container..."
docker exec mikrotik-monitor-db find /var/lib/postgresql -name "*.dump" -o -name "*backup*" 2>/dev/null | head -10
docker exec mikrotik-monitor-db find /tmp -name "*.dump" -o -name "*.sql" 2>/dev/null | head -10
echo ""

# 5. Check for PostgreSQL's built-in WAL archives
echo "5. Checking PostgreSQL WAL archives..."
docker exec mikrotik-monitor-db ls -lah /var/lib/postgresql/data/pg_wal/ 2>/dev/null | head -10
echo ""

# 6. Check root home directory thoroughly
echo "6. Searching root home directory..."
find ~ -type f \( -name "*.dump" -o -name "*.sql" -o -name "*backup*" \) 2>/dev/null | grep -v node_modules | head -20
echo ""

# 7. Check current directory and subdirectories
echo "7. Checking current directory recursively..."
find . -type f \( -name "*.dump" -o -name "*.sql" \) 2>/dev/null | grep -v node_modules | head -20
echo ""

# 8. Check for compressed backups
echo "8. Searching for compressed backup files..."
find / -name "*mikrotik*.tar.gz" -o -name "*postgres*.tar.gz" -o -name "*backup*.gz" 2>/dev/null | grep -v "/proc\|/sys\|/dev\|node_modules" | head -20
echo ""

# 9. Check systemd timers or cron jobs that might be creating backups
echo "9. Checking for automated backup jobs..."
crontab -l 2>/dev/null | grep -i backup || echo "   No cron backup jobs found"
systemctl list-timers 2>/dev/null | grep -i backup || echo "   No systemd backup timers found"
echo ""

# 10. Check Docker container logs for backup references
echo "10. Checking container logs for backup mentions..."
docker logs mikrotik-monitor-db 2>&1 | grep -i backup | tail -10 || echo "   No backup mentions in container logs"
echo ""

# 11. Search for any files modified around the migration time
echo "11. Searching for large files modified in last 30 days (possible backups)..."
find / -type f -size +1M -mtime -30 -name "*.dump" -o -name "*.sql" 2>/dev/null | grep -v "/proc\|/sys\|/dev\|node_modules" | head -10
echo ""

# 12. Check if database has Point-in-Time Recovery enabled
echo "12. Checking PostgreSQL configuration for archiving..."
docker exec mikrotik-monitor-db psql -U postgres -c "SHOW archive_mode;" 2>/dev/null || echo "   Cannot check archive mode"
docker exec mikrotik-monitor-db psql -U postgres -c "SHOW archive_command;" 2>/dev/null || echo "   Cannot check archive command"
echo ""

echo "========================================="
echo "  SEARCH COMPLETE"
echo "========================================="
echo ""
echo "If backups were found, they will be listed above."
echo "Look for .dump or .sql files with recent dates."
