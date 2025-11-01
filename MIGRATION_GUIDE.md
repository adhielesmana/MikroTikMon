# Database Migration Guide: Development → Production

This guide walks you through migrating your development database to production safely.

## 📋 Prerequisites

Before starting, ensure you have:

1. ✅ PostgreSQL client tools installed (pg_dump, pg_restore, psql)
2. ✅ Access to both development and production databases
3. ✅ Production database connection string (unpooled)
4. ✅ Backup of current production data (if any exists)

## 🚀 Quick Start (3 Steps)

### Step 1: Export Development Database

```bash
# Make the script executable
chmod +x scripts/export-dev-db.sh

# Run the export
./scripts/export-dev-db.sh
```

**What happens:**
- Creates `backups/` directory
- Exports development database to a compressed `.dump` file
- Shows file size and location

**Expected output:**
```
✅ Export completed successfully!
📦 Backup file: backups/dev_database_20250101_120000.dump
💾 File size: 2.3M
```

---

### Step 2: Get Production Database URL

**IMPORTANT:** You need the **unpooled** connection string!

1. Go to **Replit Dashboard** → Your Repl
2. Click **"Deployments"** tab
3. Click on **"Database"** → **"Connection Details"**
4. **UNCHECK** "Connection pooling" ⚠️ (very important!)
5. Copy the connection string

It should look like:
```
postgresql://username:password@ep-xxx-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require
```

Save this as an environment variable:
```bash
export PRODUCTION_DATABASE_URL='postgresql://...'
```

---

### Step 3: Import to Production

```bash
# Make the script executable
chmod +x scripts/import-to-prod.sh

# Run the import (using the backup file from Step 1)
./scripts/import-to-prod.sh backups/dev_database_20250101_120000.dump
```

**The script will:**
1. Show a confirmation warning
2. Ask you to type `YES` to confirm
3. Import the data to production
4. Show success message

**Expected output:**
```
⚠️  WARNING: PRODUCTION DATABASE RESET
This will COMPLETELY REPLACE your production database!

Type 'YES' to continue: YES

🔄 Starting import to production...
✅ Production database restored successfully!
```

---

## 🔍 Step 4: Verify (Optional but Recommended)

```bash
# Make verification script executable
chmod +x scripts/verify-prod-db.sh

# Run verification
./scripts/verify-prod-db.sh
```

**This checks:**
- Database size
- Row counts in all tables
- Admin users exist
- Recent data timestamps
- Active alerts

---

## 📝 Detailed Step-by-Step Instructions

### Installation (One-time setup)

Install PostgreSQL client tools if not already installed:

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install postgresql-client

# macOS (with Homebrew)
brew install postgresql

# Check installation
pg_dump --version
```

### Full Migration Process

#### 1. Backup Existing Production (Safety First!)

If you have existing production data you want to keep:

```bash
# Set your production URL
export PRODUCTION_DATABASE_URL='postgresql://...'

# Create safety backup
pg_dump -Fc -d "$PRODUCTION_DATABASE_URL" \
  -f backups/prod_backup_$(date +%Y%m%d).dump

echo "Production backup saved!"
```

#### 2. Export Development Database

```bash
# The export script uses your current DATABASE_URL
./scripts/export-dev-db.sh

# You should see output like:
# ✅ Export completed successfully!
# 📦 Backup file: backups/dev_database_20250101_120000.dump
```

**The export includes:**
- All table structures (schema)
- All data (users, routers, alerts, traffic data, etc.)
- Indexes and constraints
- No ownership or privilege information

#### 3. Get Production Connection String

**Critical: Must be UNPOOLED!**

Where to find it:
1. **Replit Dashboard** → Your Repl → **Deployments**
2. Click **Database** section
3. Click **Connection Details**
4. **UNCHECK "Connection pooling"** checkbox ⚠️
5. Copy the connection string

Set it in your environment:
```bash
# In your terminal
export PRODUCTION_DATABASE_URL='postgresql://user:pass@ep-xxx.region.aws.neon.tech/dbname?sslmode=require'

# Or pass it directly to the script (see below)
```

#### 4. Import to Production

**Method A: Using environment variable**
```bash
export PRODUCTION_DATABASE_URL='postgresql://...'
./scripts/import-to-prod.sh backups/dev_database_20250101_120000.dump
```

**Method B: Pass URL as argument**
```bash
./scripts/import-to-prod.sh backups/dev_database_20250101_120000.dump 'postgresql://...'
```

**You will be prompted:**
```
⚠️  WARNING: PRODUCTION DATABASE RESET
Type 'YES' to continue:
```

Type `YES` (all caps) and press Enter.

**The import process:**
1. Drops existing tables (if any)
2. Creates fresh schema
3. Imports all data
4. Creates indexes and constraints

**Expected duration:**
- Small database (<10 MB): 10-30 seconds
- Medium database (10-100 MB): 1-3 minutes
- Large database (>100 MB): 3-10 minutes

#### 5. Verify the Import

```bash
# Run verification script
./scripts/verify-prod-db.sh

# Or manually check with psql
psql "$PRODUCTION_DATABASE_URL" -c "SELECT COUNT(*) FROM users;"
psql "$PRODUCTION_DATABASE_URL" -c "SELECT COUNT(*) FROM routers;"
```

**Expected output:**
```
✅ Verification completed successfully!

📊 Database Size: 5.2 MB
👥 Users: 3
🖥️  Routers: 12
📈 Traffic Data: 45,890
```

#### 6. Test Your Application

**Critical checks:**

1. **Admin Login**
   - Username: `admin`
   - Password: `admin` (or whatever you changed it to)
   - Should redirect to change password page on first login

2. **Router Access**
   - Admin can see ALL routers
   - Normal users see only their routers

3. **Traffic Monitoring**
   - Real-time graphs working
   - Historical data visible

4. **Alerts**
   - Alert history visible
   - New alerts generating correctly

#### 7. Optimize Production Database

After import, optimize the database:

```bash
psql "$PRODUCTION_DATABASE_URL" << 'EOF'
-- Update statistics
VACUUM ANALYZE;

-- Reindex for performance
REINDEX DATABASE CONCURRENTLY current_database();
EOF
```

---

## ⚠️ Troubleshooting

### Error: "role does not exist"

**This is NORMAL and can be ignored.**

These warnings occur because Neon users don't have superuser privileges. The data still imports correctly.

### Error: "column does not exist"

Check that your development schema is up-to-date:
```bash
npm run db:push
```

### Error: "connection pooling not supported"

You're using a pooled connection. Get the **unpooled** connection string:
- Replit Dashboard → Deployments → Database
- **UNCHECK "Connection pooling"**

### Import seems stuck

Large databases take time. Wait patiently. You can monitor progress:
```bash
# In another terminal, check active connections
psql "$PRODUCTION_DATABASE_URL" -c "SELECT * FROM pg_stat_activity WHERE datname = 'neondb';"
```

### Need to abort and rollback

If you backed up production first:
```bash
./scripts/import-to-prod.sh backups/prod_backup_20250101.dump
```

---

## 🔒 Security Best Practices

1. **Never commit connection strings to git**
   - Use environment variables
   - Add to `.env` and ensure `.env` is in `.gitignore`

2. **Always backup before importing**
   - Keep multiple backup versions
   - Store backups securely

3. **Use unpooled connections**
   - PgBouncer pooling breaks pg_dump/pg_restore

4. **Test on staging first**
   - If possible, test on a staging environment
   - Verify before applying to production

---

## 📚 Common Scenarios

### Scenario 1: First-time Production Setup

```bash
# 1. Export dev database
./scripts/export-dev-db.sh

# 2. Import to production (no existing data)
./scripts/import-to-prod.sh backups/dev_database_YYYYMMDD_HHMMSS.dump

# 3. Verify
./scripts/verify-prod-db.sh
```

### Scenario 2: Reset Production with Fresh Dev Data

```bash
# 1. Backup current production (just in case)
pg_dump -Fc -d "$PRODUCTION_DATABASE_URL" -f backups/prod_backup_$(date +%Y%m%d).dump

# 2. Export latest dev
./scripts/export-dev-db.sh

# 3. Import to production
./scripts/import-to-prod.sh backups/dev_database_YYYYMMDD_HHMMSS.dump

# 4. Verify
./scripts/verify-prod-db.sh
```

### Scenario 3: Rollback to Previous Production Backup

```bash
# Restore from backup
./scripts/import-to-prod.sh backups/prod_backup_20250101.dump
```

---

## 📞 Need Help?

If you encounter issues:

1. Check the error messages carefully
2. Review the troubleshooting section above
3. Verify your connection strings are correct
4. Ensure you're using unpooled connections
5. Check that PostgreSQL client tools are installed

---

## 🎯 Summary

**Quick reference:**

```bash
# 1. Export development
./scripts/export-dev-db.sh

# 2. Set production URL
export PRODUCTION_DATABASE_URL='postgresql://...'

# 3. Import to production
./scripts/import-to-prod.sh backups/dev_database_YYYYMMDD_HHMMSS.dump

# 4. Verify
./scripts/verify-prod-db.sh

# 5. Optimize
psql "$PRODUCTION_DATABASE_URL" -c "VACUUM ANALYZE;"
```

**Done! Your production database now matches your development database.**
