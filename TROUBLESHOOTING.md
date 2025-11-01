# Docker Container Restart Loop - Troubleshooting Guide

## Quick Diagnosis

If your container is stuck in a restart loop, run these commands on your server:

### 1. Check Container Logs
```bash
# View app container logs
docker logs mikrotik-monitor-app --tail 100

# View database logs
docker logs mikrotik-monitor-db --tail 50

# Follow logs in real-time
docker logs -f mikrotik-monitor-app
```

### 2. Check Container Status
```bash
docker ps -a | grep mikrotik
```

---

## Common Issues & Solutions

### Issue 1: Missing Environment Variables

**Symptoms:**
```
Error: PGDATABASE not set - run setup.sh first
```

**Solution:**
```bash
./setup.sh  # Re-run setup
./deploy.sh up
```

---

### Issue 2: Build Failed

**Symptoms:**
```
Error: Cannot find module '@shared/schema'
Error: Cannot find module './dist/index.js'
```

**Solution:**
```bash
# Clean rebuild
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

---

### Issue 3: Database Connection Failed

**Symptoms:**
```
Error: connect ECONNREFUSED postgres:5432
Error: password authentication failed
```

**Solution:**
```bash
# Check database is running
docker logs mikrotik-monitor-db

# Verify environment variables
cat .env | grep PG

# Restart containers in order
docker-compose down
docker-compose up -d postgres
sleep 10
docker-compose up -d app
```

---

### Issue 4: Port Already in Use

**Symptoms:**
```
Error: bind: address already in use
```

**Solution:**
```bash
# For app port (5000)
# Edit .env:
APP_PORT=8080

# Restart
./deploy.sh restart
```

---

### Issue 5: Node Module Issues

**Symptoms:**
```
Error: Cannot find module 'express'
Error loading shared library
```

**Solution:**
```bash
# Rebuild without cache
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

---

## Step-by-Step Debugging

### Step 1: Stop Everything
```bash
docker-compose down
```

### Step 2: Check Your .env File
```bash
cat .env
```

Verify these are set:
- ✅ PGDATABASE
- ✅ PGUSER
- ✅ PGPASSWORD
- ✅ SESSION_SECRET

### Step 3: Start Database Only
```bash
docker-compose up -d postgres
```

Wait 10 seconds, then check:
```bash
docker logs mikrotik-monitor-db
```

Should see: `database system is ready to accept connections`

### Step 4: Start Application
```bash
docker-compose up app
```

(Note: No `-d` flag so you see logs in real-time)

Watch for errors in the output.

### Step 5: If Still Failing

#### Option A: Shell into Container
```bash
# Start container without running the app
docker run -it --rm mikrotik-monitor-app sh

# Inside container, check:
ls -la /app/dist/
ls -la /app/shared/
node dist/index.js  # Try to run manually
```

#### Option B: Check Build Artifacts
```bash
# After build, verify files exist
docker run --rm mikrotik-monitor-app ls -la /app/dist/
docker run --rm mikrotik-monitor-app ls -la /app/dist/public/
docker run --rm mikrotik-monitor-app ls -la /app/shared/
```

---

## Get Detailed Error Info

### Real-time Container Inspection
```bash
# Watch container events
docker events &

# In another terminal
docker-compose up app
```

### Export Logs
```bash
docker logs mikrotik-monitor-app > app-error.log 2>&1
docker logs mikrotik-monitor-db > db-error.log 2>&1

# Review logs
less app-error.log
```

---

## Nuclear Option: Complete Reset

If nothing works, start fresh:

```bash
# WARNING: This deletes all data!

# Stop and remove everything
docker-compose down -v

# Remove images
docker rmi mikrotik-monitor-app
docker rmi postgres:16-alpine

# Clean build cache
docker builder prune -af

# Start fresh
./setup.sh
./deploy.sh up
```

---

## Known Issues

### 1. Shared Directory Not Found
If you see `Error: Cannot find module '@shared/schema'`:

**Check Dockerfile:**
```dockerfile
# Should have this line:
COPY --chown=nodejs:nodejs shared ./shared
```

### 2. dist/public Not Found
If you see `Could not find the build directory: dist/public`:

**Check build output:**
```bash
docker run --rm mikrotik-monitor-app ls -la /app/dist/
```

Should show:
```
drwxr-xr-x    2 nodejs   nodejs        4096 Nov  1 01:00 public
-rw-r--r--    1 nodejs   nodejs      123456 Nov  1 01:00 index.js
```

### 3. Permission Errors
If you see permission errors:

```bash
# Check ownership in container
docker run --rm mikrotik-monitor-app ls -la /app/

# Should be owned by nodejs:nodejs (uid 1001)
```

---

## Contact Support

If you've tried everything above and still have issues, please provide:

1. **Container Logs:**
   ```bash
   docker logs mikrotik-monitor-app > app.log 2>&1
   docker logs mikrotik-monitor-db > db.log 2>&1
   ```

2. **Environment Info:**
   ```bash
   docker --version
   docker-compose --version
   cat .env (remove sensitive data!)
   ```

3. **Container Status:**
   ```bash
   docker ps -a
   docker images
   ```

---

**Last Updated:** November 1, 2025
