# Production Login Fix Guide

Your production app at **http://203.175.11.12:5000** is failing authentication. Here's how to fix it.

## 🔍 Problem

The app can't login because:
1. The `users` table might not exist in production database
2. The database schema might be out of sync
3. The auto-creation of admin user might be failing

## ✅ Solution

You need to run these commands **on your production server** at 203.175.11.12

### Step 1: SSH into Production Server

```bash
ssh your-user@203.175.11.12
```

### Step 2: Check if Database Tables Exist

```bash
# Set the database URL
export DATABASE_URL='postgresql://mikrotik_user:dz0OImAmBHV0xyz1BbwR5JM386UTga9R@postgres:5432/mikrotik_monitor'

# Check if users table exists
docker exec -i <postgres_container_name> psql -U mikrotik_user -d mikrotik_monitor -c "\dt"
```

Replace `<postgres_container_name>` with your actual postgres container name (find it with `docker ps`).

### Step 3: Create Database Schema in Production

If the tables don't exist, you need to create them. There are two ways:

#### Option A: Run Drizzle Push in Production App Container

```bash
# Find your app container
docker ps

# Execute drizzle push inside the app container
docker exec -it <your_app_container> npm run db:push -- --force
```

#### Option B: Copy Schema from Replit and Import

On your **Replit** (development environment):

```bash
# 1. Export just the schema (no data)
pg_dump "$DATABASE_URL" --schema-only --no-owner --no-acl -f /tmp/schema.sql

# 2. View the file to copy it
cat /tmp/schema.sql
```

Then on your **production server**:

```bash
# Save the schema to a file
cat > /tmp/schema.sql << 'EOF'
# (paste the schema SQL here)
EOF

# Import the schema
docker exec -i <postgres_container> psql -U mikrotik_user -d mikrotik_monitor < /tmp/schema.sql
```

### Step 4: Create Admin User Manually

Once the schema exists, create the admin user:

```bash
docker exec -i <postgres_container> psql -U mikrotik_user -d mikrotik_monitor << 'EOF'
DELETE FROM users WHERE id = 'super-admin-001';
INSERT INTO users (
    id, username, email, first_name, last_name,
    role, enabled, password_hash, must_change_password,
    created_at, updated_at
) VALUES (
    'super-admin-001', 'admin', 'admin@localhost',
    'Super', 'Admin', 'admin', true,
    '$2b$10$rFZKcVlQ0aL5LZxCEJ0sYeXVKZHkN0xGKqGKqGKqGKqGKqGKqGKq',
    true, NOW(), NOW()
);
SELECT 'Admin created!' as status, username, role FROM users WHERE id = 'super-admin-001';
EOF
```

### Step 5: Restart Production App

```bash
docker restart <your_app_container>
```

### Step 6: Try Login Again

Go to http://203.175.11.12:5000/login
- Username: `admin`
- Password: `admin`

---

## 🚀 Easier Method: Use Migration Scripts

If you want to copy **everything** from Replit development to production:

### On Replit:

```bash
# Export development database
./scripts/export-dev-db.sh
```

This creates a file like `backups/dev_database_20250101_120000.dump`

### Copy File to Production Server:

```bash
# From your local machine (not Replit)
scp backups/dev_database_*.dump your-user@203.175.11.12:/tmp/
```

### On Production Server:

```bash
# Stop the app
docker stop <your_app_container>

# Clear production database and import
docker exec -i <postgres_container> pg_restore -U mikrotik_user -d mikrotik_monitor --clean --if-exists < /tmp/dev_database_*.dump

# Start the app
docker start <your_app_container>
```

---

## 📋 Quick Diagnostics

To check what's wrong, run these on production server:

### Check if app is running:
```bash
docker ps | grep mikrotik
```

### Check app logs for errors:
```bash
docker logs <your_app_container> --tail 50
```

### Check database connection:
```bash
docker exec -i <postgres_container> psql -U mikrotik_user -d mikrotik_monitor -c "SELECT version();"
```

### Check if users table exists:
```bash
docker exec -i <postgres_container> psql -U mikrotik_user -d mikrotik_monitor -c "\d users"
```

---

## ⚠️ Common Issues

### Issue 1: "relation users does not exist"
**Solution:** Run Step 3 to create the database schema

### Issue 2: "password authentication failed"
**Solution:** Check DATABASE_URL has correct password

### Issue 3: "could not connect to server"
**Solution:** Make sure postgres container is running: `docker ps`

---

## 🎯 Summary

The most likely issue is that your production database doesn't have the schema (tables) created yet. 

**Quickest fix:**
1. SSH into production server
2. Find your postgres container: `docker ps`
3. Create admin user with SQL command from Step 4
4. If that fails with "table doesn't exist", create schema first (Step 3)

Need help? Check the app logs with: `docker logs <app_container>`
