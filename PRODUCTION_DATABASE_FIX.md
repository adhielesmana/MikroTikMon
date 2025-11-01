# Production Database Connection Fix

## Problem
The app was using `@neondatabase/serverless` (designed for Neon cloud with WebSocket) on a local PostgreSQL container, causing connection failures.

## Solution
Updated `server/db.ts` to auto-detect the environment and use:
- **Neon serverless driver** (WebSocket) for Neon cloud (Replit dev)
- **Standard pg driver** (TCP) for local PostgreSQL (production server)

Detection logic: Checks if DATABASE_URL contains "neon.tech" or ".pooler.supabase.com"

## Deploy to Production

### Step 1: Commit and Push
```bash
git add server/db.ts package.json package-lock.json
git commit -m "Fix: Auto-detect PostgreSQL driver (Neon vs local)"
git push origin main
```

### Step 2: On Production Server (203.175.11.12)
```bash
cd ~/MikroTikMon
git pull origin main
./deploy.sh
```

### Step 3: Verify Database Connection
```bash
# Wait 30 seconds for containers to start, then:
docker logs mikrotik-monitor-app --tail 20 | grep "\[DB\]"
```

**Expected output:**
```
[DB] Using standard pg driver (local PostgreSQL)
```

### Step 4: Test Database Connection
```bash
docker exec mikrotik-monitor-app node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT NOW()')
  .then((res) => console.log('✅ SUCCESS! Time:', res.rows[0].now))
  .catch((e) => console.log('❌ FAILED:', e.message));
"
```

### Step 5: Run Full Diagnostic
```bash
./scripts/diagnose-login.sh
```

**Should now show:**
- ✅ [PASS] App CAN connect to database
- ✅ Admin user exists

### Step 6: Test Login
```bash
curl -X POST http://localhost:5000/api/auth/local/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}' \
  -v
```

**Expected:** HTTP 200 with Set-Cookie header

---

## Technical Details

**Before (broken):**
- Used `@neondatabase/serverless` everywhere
- Required WebSocket connection (Neon cloud only)
- Failed on local PostgreSQL: "All attempts to open a WebSocket failed"

**After (fixed):**
- Auto-detects environment from DATABASE_URL
- Neon cloud → `@neondatabase/serverless` (WebSocket)
- Local PostgreSQL → `pg` (standard TCP)
- Works on both Replit dev and production server

---

**Last Updated:** November 1, 2025
