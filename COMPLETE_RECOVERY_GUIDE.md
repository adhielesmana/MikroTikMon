# ✅ Complete Database Recovery Guide

## The Bug Was Fixed

The critical bug that was deleting your database on every deployment has been **FIXED**.

The destructive migration file has been removed from the auto-run folder.

---

## 📋 Complete Recovery Steps

Run these commands **in order** on your production server:

### Step 1: SSH to Production Server

```bash
ssh root@mon.maxnetplus.id
cd /root/MikroTikMon
```

### Step 2: Pull the Fixed Code

```bash
# Get the latest code with the fix
git pull origin main

# Verify the dangerous migration is gone
ls migrations/
# Should NOT see: 00_fresh_init.sql

# Verify it's been moved to setup-scripts/
ls setup-scripts/
# Should see: 00_fresh_init.sql
```

### Step 3: List Available Backups

```bash
# See what backups you have
ls -lh backups/
```

You should see:
```
-rwxr-xr-x 1 1000 1000  88M Nov 17 14:28 backup_20251113_080453.sql
-rwxr-xr-x 1 1000 1000 112M Nov 17 14:28 backup_20251115_123115.sql  ← Use this one
-rwxr-xr-x 1 1000 1000  16K Nov 17 22:11 mikrotik_monitor_backup_20251117_164130.sql.gz
```

### Step 4: Restore Database from Backup

```bash
# Restore the November 15 backup (112MB - most complete)
./restore-database.sh backups/backup_20251115_123115.sql
```

The script will:
1. Ask for confirmation (press Enter to continue)
2. Stop the application
3. Drop the old empty schema
4. Restore all data from backup
5. Restart the application
6. Show you verification statistics

**Expected output:**
```
✓ Database Restored Successfully!

Database statistics:
  Users:          3
  Routers:        3
  Monitored Ports: 2
  Traffic Records: 50000+
```

### Step 5: Deploy Latest Code (NOW SAFE!)

```bash
# This is NOW SAFE - won't delete your database anymore!
./intelligent-deploy.sh
```

This will:
- ✅ Build app with scheduler fixes
- ✅ Run ONLY safe migrations (add columns)
- ✅ **NOT drop any tables** (destructive migration removed!)
- ✅ Keep all your restored data

### Step 6: Verify Everything Works

```bash
# Check database has data
source .env
docker exec mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -c "SELECT COUNT(*) FROM users;"
# Should show: 3

docker exec mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -c "SELECT COUNT(*) FROM routers;"
# Should show: 3

# Watch scheduler (should see activity within 60 seconds, no errors)
docker logs -f mikrotik-monitor-app | grep Scheduler
```

**Expected scheduler logs:**
```
[Scheduler] Polling 3 routers with monitored ports
[Scheduler] Will try methods in order for MaxNet Core: rest → native → snmp
[Scheduler] Trying method 'rest' for MaxNet Core...
[REST API] Successfully retrieved 24 interfaces
[Scheduler] ✓ Method 'rest' successful! Retrieved 24 interfaces
[Scheduler] Processing 10 monitored port(s) from single API response
[Scheduler] Caching 24 interfaces to database for MaxNet Core
[Scheduler] Checking alerts...
[Scheduler] Alert check completed  ← NO ERRORS!
```

### Step 7: Check Web Interface

1. Visit: https://mon.maxnetplus.id
2. Login with your credentials
3. Go to Routers page
4. Wait 60 seconds
5. Routers should change from "disconnected" → "connected" ✅

---

## 🎯 Summary of Changes

| What | Before | After |
|------|--------|-------|
| **Database survival** | ❌ Deleted every deployment | ✅ Preserved forever |
| **migrations/ folder** | ❌ Had DROP TABLE statements | ✅ Only safe migrations |
| **Scheduler** | ⚠️ Runs but errors | ✅ Works perfectly |
| **Alerts** | ❌ Missing column errors | ✅ No errors |
| **Connection fallback** | ⚠️ Single method | ✅ Intelligent retry (all methods) |

---

## 🔒 What's Now Protected

The fix ensures:
1. ✅ `migrations/` contains ONLY safe migrations (add columns, indexes)
2. ✅ Destructive operations moved to `setup-scripts/` (manual only)
3. ✅ Database volume always preserved
4. ✅ Data survives all deployments

---

## ⚡ Quick Command Reference

```bash
# Restore database
./restore-database.sh backups/backup_20251115_123115.sql

# Deploy safely
./intelligent-deploy.sh

# Check data
docker exec mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -c "SELECT COUNT(*) FROM routers;"

# Watch scheduler
docker logs -f mikrotik-monitor-app | grep Scheduler

# Check volume size
docker volume ls --format "{{.Name}}" | grep postgres | xargs docker volume inspect --format '{{.Mountpoint}}' | xargs du -sh
```

---

## 🚨 If You Need Help

If anything goes wrong during restore:

```bash
# Check what went wrong
docker logs mikrotik-monitor-app --tail 100

# Try the diagnostic
./diagnose-production.sh

# Manual database check
docker exec -it mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE
```

---

## ✅ Success Criteria

You'll know it's working when:

1. **Database has data:**
   - Users count: 3
   - Routers count: 3
   - Volume size: 100MB+

2. **Scheduler is active:**
   - Logs every 60 seconds
   - No "column does not exist" errors
   - Shows "✓ Method 'rest' successful!"

3. **Web interface works:**
   - Can login
   - Routers show "connected"
   - Traffic graphs display data

---

## 🎉 That's It!

Once you complete these steps, your monitoring platform will be **fully operational** and **safe from database deletion** on future deployments.

Total time: ~10 minutes
