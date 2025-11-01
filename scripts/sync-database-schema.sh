#!/bin/bash
# Sync Database Schema - Force Update to Latest Structure
# This script ensures your database structure matches your code schema

set -e

echo "=================================================="
echo "  Database Schema Sync Tool"
echo "=================================================="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable is not set"
    exit 1
fi

echo "📊 Database: $(echo $DATABASE_URL | sed 's/postgresql:\/\/[^@]*@/postgresql:\/\/***:***@/')"
echo ""

# Option 1: Try normal push first
echo "🔄 Attempting normal schema sync..."
echo ""

if npm run db:push 2>&1 | tee /tmp/db-push.log; then
    echo ""
    echo "=================================================="
    echo "✅ Schema synced successfully!"
    echo "=================================================="
    echo ""
    exit 0
fi

# Check if there were conflicts/prompts
if grep -q "truncate" /tmp/db-push.log || grep -q "constraint" /tmp/db-push.log; then
    echo ""
    echo "⚠️  Normal sync encountered prompts or constraints"
    echo "🔄 Attempting force sync..."
    echo ""
    
    # Option 2: Force push
    if npm run db:push -- --force 2>&1; then
        echo ""
        echo "=================================================="
        echo "✅ Schema force synced successfully!"
        echo "=================================================="
        echo ""
        exit 0
    fi
fi

echo ""
echo "❌ Schema sync failed"
echo ""
echo "Manual steps:"
echo "1. Check the error messages above"
echo "2. Review your schema in shared/schema.ts"
echo "3. Try running: npm run db:push -- --force"
echo ""
exit 1
