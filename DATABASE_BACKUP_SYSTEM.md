# 🗄️ Automated Database Backup System

## Overview
Your MikroTik monitoring platform now includes **automated daily database backups** with compression and retention management.

---

## ✨ Features

### Automatic Backups
- ⏰ **Runs daily at 3 AM** (production only)
- 🗜️ **Compressed with gzip** (typically 80-90% size reduction)
- 📦 **30-day retention** (automatically deletes old backups)
- 🔔 **Failure notifications** (admins get in-app alerts if backup fails)

### Manual Backups
- ✅ Run anytime with: `docker exec mikrotik-monitor-app bash /app/scripts/backup-database.sh`
- ✅ Same compression and format

---

## 📁 Backup Location

**Production:** `/root/MikroTikMon/backups/`

Backups are stored as:
```
mikrotik_monitor_backup_YYYYMMDD_HHMMSS.sql.gz
```

Example:
```
mikrotik_monitor_backup_20251117_030000.sql.gz  (Daily backup at 3 AM)
mikrotik_monitor_backup_20251117_143022.sql.gz  (Manual backup)
```

---

## 📊 Backup Schedule

| Time | Task | Description |
|------|------|-------------|
| **2:00 AM** | Data Cleanup | Delete traffic data older than 2 years |
| **3:00 AM** | Database Backup | Create compressed backup, delete backups > 30 days |

---

## 🔧 How It Works

### 1. Automated Daily Backup (3 AM)
```
scheduler.ts (node-cron)
    ↓
scripts/backup-database.sh
    ↓
pg_dump → mikrotik_monitor_backup_YYYYMMDD_HHMMSS.sql
    ↓
gzip → .sql.gz (compressed)
    ↓
Delete backups older than 30 days
```

### 2. Backup Script Details
```bash
# Location: scripts/backup-database.sh
# Database: Uses PGHOST, PGUSER, PGPASSWORD from environment
# Compression: gzip (typically 80-90% reduction)
# Retention: Keeps last 30 days
# Format: Plain SQL dump (compatible with pg_restore or psql)
```

---

## 🚀 Manual Backup Commands

### Create a Backup Now

**Production:**
```bash
# SSH to production
ssh root@mon.maxnetplus.id
cd /root/MikroTikMon

# Run backup script
docker exec mikrotik-monitor-app bash /app/scripts/backup-database.sh

# Check backups directory
ls -lh backups/
```

**Expected Output:**
```
==========================================
  Database Backup - Sun Nov 17 15:30:22 UTC 2025
==========================================

✓ Backup directory: /app/backups
⏳ Creating database backup...
✓ Database dump completed: mikrotik_monitor_backup_20251117_153022.sql
✓ Uncompressed size: 4.2M
⏳ Compressing backup...
✓ Backup compressed: mikrotik_monitor_backup_20251117_153022.sql.gz
✓ Compressed size: 512K
✓ Compression ratio: 87.8%

⏳ Cleaning up old backups (older than 30 days)...
✓ No old backups to delete

==========================================
  Backup Summary
==========================================
Location: /app/backups
Latest: mikrotik_monitor_backup_20251117_153022.sql.gz

Recent backups:
  mikrotik_monitor_backup_20251117_030000.sql.gz (512K)
  mikrotik_monitor_backup_20251117_153022.sql.gz (512K)

✓ Total backups: 2
✓ Total size: 1.0M
==========================================
```

---

## 🔄 Restore from Backup

### Step 1: Stop the Application
```bash
ssh root@mon.maxnetplus.id
cd /root/MikroTikMon

docker compose down
```

### Step 2: Restore Database
```bash
# List available backups
ls -lh backups/

# Decompress backup (replace with your backup file)
gunzip -c backups/mikrotik_monitor_backup_20251117_030000.sql.gz > /tmp/restore.sql

# Restore database
docker compose up -d mikrotik-monitor-db
sleep 5  # Wait for database to be ready

# Drop existing database and restore
docker exec -i mikrotik-monitor-db psql -U $PGUSER -d postgres << EOF
DROP DATABASE IF EXISTS $PGDATABASE;
CREATE DATABASE $PGDATABASE;
GRANT ALL PRIVILEGES ON DATABASE $PGDATABASE TO $PGUSER;
