#!/bin/bash
# Production Database Setup Script
# This script sets up the admin user in your production database
# Run this on your production server after pulling from GitHub

set -e

echo "=================================================="
echo "  MikroTik Monitor - Production Setup"
echo "=================================================="
echo ""

# Configuration
DB_USER="mikrotik_user"
DB_NAME="mikrotik_monitor"
DB_HOST="postgres"  # Docker container name

echo "🔍 Finding PostgreSQL container..."
POSTGRES_CONTAINER=$(docker ps --format '{{.Names}}' | grep -i postgres | head -1)

if [ -z "$POSTGRES_CONTAINER" ]; then
    echo "❌ Error: Could not find postgres container!"
    echo ""
    echo "Available containers:"
    docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
    echo ""
    echo "Please set manually: export POSTGRES_CONTAINER=<your_container_name>"
    exit 1
fi

echo "✓ Found PostgreSQL container: $POSTGRES_CONTAINER"
echo ""

echo "📊 Checking database connection..."
if ! docker exec -i "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
    echo "❌ Error: Cannot connect to database!"
    echo "   Database: $DB_NAME"
    echo "   User: $DB_USER"
    echo "   Container: $POSTGRES_CONTAINER"
    exit 1
fi

echo "✓ Database connection successful"
echo ""

echo "🔍 Checking if users table exists..."
TABLE_EXISTS=$(docker exec -i "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users');" | tr -d ' ')

if [ "$TABLE_EXISTS" != "t" ]; then
    echo "⚠️  Users table does not exist!"
    echo ""
    echo "You need to create the database schema first."
    echo "Run: npm run db:push -- --force"
    echo "Or import schema from development database."
    echo ""
    exit 1
fi

echo "✓ Users table exists"
echo ""

echo "👤 Creating admin user..."
echo ""

docker exec -i "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" << 'EOF'
-- Check current admin status
DO $$
DECLARE
    admin_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO admin_count FROM users WHERE id = 'super-admin-001';
    
    IF admin_count > 0 THEN
        RAISE NOTICE 'Admin user already exists. Resetting to default credentials...';
        DELETE FROM users WHERE id = 'super-admin-001';
    ELSE
        RAISE NOTICE 'Creating new admin user...';
    END IF;
END $$;

-- Create admin user with default credentials
-- Username: admin
-- Password: admin (bcrypt hash)
INSERT INTO users (
    id,
    username,
    email,
    first_name,
    last_name,
    role,
    enabled,
    password_hash,
    must_change_password,
    created_at,
    updated_at
) VALUES (
    'super-admin-001',
    'admin',
    'admin@localhost',
    'Super',
    'Admin',
    'admin',
    true,
    '$2b$10$cMvOUlC.MTj7ynM.j/JyMu4IfHEsTjHYTTJBNAmTklFZ9wxTUJP1O',
    true,
    NOW(),
    NOW()
);

-- Verify creation
SELECT 
    '✓ Admin user created successfully!' as message,
    id,
    username,
    email,
    role,
    enabled,
    must_change_password
FROM users 
WHERE id = 'super-admin-001';
EOF

echo ""
echo "=================================================="
echo "✅ Production Setup Complete!"
echo "=================================================="
echo ""
echo "Login credentials:"
echo "  URL: http://YOUR_SERVER_IP:5000/login"
echo "  Username: admin"
echo "  Password: admin"
echo ""
echo "⚠️  IMPORTANT: You MUST change the password on first login!"
echo ""
