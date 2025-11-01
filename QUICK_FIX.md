# Quick Fix Guide for Production Login Issue

## 🎯 Problem
Your production app couldn't connect to the database because the DATABASE_URL was using the wrong hostname.

## ✅ What Was Fixed

1. **docker-compose.yml** - Changed database service name from `postgres` to `mikrotik-monitor-db`
2. **docker-compose.yml** - Updated DATABASE_URL to use `@mikrotik-monitor-db:5432`
3. **.env.example** - Updated with correct hostnames
4. **deploy.sh** - Added two new commands:
   - `./deploy.sh fix-db` - Automatically fixes DATABASE_URL in your .env
   - `./deploy.sh setup-admin` - Creates admin user in database

## 🚀 How to Deploy the Fix

### Step 1: Commit to GitHub

```bash
git add docker-compose.yml .env.example deploy.sh scripts/
git commit -m "Fix database connection - change hostname to mikrotik-monitor-db"
git push origin main
```

### Step 2: On Production Server (203.175.11.12)

```bash
# Pull latest code
cd /path/to/your/app
git pull origin main

# Fix the database connection (automatically updates .env)
./deploy.sh fix-db

# This will:
# - Check your .env file
# - Replace @postgres:5432 with @mikrotik-monitor-db:5432
# - Restart containers
# - Show success message
```

### Step 3: Create Admin User

```bash
# Create the admin user
./deploy.sh setup-admin
```

### Step 4: Login!

Visit: **http://203.175.11.12:5000/login**
- Username: `admin`
- Password: `admin`

You'll be forced to change the password on first login.

---

## 📋 Alternative: Manual Steps

If `./deploy.sh fix-db` doesn't work, do it manually:

```bash
# Stop containers
./deploy.sh stop

# Edit .env file
nano .env

# Change this line:
# DATABASE_URL=postgresql://mikrotik_user:PASSWORD@postgres:5432/mikrotik_monitor
# To:
# DATABASE_URL=postgresql://mikrotik_user:PASSWORD@mikrotik-monitor-db:5432/mikrotik_monitor

# Also change:
# PGHOST=postgres
# To:
# PGHOST=mikrotik-monitor-db

# Save and restart
./deploy.sh start

# Create admin
./deploy.sh setup-admin
```

---

## 🔍 Verify It's Working

```bash
# Check if containers are healthy
./deploy.sh status

# You should see:
# mikrotik-monitor-app   Up (healthy)
# mikrotik-monitor-db    Up (healthy)

# Check app logs
./deploy.sh logs
```

---

## 🎯 Summary

**The Issue:**
```
DATABASE_URL used @postgres:5432 but container is named mikrotik-monitor-db
```

**The Fix:**
```
DATABASE_URL now uses @mikrotik-monitor-db:5432 (matches container name)
```

**New Commands:**
```bash
./deploy.sh fix-db        # Fix database connection
./deploy.sh setup-admin   # Create admin user
```

That's it! Your login should work now! 🚀
