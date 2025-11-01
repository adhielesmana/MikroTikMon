# Deploy Password Change Redirect Fix

## What Was Fixed
The login flow now properly redirects users to `/change-password` when they must change their password (first-time login for admin and invited users).

## Changes Made
1. **server/db.ts** - Auto-detect database driver (Neon vs local PostgreSQL)
2. **client/src/pages/Login.tsx** - Check `mustChangePassword` in login response and redirect to change password page
3. **replit.md** - Updated documentation with recent fixes

## Deploy to Production Server

### Step 1: Commit Changes (In Development)
```bash
git add .
git commit -m "Fix: Password change redirect + PostgreSQL driver auto-detection"
git push origin main
```

### Step 2: On Production Server (203.175.11.12)
```bash
cd ~/MikroTikMon

# Pull latest code
git pull origin main

# Rebuild and restart containers
docker compose down
docker compose up -d --build

# Wait for containers to start
sleep 30
```

### Step 3: Verify Database Driver
```bash
# Should show: [DB] Using standard pg driver (local PostgreSQL)
docker logs mikrotik-monitor-app --tail 20 | grep "\[DB\]"
```

### Step 4: Test Login Flow
```bash
# Clear browser cache or use incognito mode
# Go to: http://203.175.11.12:5000/login

# Login with: admin / admin
# You should be redirected to: /change-password
# Change your password
# Then you'll be redirected to: / (dashboard)
```

## Testing the Fix

### Test 1: Database Connection
```bash
docker exec mikrotik-monitor-app node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT NOW()')
  .then((res) => console.log('✅ SUCCESS! Time:', res.rows[0].now))
  .catch((e) => console.log('❌ FAILED:', e.message));
"
```

**Expected:** `✅ SUCCESS! Time: 2025-11-01...`

### Test 2: Login API
```bash
curl -X POST http://localhost:5000/api/auth/local/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}' \
  -c /tmp/cookies.txt \
  -v
```

**Expected:**
```json
{
  "message": "Login successful",
  "mustChangePassword": true,
  "user": {
    "id": "super-admin-001",
    "email": "admin@local",
    "firstName": "Admin",
    "lastName": "User"
  }
}
```

### Test 3: Frontend Redirect
1. Open browser: `http://203.175.11.12:5000/login`
2. Login with `admin` / `admin`
3. **Expected:** Redirected to `/change-password`
4. Change password to something secure (min 8 chars)
5. **Expected:** Redirected to `/` (dashboard)
6. Logout and login again with new credentials
7. **Expected:** Redirected directly to `/` (no password change)

## Troubleshooting

### If login fails with "Authentication error"
```bash
# Check app logs
docker logs mikrotik-monitor-app --tail 50 | grep -i "error\|auth"

# Verify admin user exists
docker exec -it mikrotik-monitor-db psql -U mikrotik_user -d mikrotik_monitor \
  -c "SELECT id, username, must_change_password FROM users WHERE id = 'super-admin-001';"
```

### If not redirected to change password
1. Check browser console (F12) for errors
2. Verify the login response includes `mustChangePassword: true`
3. Clear browser cache and try again

### If containers won't start
```bash
# Check container logs
docker logs mikrotik-monitor-app
docker logs mikrotik-monitor-db

# Verify DATABASE_URL
docker exec mikrotik-monitor-app sh -c 'echo $DATABASE_URL'
# Should show: @mikrotik-monitor-db:5432
```

---

## Summary

**Before:**
- ❌ Login always redirected to dashboard, even for first-time admin
- ❌ WebSocket connection error on local PostgreSQL
- ❌ Password change requirement ignored

**After:**
- ✅ First-time admin login redirects to `/change-password`
- ✅ Auto-detects PostgreSQL driver (Neon cloud vs local)
- ✅ Password must be changed before accessing dashboard
- ✅ Works on both Replit dev and production server

---

**Last Updated:** November 1, 2025
