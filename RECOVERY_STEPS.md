# Database Recovery Guide

## Current Situation
- **migrate.sh** was run and executed `00_fresh_init.sql` which dropped all tables
- Database was reset to fresh state with only the superadmin user
- **Lost data**: All routers, traffic history, monitored ports, alerts

## Step 1: Search for Backups

Run this on your production server:
```bash
cd ~/MikroTikMon
bash check-for-backups.sh
```

This will search for:
- Docker volume snapshots
- TimescaleDB automated backups
- System-wide PostgreSQL backups
- Manual backup files

## Step 2: Recovery Options

### Option A: If backup file is found
```bash
# Stop the application
docker-compose down

# Restore from backup
docker-compose up -d mikrotik-monitor-db
sleep 5

# Restore the backup (replace PATH_TO_BACKUP with actual file)
docker exec -i mikrotik-monitor-db pg_restore \
  -U $PGUSER -d $PGDATABASE \
  --clean --if-exists \
  < PATH_TO_BACKUP.dump

# Or if it's a SQL file:
docker exec -i mikrotik-monitor-db psql \
  -U $PGUSER -d $PGDATABASE \
  < PATH_TO_BACKUP.sql

# Restart application
docker-compose up -d
```

### Option B: If NO backup exists
Unfortunately, you will need to:
1. Re-add all your routers manually through the web interface
2. Configure monitoring ports again
3. Traffic history is lost (new data will be collected going forward)

**To prevent this in the future:**
```bash
# Create a backup before any changes
cd ~/MikroTikMon
source .env
docker exec -i mikrotik-monitor-db pg_dump \
  -U $PGUSER -d $PGDATABASE -Fc \
  > backup_$(date +%Y%m%d_%H%M%S).dump
```

## Step 3: Prevent Future Data Loss

I've updated **migrate.sh** to:
- ✅ Skip destructive `00_fresh_init.sql` migrations
- ✅ Check database state before running
- ✅ Require confirmation before executing
- ✅ Only run safe upgrade migrations

**migrate.sh will now NEVER run the fresh installation script on existing databases.**

## Quick Backup Command (Save this!)

Add this to a cron job to backup daily:
```bash
#!/bin/bash
cd ~/MikroTikMon
source .env
BACKUP_DIR="$HOME/db-backups"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/mikrotik_$(date +%Y%m%d_%H%M%S).dump"

docker exec -i mikrotik-monitor-db pg_dump \
  -U $PGUSER -d $PGDATABASE -Fc \
  > "$BACKUP_FILE"

# Keep only last 7 days of backups
find "$BACKUP_DIR" -name "mikrotik_*.dump" -mtime +7 -delete

echo "Backup created: $BACKUP_FILE"
```

## Need Help?

If backups are found but you need help restoring, let me know the file path and format.
