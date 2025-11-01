#!/bin/bash
# Production Diagnostics Script
# This script checks if your app is properly connected to the database

set -e

echo "=================================================="
echo "  Production Diagnostics"
echo "=================================================="
echo ""

# Find containers
echo "Step 1: Finding Docker containers..."
echo ""
APP_CONTAINER=$(docker ps --format '{{.Names}}\t{{.Image}}' | grep -i 'mikrotik' | grep -i 'app' | awk '{print $1}' | head -1)
DB_CONTAINER=$(docker ps --format '{{.Names}}\t{{.Image}}' | grep -i postgres | awk '{print $1}' | head -1)

if [ -z "$APP_CONTAINER" ]; then
    echo "❌ Could not find app container!"
    docker ps
    exit 1
fi

if [ -z "$DB_CONTAINER" ]; then
    echo "❌ Could not find database container!"
    docker ps
    exit 1
fi

echo "✓ App container: $APP_CONTAINER"
echo "✓ DB container: $DB_CONTAINER"
echo ""

# Check app's DATABASE_URL
echo "Step 2: Checking app's DATABASE_URL environment variable..."
echo ""
APP_DB_URL=$(docker exec "$APP_CONTAINER" sh -c 'echo $DATABASE_URL' 2>/dev/null || echo "NOT SET")

if [ "$APP_DB_URL" = "NOT SET" ] || [ -z "$APP_DB_URL" ]; then
    echo "❌ DATABASE_URL is NOT set in app container!"
    echo ""
    echo "Your app cannot connect to the database!"
    echo ""
    echo "Fix: Set DATABASE_URL environment variable in your docker-compose.yml or container config"
    echo "Example:"
    echo "  DATABASE_URL=postgresql://mikrotik_user:PASSWORD@mikrotik-monitor-db:5432/mikrotik_monitor"
    echo ""
    exit 1
fi

# Mask password in output
MASKED_URL=$(echo "$APP_DB_URL" | sed -E 's/(postgresql:\/\/[^:]+:)[^@]+(@)/\1***\2/')
echo "✓ DATABASE_URL is set: $MASKED_URL"
echo ""

# Test database connection from app container
echo "Step 3: Testing database connection from app container..."
echo ""
if docker exec "$APP_CONTAINER" sh -c "psql \"$DATABASE_URL\" -c 'SELECT 1;'" > /dev/null 2>&1; then
    echo "✓ App can connect to database"
else
    echo "❌ App CANNOT connect to database!"
    echo ""
    echo "Possible issues:"
    echo "  1. Wrong DATABASE_URL"
    echo "  2. Database container not accessible from app"
    echo "  3. Wrong credentials"
    echo ""
    exit 1
fi
echo ""

# Check if users table exists
echo "Step 4: Checking if users table exists in database..."
echo ""
TABLE_EXISTS=$(docker exec -i "$DB_CONTAINER" psql -U mikrotik_user -d mikrotik_monitor -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users');" | tr -d ' ' 2>/dev/null || echo "error")

if [ "$TABLE_EXISTS" = "t" ]; then
    echo "✓ Users table exists"
else
    echo "❌ Users table does NOT exist!"
    echo ""
    echo "Your database schema is not created!"
    echo "Run: docker exec -it $APP_CONTAINER npm run db:push -- --force"
    echo ""
    exit 1
fi
echo ""

# Check if admin user exists
echo "Step 5: Checking if admin user exists..."
echo ""
docker exec -i "$DB_CONTAINER" psql -U mikrotik_user -d mikrotik_monitor << 'EOF'
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN '✓ Admin user EXISTS in database'
        ELSE '❌ Admin user NOT FOUND in database'
    END as status,
    COUNT(*) as count
FROM users 
WHERE id = 'super-admin-001';

-- Show admin user details if exists
SELECT id, username, email, role, enabled, must_change_password
FROM users 
WHERE id = 'super-admin-001';
EOF
echo ""

# Check app logs for errors
echo "Step 6: Checking app logs for database errors..."
echo ""
echo "Recent app logs (last 20 lines):"
echo "-----------------------------------"
docker logs "$APP_CONTAINER" --tail 20 2>&1 | grep -i -E "error|database|auth|login|fail" || echo "No errors found in recent logs"
echo "-----------------------------------"
echo ""

echo "=================================================="
echo "  Diagnostic Summary"
echo "=================================================="
echo ""
echo "App Container: $APP_CONTAINER"
echo "DB Container: $DB_CONTAINER"
echo "DATABASE_URL: $MASKED_URL"
echo ""
echo "Next steps:"
echo "1. If admin user doesn't exist, run: ./scripts/setup-production.sh"
echo "2. If DATABASE_URL is wrong, update your docker-compose.yml and restart"
echo "3. If users table doesn't exist, run: docker exec -it $APP_CONTAINER npm run db:push -- --force"
echo ""
