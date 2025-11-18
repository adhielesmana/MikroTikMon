# 🐛 DATABASE DELETION BUG - FIXED

## The Problem

**Every deployment was deleting the entire database!**

### Root Cause

The `intelligent-deploy.sh` script runs ALL files in `migrations/` folder:

```bash
for migration_file in migrations/*.sql; do
    docker exec -i mikrotik-monitor-db psql ... < "$migration_file"
done
```

The file `migrations/00_fresh_init.sql` contained:

```sql
-- Drop all tables if they exist (for clean slate)
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS traffic_data CASCADE;
DROP TABLE IF EXISTS monitored_ports CASCADE;
DROP TABLE IF EXISTS routers CASCADE;
...
```

So **EVERY deployment**:
1. ✅ Preserved database volume
2. ✅ Started database container
3. ❌ Ran migrations
4. ❌ `00_fresh_init.sql` DROPPED ALL TABLES
5. ❌ Recreated empty schema
6. ❌ Data gone!

---

## The Fix

**Moved destructive migration out of migrations folder:**

```bash
# Before (BAD):
migrations/
├── 00_fresh_init.sql          ← DROPS ALL TABLES!
├── add_is_superadmin_column.sql
├── add_missing_columns.sql
└── add-retention-days.sql

# After (FIXED):
setup-scripts/
└── 00_fresh_init.sql          ← Only for first-time setup

migrations/
├── add_is_superadmin_column.sql  ← Safe migrations only
├── add_missing_columns.sql
└── add-retention-days.sql
```

---

## What You Need to Do Now

### Step 1: Pull This Fix

```bash
ssh root@mon.maxnetplus.id
cd /root/MikroTikMon

# Pull the fixed code
git pull origin main

# Verify the dangerous file is gone from migrations/
ls -la migrations/
# Should NOT see: 00_fresh_init.sql

# Verify it's in setup-scripts/ instead
ls -la setup-scripts/
# Should see: 00_fresh_init.sql
```

### Step 2: Restore Your Database

```bash
# List backups
ls -lh backups/

# Restore the November 15 backup (112MB - most complete)
./scripts/restore-database.sh backups/backup_20251115_123115.sql
```

This will restore all your:
- ✅ Users (3 accounts)
- ✅ Routers (3 routers)  
- ✅ Monitored ports
- ✅ Historical traffic data

### Step 3: Deploy Safely (NOW FIXED!)

```bash
# This is NOW SAFE - won't delete database anymore!
./intelligent-deploy.sh
```

The script will:
- ✅ Build app container
- ✅ Preserve database container
- ✅ Run ONLY safe migrations (column additions)
- ✅ **NOT run 00_fresh_init.sql** (moved out!)
- ✅ Keep all your data

---

## Verification

After deployment, verify data is preserved:

```bash
# Check database still has data
source .env
docker exec mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -c "SELECT COUNT(*) FROM users;"
docker exec mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -c "SELECT COUNT(*) FROM routers;"

# Should show:
#  count 
# -------
#      3
```

---

## Why This Happened

The `00_fresh_init.sql` migration was designed for **first-time database setup** but was accidentally placed in the `migrations/` folder that runs on **every deployment**.

**Correct usage:**

- **`init-db.sql`**: Runs ONCE when database container is first created (via docker-entrypoint-initdb.d)
- **`migrations/*.sql`**: Runs on EVERY deployment (should only add/alter, never drop)
- **`setup-scripts/`**: Manual setup scripts (not auto-run)

---

## Safe Migration Examples

✅ **Safe migrations** (can run multiple times):

```sql
-- Add missing column
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS acknowledged_by VARCHAR;

-- Create index
CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged);

-- Add constraint
ALTER TABLE routers ADD CONSTRAINT IF NOT EXISTS fk_user FOREIGN KEY (user_id) REFERENCES users(id);
```

❌ **Dangerous migrations** (should NEVER be in migrations/):

```sql
DROP TABLE IF EXISTS users CASCADE;           -- Deletes all data!
TRUNCATE TABLE traffic_data;                  -- Deletes all data!
DELETE FROM routers WHERE id IS NOT NULL;     -- Deletes all data!
```

---

## Future Prevention

1. **Never put DROP statements in migrations/**
2. **Use `IF NOT EXISTS` for all CREATE statements**
3. **Use `IF EXISTS` for all ALTER TABLE ADD COLUMN**
4. **Test migrations on local database first**
5. **Always backup before deployment** (automated daily at 3 AM)

---

## Summary

✅ **Bug fixed** - Destructive migration moved to `setup-scripts/`  
✅ **Safe to deploy** - `./intelligent-deploy.sh` won't delete data anymore  
✅ **Recovery ready** - Restore from `backup_20251115_123115.sql`  
✅ **Prevention** - Migrations folder now contains only safe migrations  

**You can now deploy without fear of losing your database!**
