# Deployment & Migration Guide

## Cloud DDNS Hostname Feature Migration

This guide explains how to update your production database with the new `cloud_ddns_hostname` feature.

## What's New?

The application now supports Cloud DDNS hostname fallback for REST API connections:

- **IP addresses** are used for reachability checks and as fallback
- **Cloud DDNS hostnames** are tried first for REST API HTTPS connections
- **Automatic fallback** to IP if Cloud DDNS fails
- **Auto-extraction** of Cloud DDNS hostname from SSL certificates

## Database Changes Required

A new column `cloud_ddns_hostname` has been added to the `routers` table.

## Migration Instructions

### Option 1: Using Deploy Script (Recommended for Docker)

If you're using Docker deployment:

```bash
# Run all pending migrations
./deploy.sh migrate
```

This will apply all migration files automatically.

### Option 2: Automatic Migration During Update

When you update your deployment:

```bash
# Update will automatically run migrations
./deploy.sh update
```

### Option 3: Manual Database Migration

If you manage your database separately:

```sql
-- Add cloud_ddns_hostname column
ALTER TABLE routers 
ADD COLUMN cloud_ddns_hostname VARCHAR(255);

-- Add documentation comment
COMMENT ON COLUMN routers.cloud_ddns_hostname IS 
    'Auto-extracted Cloud DDNS hostname from SSL certificate (for REST API HTTPS and display purposes only)';
```

Or using the migration file:

```bash
# For Docker
docker compose exec -T mikrotik-monitor-db psql -U mikrotik_user mikrotik_monitor < scripts/migrations/001_add_cloud_ddns_hostname.sql

# For direct connection
psql $DATABASE_URL < scripts/migrations/001_add_cloud_ddns_hostname.sql

# For production server
psql "postgresql://user:password@host:port/database" < scripts/migrations/001_add_cloud_ddns_hostname.sql
```

## Verification

After running the migration, verify it was successful:

```sql
-- Check if column exists
SELECT column_name, data_type, character_maximum_length 
FROM information_schema.columns 
WHERE table_name = 'routers' 
AND column_name = 'cloud_ddns_hostname';
```

Expected output:
```
column_name          | data_type         | character_maximum_length
---------------------|-------------------|-------------------------
cloud_ddns_hostname  | character varying | 255
```

## Deployment Workflow

### Full Deployment Steps

1. **Backup your database** (Important!)
   ```bash
   ./deploy.sh backup
   ```

2. **Update application code**
   ```bash
   git pull origin main
   ```

3. **Run update command** (includes migrations)
   ```bash
   ./deploy.sh update
   ```

4. **Verify application is running**
   ```bash
   ./deploy.sh status
   ./deploy.sh logs
   ```

### First-Time Setup

If this is your first deployment:

```bash
# Run initial setup
./setup.sh

# Start application
./deploy.sh up

# Migrations run automatically on first start
```

## Useful Commands

```bash
# View all available commands
./deploy.sh

# Start application
./deploy.sh up

# Stop application
./deploy.sh stop

# Restart application
./deploy.sh restart

# View logs
./deploy.sh logs

# Run migrations only
./deploy.sh migrate

# Create database backup
./deploy.sh backup

# Restore from backup
./deploy.sh restore backup_YYYYMMDD_HHMMSS.sql

# Open database shell
./deploy.sh db-shell

# Reset admin password
./deploy.sh reset-password
```

## Rollback Procedure

If you need to rollback the migration:

1. **Stop the application**
   ```bash
   ./deploy.sh stop
   ```

2. **Restore from backup**
   ```bash
   ./deploy.sh restore backup_file.sql
   ```

3. **Revert code to previous version**
   ```bash
   git checkout <previous-commit>
   ```

4. **Rebuild and start**
   ```bash
   ./deploy.sh up
   ```

## Troubleshooting

### Migration Fails

If migration fails:

1. Check database connection
   ```bash
   ./deploy.sh db-shell
   ```

2. Verify migration hasn't been partially applied
   ```sql
   \d routers  -- Shows table structure
   ```

3. Run migration manually if needed
   ```bash
   ./deploy.sh migrate
   ```

### Application Won't Start

1. Check logs
   ```bash
   ./deploy.sh logs
   ```

2. Verify database is running
   ```bash
   ./deploy.sh status
   ```

3. Check .env configuration
   ```bash
   ./deploy.sh fix-db
   ```

## Production Checklist

- [ ] Create database backup
- [ ] Test migration on staging/development first
- [ ] Review migration SQL file
- [ ] Plan maintenance window (minimal downtime)
- [ ] Update application code
- [ ] Run migrations
- [ ] Verify application starts correctly
- [ ] Test core functionality (add router, view traffic)
- [ ] Monitor logs for errors
- [ ] Keep backup for 7+ days

## Support

If you encounter issues:

1. Check logs: `./deploy.sh logs`
2. Review migration file: `scripts/migrations/001_add_cloud_ddns_hostname.sql`
3. Verify database connection: `./deploy.sh db-shell`
4. Check migration documentation: `scripts/migrations/README.md`

## What Happens Automatically

When you run `./deploy.sh update` or `./deploy.sh migrate`:

1. ✅ Checks if `cloud_ddns_hostname` column exists
2. ✅ Adds column only if it doesn't exist (idempotent)
3. ✅ Adds documentation comment
4. ✅ Logs success message
5. ✅ Skips if already applied

**Safe to run multiple times!**
