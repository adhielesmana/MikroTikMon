# Quick Production Fix Guide

## Three Critical Issues

1. **Database keeps disappearing** after deployment
2. **Routers show disconnected** (no background poller)
3. **No alerts** (scheduler not running)

## Root Cause

All three are connected:
```
Database Empty → No Routers → Scheduler Has Nothing to Monitor → Appears Broken
```

## Quick Fix (5 Minutes)

### On Production Server

```bash
ssh root@mon.maxnetplus.id
cd /root/mikrotik-monitoring-platform

# Step 1: Run diagnostic
./diagnose-production.sh

# Step 2: Run automated fix
./fix-production.sh
```

The fix script will:
- ✓ Verify database container is running
- ✓ Run migrations
- ✓ Offer to restore from backup (if empty)
- ✓ Rebuild and restart app
- ✓ Verify scheduler starts

## Manual Fix (If Scripts Fail)

### 1. Check Database Status

```bash
source .env
docker exec mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -c "SELECT COUNT(*) FROM users;"
docker exec mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -c "SELECT COUNT(*) FROM routers;"
```

### 2. If Database is Empty - Restore Backup

```bash
# List backups
ls -lh backups/

# Restore latest
./scripts/restore-database.sh backups/backup-YYYY-MM-DD.sql.gz
```

### 3. Rebuild Application (Database-Safe)

```bash
# Build only app (NEVER rebuild database!)
docker compose build --no-cache app

# Stop and remove old app
docker compose stop app
docker compose rm -f app

# Start new app
docker compose up -d app
```

### 4. Verify Scheduler is Running

```bash
# Watch scheduler logs (should see activity within 60 seconds)
docker logs -f mikrotik-monitor-app | grep Scheduler

# Expected logs:
# [Scheduler] Polling 3 routers with monitored ports
# [Scheduler] Will try methods in order for MaxNet Core: rest → native → snmp
# [Scheduler] ✓ Method 'rest' successful! Retrieved 24 interfaces
# [Scheduler] Checking alerts...
```

## What NOT to Do

```bash
# ✗ NEVER USE -v FLAG (deletes volumes!)
docker compose down -v

# ✗ NEVER DELETE VOLUME
docker volume rm postgres_data

# ✗ NEVER FORCE RECREATE ALL
docker compose up -d --force-recreate
```

## Always Use Safe Deployment

```bash
# ✓ SAFE - Uses intelligent deploy script
./intelligent-deploy.sh

# This script:
# - Builds ONLY app container
# - NEVER touches database container
# - Preserves postgres_data volume
# - Verifies data after deployment
```

## How to Know It's Fixed

### 1. Database Has Data
```bash
docker exec mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -c "SELECT COUNT(*) FROM routers;"
# Should return: 3 (or your router count)
```

### 2. Scheduler is Active
```bash
docker logs --since 2m mikrotik-monitor-app | grep Scheduler
# Should show polling activity every 60 seconds
```

### 3. Routers Connect
- Visit https://mon.maxnetplus.id/routers
- Wait 60 seconds
- Status changes: "disconnected" → "connected"

## Prevention

1. **Always backup before deployment**
   ```bash
   ./scripts/backup-database.sh
   ```

2. **Only use safe deployment script**
   ```bash
   ./intelligent-deploy.sh
   ```

3. **Verify after deployment**
   ```bash
   docker exec mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -c "SELECT COUNT(*) FROM users;"
   ```

## New Scheduler Fix (Deployed)

The scheduler now has **intelligent connection retry**:

1. Tries cached method (e.g., 'rest')
2. If fails, tries ALL enabled methods:
   - Native API
   - REST API  
   - SNMP
3. Only marks disconnected if ALL fail
4. Updates cached method when fallback succeeds

This fixes the issue where routers showed "disconnected" even though REST API was working.

## Need Help?

Run diagnostic and save output:
```bash
./diagnose-production.sh > diagnostic.txt
```

Then check the logs for specific errors.
