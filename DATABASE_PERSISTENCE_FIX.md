# CRITICAL DATABASE PERSISTENCE FIX

## Problem
Database data is being lost on every deployment despite multiple fix attempts.

## Root Cause (Found by Architect)
The deployment might be running `docker compose down -v` or an old version of the deploy script that removes volumes.

## VERIFIED FIX

### Step 1: Update Your Production Server Script

**SSH to your production server:**
```bash
ssh root@mon.maxnetplus.id
cd /root/MikroTikMon
```

### Step 2: Pull Latest Code
```bash
git pull origin main
```

### Step 3: Verify intelligent-deploy.sh Changes

Check that your script has these critical lines:

```bash
# Line 373: Build ONLY app (never database)
docker-compose build --no-cache app

# Line 381-401: Smart database handling (never recreate)
DB_CONTAINER_EXISTS=$(docker ps -a --filter "name=mikrotik-monitor-db" ...)
```

**CRITICAL:** The script should NEVER have:
- ❌ `docker compose down -v` (the `-v` flag deletes volumes!)
- ❌ `docker-compose down -v`
- ❌ `docker volume rm postgres_data`
- ❌ `docker volume prune`

### Step 4: Verify Docker Compose Version

Check docker-compose.yml line 5:
```yaml
image: timescale/timescaledb:2.14.2-pg16  # ✅ Pinned version
```

NOT:
```yaml
image: timescale/timescaledb:latest-pg16  # ❌ Floating tag (risky)
```

### Step 5: SAFE Deployment Procedure

```bash
# On production server
cd /root/MikroTikMon

# Pull latest code
git pull origin main

# Run the intelligent deploy script
./intelligent-deploy.sh
```

**What you should see:**
```
Building application image (database untouched)...
✓ Database container already running (preserving data)
Stopping application container...
Removing old application container...
Starting new application container...
✓ Existing database data preserved!
  Users: X
  Routers: Y
```

### Step 6: Verify Data Persistence

After deployment, check that your data is still there:
```bash
docker exec mikrotik-monitor-db psql -U mikrotik_user -d mikrotik_monitor -c "SELECT COUNT(*) FROM users;"
docker exec mikrotik-monitor-db psql -U mikrotik_user -d mikrotik_monitor -c "SELECT COUNT(*) FROM routers;"
```

### Emergency: If Data Already Lost

If you've already lost data and have a backup:

```bash
# List available backups
ls -lh /root/MikroTikMon/backups/

# Restore from most recent backup (via web UI is easier)
# Or manually:
cd /root/MikroTikMon
gunzip -c backups/mikrotik_monitor_backup_YYYYMMDD_HHMMSS.sql.gz | \
  docker exec -i mikrotik-monitor-db psql -U mikrotik_user -d mikrotik_monitor
```

## Why This Fix Works

1. **Pinned TimescaleDB version** - No surprise image updates
2. **Never touch database service** - Only rebuild app
3. **Smart container checks** - Start if stopped, never recreate
4. **Volume preservation** - Named volume `postgres_data` never deleted
5. **No down -v commands** - The `-v` flag was the killer!

## Testing the Fix

Run deployment twice in a row:
```bash
./intelligent-deploy.sh
# Check data is still there
./intelligent-deploy.sh
# Check data is STILL there - if yes, fix works!
```

## If Problem Persists

If data is STILL lost after this fix:
1. Check you're using the latest intelligent-deploy.sh
2. Look for custom scripts that might be calling `docker compose down -v`
3. Check cron jobs or auto-deployment scripts
4. Verify the postgres_data volume exists: `docker volume ls | grep postgres_data`

