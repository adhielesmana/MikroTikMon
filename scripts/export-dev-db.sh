#!/bin/bash
# Export Development Database to Backup File
# This script creates a compressed backup of your development database

set -e

echo "=================================================="
echo "  Development Database Export Tool"
echo "=================================================="
echo ""

# Check if pg_dump is installed
if ! command -v pg_dump &> /dev/null; then
    echo "❌ ERROR: pg_dump is not installed"
    echo "   Install PostgreSQL client tools first"
    exit 1
fi

# Get development database URL
DEV_DB_URL="${DATABASE_URL}"

if [ -z "$DEV_DB_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable is not set"
    exit 1
fi

# Create backups directory if it doesn't exist
mkdir -p backups

# Generate filename with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backups/dev_database_${TIMESTAMP}.dump"

echo "📊 Database: Development (Replit)"
echo "📁 Output file: $BACKUP_FILE"
echo ""
echo "🔄 Starting export..."
echo ""

# Export database with custom format (compressed)
pg_dump -Fc -v \
  --no-owner \
  --no-privileges \
  -d "$DEV_DB_URL" \
  -f "$BACKUP_FILE" 2>&1 | grep -E "processing|saving|completed" || true

if [ $? -eq 0 ]; then
    FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo ""
    echo "=================================================="
    echo "✅ Export completed successfully!"
    echo "=================================================="
    echo ""
    echo "📦 Backup file: $BACKUP_FILE"
    echo "💾 File size: $FILE_SIZE"
    echo ""
    echo "Next steps:"
    echo "1. Download this file if needed: $BACKUP_FILE"
    echo "2. Run import-to-prod.sh to restore to production"
    echo ""
else
    echo ""
    echo "❌ Export failed. Check the errors above."
    exit 1
fi
