#!/bin/bash
# Production Setup Script
# Run this on your production server at 203.175.11.12

echo "=================================================="
echo "  MikroTik Monitor - Production Setup"
echo "=================================================="
echo ""

# Database connection
DB_URL="postgresql://mikrotik_user:dz0OImAmBHV0xyz1BbwR5JM386UTga9R@postgres:5432/mikrotik_monitor"

echo "Step 1: Finding Docker containers..."
echo ""
docker ps
echo ""

echo "Step 2: Checking if users table exists..."
echo ""

# Find postgres container (usually named postgres or has postgres in the name)
POSTGRES_CONTAINER=$(docker ps --format '{{.Names}}' | grep -i postgres | head -1)

if [ -z "$POSTGRES_CONTAINER" ]; then
    echo "❌ Could not find postgres container!"
    echo "   Please run: docker ps"
    echo "   Then manually set: POSTGRES_CONTAINER=<your_container_name>"
    exit 1
fi

echo "✓ Found postgres container: $POSTGRES_CONTAINER"
echo ""

# Check if users table exists
TABLE_CHECK=$(docker exec -i "$POSTGRES_CONTAINER" psql -U mikrotik_user -d mikrotik_monitor -t -c "SELECT to_regclass('public.users');" 2>&1)

if [[ "$TABLE_CHECK" == *"null"* ]] || [[ "$TABLE_CHECK" == *"does not exist"* ]]; then
    echo "⚠️  Users table does not exist!"
    echo "   You need to create the database schema first."
    echo ""
    echo "   Options:"
    echo "   A) Copy schema from development (recommended)"
    echo "   B) Run migrations in your app container"
    echo ""
    exit 1
fi

echo "✓ Users table exists!"
echo ""

echo "Step 3: Creating admin user..."
echo ""

docker exec -i "$POSTGRES_CONTAINER" psql -U mikrotik_user -d mikrotik_monitor << 'EOF'
-- Delete existing admin if present
DELETE FROM users WHERE id = 'super-admin-001';

-- Create admin user (password: "admin")
INSERT INTO users (
    id, username, email, first_name, last_name,
    role, enabled, password_hash, must_change_password,
    created_at, updated_at
) VALUES (
    'super-admin-001', 'admin', 'admin@localhost',
    'Super', 'Admin', 'admin', true,
    '$2b$10$cMvOUlC.MTj7ynM.j/JyMu4IfHEsTjHYTTJBNAmTklFZ9wxTUJP1O',
    true, NOW(), NOW()
);

-- Verify
SELECT 'SUCCESS!' as status, id, username, email, role, enabled
FROM users WHERE id = 'super-admin-001';
EOF

echo ""
echo "=================================================="
echo "✅ Setup Complete!"
echo "=================================================="
echo ""
echo "Login at: http://203.175.11.12:5000/login"
echo "Username: admin"
echo "Password: admin"
echo ""
echo "⚠️  You will be forced to change password on first login"
echo ""
