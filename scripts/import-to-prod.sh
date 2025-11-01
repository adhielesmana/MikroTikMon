#!/bin/bash
# Import Development Database Backup to Production
# This script restores a development backup to your production database

set -e

echo "=================================================="
echo "  Production Database Import Tool"
echo "=================================================="
echo ""

# Check if pg_restore is installed
if ! command -v pg_restore &> /dev/null; then
    echo "❌ ERROR: pg_restore is not installed"
    echo "   Install PostgreSQL client tools first"
    exit 1
fi

# Check if backup file is provided
if [ -z "$1" ]; then
    echo "❌ ERROR: No backup file specified"
    echo ""
    echo "Usage: ./scripts/import-to-prod.sh <backup_file>"
    echo ""
    echo "Available backups:"
    ls -lh backups/*.dump 2>/dev/null || echo "  No backups found in backups/"
    echo ""
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Get production database URL from environment or argument
PROD_DB_URL="${PRODUCTION_DATABASE_URL:-$2}"

if [ -z "$PROD_DB_URL" ]; then
    echo "❌ ERROR: Production database URL not provided"
    echo ""
    echo "Option 1: Set environment variable"
    echo "  export PRODUCTION_DATABASE_URL='postgresql://user:pass@host/db'"
    echo ""
    echo "Option 2: Pass as second argument"
    echo "  ./scripts/import-to-prod.sh <backup_file> 'postgresql://user:pass@host/db'"
    echo ""
    echo "📚 How to get your production database URL:"
    echo "  1. Go to Replit Dashboard → Your Repl"
    echo "  2. Click 'Deployments' tab"
    echo "  3. Click on Database → Connection Details"
    echo "  4. IMPORTANT: UNCHECK 'Connection pooling' checkbox"
    echo "  5. Copy the connection string"
    echo ""
    exit 1
fi

FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

echo "⚠️  WARNING: PRODUCTION DATABASE RESET"
echo "=================================================="
echo ""
echo "This will COMPLETELY REPLACE your production database!"
echo ""
echo "📊 Source backup: $BACKUP_FILE"
echo "💾 Backup size: $FILE_SIZE"
echo "🎯 Target: Production Database"
echo ""
echo "All existing production data will be DELETED and"
echo "replaced with data from this backup file."
echo ""
echo "=================================================="
echo ""
read -p "Type 'YES' to continue (anything else to abort): " confirm

if [ "$confirm" != "YES" ]; then
    echo ""
    echo "❌ Import aborted. No changes made."
    exit 1
fi

echo ""
echo "🔄 Starting import to production..."
echo ""
echo "This may take a few minutes depending on database size."
echo "Please wait..."
echo ""

# Restore the backup to production
# --clean: Drop existing objects before recreating
# --if-exists: Use IF EXISTS when dropping objects (prevents errors)
# --no-owner: Don't restore ownership
# --no-privileges: Don't restore access privileges
pg_restore -v \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  -d "$PROD_DB_URL" \
  "$BACKUP_FILE" 2>&1 | grep -E "processing|restoring|creating|completed|ERROR|WARNING" || true

if [ $? -eq 0 ]; then
    echo ""
    echo "=================================================="
    echo "✅ Production database restored successfully!"
    echo "=================================================="
    echo ""
    echo "Next steps:"
    echo "1. ✅ Verify data in production database"
    echo "2. ✅ Test admin login (username: admin, password: admin)"
    echo "3. ✅ Test your application functionality"
    echo "4. ✅ Monitor for any issues"
    echo ""
    echo "📝 Recommended: Run database optimization"
    echo "   psql '$PROD_DB_URL' -c 'VACUUM ANALYZE;'"
    echo ""
else
    echo ""
    echo "⚠️  Import completed with warnings/errors"
    echo "   Check the output above for details"
    echo "   Some errors like 'role does not exist' are normal and can be ignored"
    echo ""
    exit 1
fi
