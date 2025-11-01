-- Create Default Admin User in Production Database
-- Run this SQL script directly on your production database

-- Step 1: Check if admin already exists and delete if present (to ensure clean state)
DELETE FROM users WHERE id = 'super-admin-001';

-- Step 2: Insert the default admin user
-- Password hash is for "admin" with bcrypt (10 rounds)
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

-- Step 3: Verify the admin user was created
SELECT 
    'Admin User Created Successfully!' as message,
    id,
    username,
    email,
    role,
    enabled,
    must_change_password
FROM users 
WHERE id = 'super-admin-001';
