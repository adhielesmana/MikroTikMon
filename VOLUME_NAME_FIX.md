# Docker Volume Name Issue - FIXED

## The Problem

Docker Compose prefixes volume names with the project directory name:

```
Expected:  postgres_data
Actual:    mikrotik-monitor_postgres_data
           ^^^^^^^^^^^^^^^^^
           Project directory prefix
```

## Quick Check (Run on Production)

```bash
# See what your actual volume name is
docker volume ls | grep postgres

# Expected output:
# DRIVER    VOLUME NAME
# local     mikrotik-monitor_postgres_data
```

## I've Already Fixed Both Scripts

The updated scripts now **auto-detect** the correct volume name:

✅ `diagnose-production.sh` - Fixed
✅ `fix-production.sh` - Fixed

## What to Do Now

### Option 1: Pull Latest Scripts (Recommended)

```bash
ssh root@mon.maxnetplus.id
cd /root/mikrotik-monitoring-platform

# Pull the fixed scripts
git pull origin main

# Run diagnostic again (should work now)
./diagnose-production.sh
```

### Option 2: Manual Commands (If git pull doesn't work)

```bash
ssh root@mon.maxnetplus.id
cd /root/mikrotik-monitoring-platform

# Check actual volume name
VOLUME_NAME=$(docker volume ls --format "{{.Name}}" | grep "postgres_data" | head -n 1)
echo "Actual volume name: $VOLUME_NAME"

# Check volume size
docker volume inspect "$VOLUME_NAME" --format '{{.Mountpoint}}' | xargs du -sh

# Check database data
source .env
docker exec mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -c "SELECT COUNT(*) FROM users;"
docker exec mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -c "SELECT COUNT(*) FROM routers;"
```

## What the Scripts Do Now

Both scripts automatically detect the volume name:

```bash
# Old (hardcoded - BREAKS):
docker volume inspect postgres_data

# New (auto-detect - WORKS):
VOLUME_NAME=$(docker volume ls --format "{{.Name}}" | grep "postgres_data" | head -n 1)
docker volume inspect "$VOLUME_NAME"
```

## Next Steps

1. **Pull the fixed scripts:**
   ```bash
   git pull origin main
   ```

2. **Run diagnostic (will work now):**
   ```bash
   ./diagnose-production.sh
   ```

3. **Run fix if needed:**
   ```bash
   ./fix-production.sh
   ```

The scripts will now correctly find your `mikrotik-monitor_postgres_data` volume!
