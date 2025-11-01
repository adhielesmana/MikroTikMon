#!/bin/bash
# Complete Login Diagnostics
# Run this on your production server to find login issues

set +e  # Don't exit on errors

echo "=================================================="
echo "  Login Diagnostics - Complete Check"
echo "=================================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_check() {
    echo -e "${BLUE}[CHECK]${NC} $1"
}

print_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

print_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Find containers
print_check "Finding Docker containers..."
APP_CONTAINER=$(docker ps --format '{{.Names}}\t{{.Image}}' | grep -i 'mikrotik.*app' | awk '{print $1}' | head -1)
DB_CONTAINER=$(docker ps --format '{{.Names}}\t{{.Image}}' | grep -i 'postgres\|mikrotik.*db' | awk '{print $1}' | head -1)

if [ -z "$APP_CONTAINER" ]; then
    print_fail "App container not found!"
    echo ""
    echo "Available containers:"
    docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
    exit 1
fi

if [ -z "$DB_CONTAINER" ]; then
    print_fail "Database container not found!"
    echo ""
    echo "Available containers:"
    docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
    exit 1
fi

print_pass "App: $APP_CONTAINER"
print_pass "DB:  $DB_CONTAINER"
echo ""

# Check 1: Container Status
print_check "Checking container health..."
APP_STATUS=$(docker inspect "$APP_CONTAINER" --format='{{.State.Health.Status}}' 2>/dev/null || echo "no-healthcheck")
DB_STATUS=$(docker inspect "$DB_CONTAINER" --format='{{.State.Health.Status}}' 2>/dev/null || echo "no-healthcheck")

if [ "$APP_STATUS" = "healthy" ] || [ "$APP_STATUS" = "no-healthcheck" ]; then
    print_pass "App container is running"
else
    print_fail "App container is $APP_STATUS"
fi

if [ "$DB_STATUS" = "healthy" ] || [ "$DB_STATUS" = "no-healthcheck" ]; then
    print_pass "Database container is running"
else
    print_fail "Database container is $DB_STATUS"
fi
echo ""

# Check 2: DATABASE_URL in app
print_check "Checking app's DATABASE_URL..."
APP_DB_URL=$(docker exec "$APP_CONTAINER" sh -c 'echo $DATABASE_URL' 2>/dev/null || echo "")

if [ -z "$APP_DB_URL" ]; then
    print_fail "DATABASE_URL is NOT set in app container!"
    echo ""
    echo "Your app cannot connect to database without DATABASE_URL"
    echo "Check your docker-compose.yml or .env file"
    exit 1
else
    MASKED_URL=$(echo "$APP_DB_URL" | sed -E 's/(postgresql:\/\/[^:]+:)[^@]+(@)/\1***\2/')
    print_pass "DATABASE_URL is set"
    echo "      → $MASKED_URL"
fi
echo ""

# Check 3: Parse DATABASE_URL
DB_HOST=$(echo "$APP_DB_URL" | sed -E 's/.*@([^:]+):.*/\1/')
DB_PORT=$(echo "$APP_DB_URL" | sed -E 's/.*:([0-9]+)\/.*/\1/')
DB_USER=$(echo "$APP_DB_URL" | sed -E 's/.*:\/\/([^:]+):.*/\1/')
DB_NAME=$(echo "$APP_DB_URL" | sed -E 's/.*\/([^?]*).*/\1/')

print_check "Database connection details:"
echo "      Host: $DB_HOST"
echo "      Port: $DB_PORT"
echo "      User: $DB_USER"
echo "      Database: $DB_NAME"
echo ""

# Check 4: Can app reach database?
print_check "Testing database connection from app..."
if docker exec "$APP_CONTAINER" sh -c "command -v psql" > /dev/null 2>&1; then
    if docker exec "$APP_CONTAINER" psql "$APP_DB_URL" -c "SELECT 1;" > /dev/null 2>&1; then
        print_pass "App CAN connect to database"
    else
        print_fail "App CANNOT connect to database!"
        echo ""
        echo "Possible issues:"
        echo "1. Wrong DATABASE_URL (host: $DB_HOST doesn't match container)"
        echo "2. Wrong credentials"
        echo "3. Database not accessible from app container"
        exit 1
    fi
else
    print_warn "psql not installed in app container, testing with Node.js instead..."
    TEST_RESULT=$(docker exec "$APP_CONTAINER" node -e "
        const { Pool } = require('@neondatabase/serverless');
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        pool.query('SELECT 1').then(() => { console.log('OK'); process.exit(0); }).catch((e) => { console.log('FAIL'); process.exit(1); });
    " 2>&1)
    
    if echo "$TEST_RESULT" | grep -q "OK"; then
        print_pass "App CAN connect to database (via Node.js)"
    else
        print_fail "App CANNOT connect to database!"
        echo "Error: $TEST_RESULT"
        exit 1
    fi
fi
echo ""

# Check 5: Does users table exist?
print_check "Checking if users table exists..."
TABLE_EXISTS=$(docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users');" 2>/dev/null | tr -d ' ')

if [ "$TABLE_EXISTS" = "t" ]; then
    print_pass "Users table exists"
else
    print_fail "Users table does NOT exist!"
    echo ""
    echo "Database schema is not created!"
    echo "Fix: docker exec -it $APP_CONTAINER npm run db:push -- --force"
    exit 1
fi
echo ""

# Check 6: Does admin user exist?
print_check "Checking if admin user exists..."
ADMIN_EXISTS=$(docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM users WHERE id = 'super-admin-001';" 2>/dev/null | tr -d ' ')

if [ "$ADMIN_EXISTS" = "1" ]; then
    print_pass "Admin user exists in database"
    
    # Get admin details
    echo ""
    echo "Admin user details:"
    docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" << 'EOF'
SELECT 
    '  ID: ' || id as detail,
    '  Username: ' || COALESCE(username, 'NULL') as username,
    '  Email: ' || COALESCE(email, 'NULL') as email,
    '  Role: ' || role as role,
    '  Enabled: ' || enabled as enabled,
    '  Has Password: ' || CASE WHEN password_hash IS NOT NULL THEN 'YES' ELSE 'NO' END as has_password,
    '  Must Change: ' || must_change_password as must_change
FROM users 
WHERE id = 'super-admin-001';
EOF
    
elif [ "$ADMIN_EXISTS" = "0" ]; then
    print_fail "Admin user does NOT exist!"
    echo ""
    echo "Fix: ./scripts/setup-production.sh"
    exit 1
else
    print_fail "Error checking admin user: $ADMIN_EXISTS"
    exit 1
fi
echo ""

# Check 7: Check password hash
print_check "Verifying password hash..."
HASH=$(docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT password_hash FROM users WHERE id = 'super-admin-001';" 2>/dev/null | tr -d ' ' | head -1)

if [ -n "$HASH" ]; then
    # Check if it's a bcrypt hash
    if echo "$HASH" | grep -q '^\$2[aby]\$'; then
        print_pass "Password hash format is correct (bcrypt)"
    else
        print_warn "Password hash format looks unusual: ${HASH:0:20}..."
    fi
else
    print_fail "Password hash is NULL or empty!"
    exit 1
fi
echo ""

# Check 8: App logs for errors
print_check "Checking app logs for authentication errors..."
echo ""
echo "Recent app logs (last 30 lines):"
echo "-----------------------------------"
docker logs "$APP_CONTAINER" --tail 30 2>&1 | grep -i -E "auth|login|database|error|password" || echo "No authentication-related logs found"
echo "-----------------------------------"
echo ""

# Check 9: Session table
print_check "Checking sessions table..."
SESSION_EXISTS=$(docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sessions');" 2>/dev/null | tr -d ' ')

if [ "$SESSION_EXISTS" = "t" ]; then
    print_pass "Sessions table exists"
else
    print_warn "Sessions table does NOT exist (might be created on first use)"
fi
echo ""

# Summary
echo "=================================================="
echo "  Diagnostic Summary"
echo "=================================================="
echo ""
echo "App Container:    $APP_CONTAINER"
echo "DB Container:     $DB_CONTAINER"
echo "Database Host:    $DB_HOST"
echo "Database Name:    $DB_NAME"
echo ""

# Recommendations
echo "Recommendations:"
echo ""

if [ "$TABLE_EXISTS" != "t" ]; then
    echo "1. ❌ Create database schema:"
    echo "   docker exec -it $APP_CONTAINER npm run db:push -- --force"
    echo ""
fi

if [ "$ADMIN_EXISTS" != "1" ]; then
    echo "2. ❌ Create admin user:"
    echo "   ./scripts/setup-production.sh"
    echo ""
fi

if [ "$DB_HOST" != "mikrotik-monitor-db" ] && [ "$DB_HOST" != "$DB_CONTAINER" ]; then
    echo "3. ⚠️  DATABASE_URL hostname ($DB_HOST) doesn't match container ($DB_CONTAINER)"
    echo "   This might cause connection issues!"
    echo "   Fix: ./deploy.sh fix-db"
    echo ""
fi

echo "If everything above looks good but login still fails:"
echo ""
echo "A. Try logging in and immediately check app logs:"
echo "   docker logs $APP_CONTAINER -f"
echo ""
echo "B. Test with curl:"
echo "   curl -X POST http://localhost:5000/api/auth/local/login \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"username\":\"admin\",\"password\":\"admin\"}' \\"
echo "     -v"
echo ""
echo "C. Check browser console for errors (F12 > Console)"
echo ""
