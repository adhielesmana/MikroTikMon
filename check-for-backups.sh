#!/bin/bash

# Check for possible backup locations

echo "========================================="
echo "  Searching for Database Backups"
echo "========================================="
echo ""

# 1. Check Docker volumes for snapshots
echo "1. Checking Docker volume backups..."
docker volume ls | grep -i backup
echo ""

# 2. Check if TimescaleDB has automated backups
echo "2. Checking TimescaleDB automated backups..."
docker exec mikrotik-monitor-db ls -lah /var/lib/postgresql/data/ 2>/dev/null | grep -i backup || echo "   No backups found in data directory"
echo ""

# 3. Check system-wide backup locations
echo "3. Checking system backup directories..."
find /var/backups -name "*postgres*" -o -name "*mikrotik*" 2>/dev/null | head -10 || echo "   No system backups found"
echo ""

# 4. Check home directory for manual backups
echo "4. Checking home directory for manual backups..."
find ~ -name "*.dump" -o -name "*backup*.sql" 2>/dev/null | grep -v node_modules | head -10 || echo "   No manual backups found"
echo ""

# 5. Check Docker volume mount points
echo "5. Checking Docker volume details..."
docker volume inspect mikrotik-monitor_postgres_data 2>/dev/null | grep -A 3 "Mountpoint"
echo ""

# 6. List what's in the Docker volume
echo "6. Contents of postgres_data volume:"
docker run --rm -v mikrotik-monitor_postgres_data:/data alpine ls -lah /data 2>/dev/null || echo "   Cannot inspect volume"
echo ""

echo "========================================="
echo "  Backup Search Complete"
echo "========================================="
