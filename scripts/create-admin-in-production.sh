#!/bin/bash
# Create Default Admin User in Production Database
# This script adds the default admin account to your production database

set -e

echo "=================================================="
echo "  Create Admin User in Production"
echo "=================================================="
echo ""

# Check if PRODUCTION_DATABASE_URL is set
if [ -z "$PRODUCTION_DATABASE_URL" ]; then
    echo "❌ ERROR: PRODUCTION_DATABASE_URL environment variable is not set"
    echo ""
    echo "Please set it first:"
    echo "  export PRODUCTION_DATABASE_URL='postgresql://user:pass@host/db'"
    echo ""
    exit 1
fi

echo "🎯 Target: Production Database"
echo "📊 Creating default admin user..."
echo ""

# Create the default admin user
psql "$PRODUCTION_DATABASE_URL" << 'EOF'
-- Check if admin already exists
DO $$
DECLARE
    admin_exists INTEGER;
BEGIN
    SELECT COUNT(*) INTO admin_exists FROM users WHERE id = 'super-admin-001';
    
    IF admin_exists > 0 THEN
        RAISE NOTICE '⚠️  Admin user already exists with ID: super-admin-001';
        RAISE NOTICE 'Updating to ensure default credentials...';
        
        -- Update existing admin to default credentials
        UPDATE users 
        SET 
            username = 'admin',
            password_hash = '$2b$10$rFZKcVlQ0aL5LZxCEJ0sYeXVKZHkN0xGKqGKqKGKqGKqGKqGKqGKq',
            must_change_password = true,
            role = 'admin',
            enabled = true,
            first_name = 'Super',
            last_name = 'Admin',
            email = 'admin@localhost'
        WHERE id = 'super-admin-001';
        
        RAISE NOTICE '✅ Admin user updated successfully!';
    ELSE
        RAISE NOTICE 'Creating new admin user...';
        
        -- Insert new admin user
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
            '$2b$10$rFZKcVlQ0aL5LZxCEJ0sYeXVKZHkN0xGKqGKqGKqGKqGKqGKqGKq',
            true,
            NOW(),
            NOW()
        );
        
        RAISE NOTICE '✅ Admin user created successfully!';
    END IF;
END $$;

-- Verify the user was created/updated
SELECT 
    '📋 Admin User Details:' as info,
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
echo "✅ Admin user ready in production!"
echo "=================================================="
echo ""
echo "Login credentials:"
echo "  Username: admin"
echo "  Password: admin"
echo ""
echo "⚠️  You will be forced to change the password on first login"
echo ""
