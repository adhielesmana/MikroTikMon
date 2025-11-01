# Production Login Troubleshooting Guide

## 🔍 Run Complete Diagnostics

On your production server (203.175.11.12), run this command:

```bash
./scripts/diagnose-login.sh
```

This will check:
- ✅ Container status (app and database)
- ✅ DATABASE_URL configuration
- ✅ Database connection from app
- ✅ Users table exists
- ✅ Admin user exists
- ✅ Password hash format
- ✅ App logs for errors
- ✅ Session table

## 📋 Manual Diagnostic Steps

If you can't run the script, check these manually:

### 1. Check Container Status

```bash
docker ps

# Look for:
# - mikrotik-monitor-app (should be Up)
# - mikrotik-monitor-db (should be Up and healthy)
```

### 2. Check App's DATABASE_URL

```bash
docker exec mikrotik-monitor-app sh -c 'echo $DATABASE_URL'

# Should show:
# postgresql://mikrotik_user:PASSWORD@mikrotik-monitor-db:5432/mikrotik_monitor
#                                      ^^^^^^^^^^^^^^^^^^^^
#                                      Must match your DB container name!
```

### 3. Test Database Connection

```bash
docker exec mikrotik-monitor-app psql "$DATABASE_URL" -c "SELECT 1;"

# If this fails, DATABASE_URL is wrong or database is not accessible
```

### 4. Check if Users Table Exists

```bash
docker exec -it mikrotik-monitor-db psql -U mikrotik_user -d mikrotik_monitor -c "\dt"

# Should show: users, routers, alerts, etc.
```

If NO tables:
```bash
docker exec -it mikrotik-monitor-app npm run db:push -- --force
```

### 5. Check if Admin User Exists

```bash
docker exec -it mikrotik-monitor-db psql -U mikrotik_user -d mikrotik_monitor << 'EOF'
SELECT id, username, email, role, enabled, 
       CASE WHEN password_hash IS NOT NULL THEN 'YES' ELSE 'NO' END as has_password
FROM users 
WHERE id = 'super-admin-001';
EOF
```

Expected output:
```
id               | username | email          | role  | enabled | has_password
-----------------+----------+----------------+-------+---------+--------------
super-admin-001  | admin    | admin@localhost| admin | t       | YES
```

If NO rows:
```bash
./scripts/setup-production.sh
```

### 6. Check App Logs During Login

Open two terminals:

**Terminal 1:** Watch logs
```bash
docker logs mikrotik-monitor-app -f
```

**Terminal 2:** Try to login
```bash
curl -X POST http://localhost:5000/api/auth/local/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}' \
  -v
```

Look for errors in Terminal 1.

### 7. Check .env File

```bash
cat .env | grep -E "DATABASE_URL|PGHOST"

# DATABASE_URL should have @mikrotik-monitor-db:5432
# PGHOST should be mikrotik-monitor-db
```

### 8. Check docker-compose.yml

```bash
grep -A 5 "DATABASE_URL" docker-compose.yml

# Should show:
# DATABASE_URL: postgresql://${PGUSER}:${PGPASSWORD}@mikrotik-monitor-db:5432/${PGDATABASE}
```

## 🔧 Common Fixes

### Issue: "Cannot connect to database"

**Fix:**
```bash
./deploy.sh fix-db
./deploy.sh restart
```

### Issue: "Users table does not exist"

**Fix:**
```bash
docker exec -it mikrotik-monitor-app npm run db:push -- --force
```

### Issue: "Admin user does not exist"

**Fix:**
```bash
./scripts/setup-production.sh
```

### Issue: "Wrong DATABASE_URL hostname"

**Check your .env:**
```bash
# WRONG:
DATABASE_URL=postgresql://user:pass@postgres:5432/db

# CORRECT:
DATABASE_URL=postgresql://user:pass@mikrotik-monitor-db:5432/db
```

**Fix:**
```bash
./deploy.sh fix-db
```

### Issue: "Login endpoint not responding"

**Check if app is running:**
```bash
curl http://localhost:5000/api/health
```

Should return: `{"status":"ok"}`

If not:
```bash
./deploy.sh restart
docker logs mikrotik-monitor-app --tail 50
```

## 🧪 Test Login with curl

```bash
# Test login
curl -X POST http://localhost:5000/api/auth/local/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}' \
  -c cookies.txt \
  -v

# If successful, you'll see:
# - HTTP 200 OK
# - Set-Cookie header

# Then test authenticated endpoint
curl http://localhost:5000/api/user \
  -b cookies.txt
```

## 🔍 View Full Logs

```bash
# App logs (all)
docker logs mikrotik-monitor-app

# App logs (last 100 lines)
docker logs mikrotik-monitor-app --tail 100

# App logs (follow/live)
docker logs mikrotik-monitor-app -f

# Database logs
docker logs mikrotik-monitor-db --tail 50

# Filter for errors
docker logs mikrotik-monitor-app 2>&1 | grep -i error
```

## 📊 Database Direct Check

```bash
# Connect to database
docker exec -it mikrotik-monitor-db psql -U mikrotik_user -d mikrotik_monitor

# Then run:
\dt              -- List tables
\d users         -- Show users table structure
SELECT * FROM users WHERE id = 'super-admin-001';
\q               -- Exit
```

## 🚨 Nuclear Option (Reset Everything)

**WARNING: This deletes ALL data!**

```bash
# Stop everything
./deploy.sh stop

# Remove volumes (deletes database!)
docker volume rm mikrotik-monitor_postgres_data

# Start fresh
./deploy.sh start

# Recreate schema and admin
docker exec -it mikrotik-monitor-app npm run db:push -- --force
./scripts/setup-production.sh
```

## 📞 Still Not Working?

1. Run the diagnostic script and share the output:
   ```bash
   ./scripts/diagnose-login.sh > diagnostic.txt
   cat diagnostic.txt
   ```

2. Share these logs:
   ```bash
   docker logs mikrotik-monitor-app --tail 100 > app-logs.txt
   cat .env | grep -v PASSWORD > env-check.txt
   ```

3. Try login in browser with F12 Console open and share any errors

---

**Last Updated:** November 1, 2025
