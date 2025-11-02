# Database Migrations

This directory contains SQL migration scripts for the MikroTik Monitor database.

## Migration Files

Migrations are numbered sequentially and run in order:

- `001_add_cloud_ddns_hostname.sql` - Adds Cloud DDNS hostname column for REST API HTTPS fallback

## Running Migrations

### Docker Deployment

If you're using Docker deployment, run migrations using:

```bash
./deploy.sh migrate
```

This will automatically run all migration files in order.

### Manual Migration

If you need to run migrations manually, connect to your database and execute:

```bash
# Using Docker
docker compose exec -T mikrotik-monitor-db psql -U mikrotik_user mikrotik_monitor < scripts/migrations/001_add_cloud_ddns_hostname.sql

# Using direct psql connection
psql $DATABASE_URL < scripts/migrations/001_add_cloud_ddns_hostname.sql
```

### Production Database

For production databases, you can run migrations directly:

```bash
# Connect to your production database
psql "postgresql://user:password@host:port/database" < scripts/migrations/001_add_cloud_ddns_hostname.sql
```

## Creating New Migrations

When creating new migrations:

1. Create a new `.sql` file with the next sequential number: `00X_description.sql`
2. Add idempotent checks (use `IF NOT EXISTS` or similar)
3. Include comments explaining the migration purpose
4. Test the migration on a development database first

Example template:

```sql
-- Migration: Description of what this does
-- Date: YYYY-MM-DD
-- Description: Detailed explanation

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'your_table' 
        AND column_name = 'your_column'
    ) THEN
        -- Your migration code here
        ALTER TABLE your_table ADD COLUMN your_column VARCHAR(255);
        
        RAISE NOTICE 'Migration completed successfully';
    ELSE
        RAISE NOTICE 'Migration already applied, skipping';
    END IF;
END $$;
```

## Migration Best Practices

1. **Always make migrations idempotent** - They should be safe to run multiple times
2. **Test locally first** - Never run untested migrations on production
3. **Backup before migrating** - Use `./deploy.sh backup` to create a backup
4. **Use transactions where appropriate** - Wrap multiple changes in a transaction
5. **Document your changes** - Add comments explaining what and why

## Rollback

If you need to rollback a migration:

1. Restore from backup: `./deploy.sh restore backup_file.sql`
2. Manually revert changes using appropriate SQL commands

Always test rollback procedures on a development database first.
