# Fix: Attached Assets Permission Error

## 🐛 Problem

The application was failing with this error:
```
400: {"message":"Failed to download logo: EACCES: permission denied, mkdir '/app/attached_assets'"}
```

**Root Cause:** The Docker container runs as a non-root user (`nodejs`) and didn't have permission to create the `attached_assets` directory at runtime.

---

## ✅ Solution Applied

### 1. **Dockerfile Updated**
Created the `attached_assets` directory during build with proper ownership:

```dockerfile
# Create directories for runtime assets and ensure proper ownership
RUN mkdir -p /app/attached_assets /app/logs && \
    chown -R nodejs:nodejs /app/attached_assets /app/logs

# Switch to non-root user
USER nodejs
```

### 2. **docker-compose.yml Updated**
Added volume mount for persistent storage:

```yaml
volumes:
  # Optional: Mount for logs
  - ./logs:/app/logs
  # Mount for uploaded assets (custom logos, etc.)
  - ./attached_assets:/app/attached_assets
```

### 3. **deploy.sh Updated**
Automatically creates required directories on host:

```bash
# Create required directories if they don't exist
print_info "Creating required directories..."
mkdir -p logs attached_assets
print_success "Directories ready"
```

---

## 🚀 How to Apply the Fix

### Step 1: Rebuild the Docker Image

```bash
# Stop running containers
./deploy.sh stop

# Rebuild with the updated Dockerfile
./deploy.sh up --with-nginx
```

The `deploy.sh` script will:
1. Create the `attached_assets` directory on your host
2. Rebuild the Docker image with proper permissions
3. Mount the directory as a volume
4. Start the containers

### Step 2: Verify the Fix

After deployment completes, access your application:
```
https://mon.maxnetplus.id
```

Try uploading a custom logo - it should now work without permission errors!

---

## 📁 Directory Structure (After Fix)

```
mikrotik-monitor/
├── attached_assets/     ← Created by deploy.sh (persists across restarts)
├── logs/                ← Created by deploy.sh (persists across restarts)
├── docker-compose.yml   ← Updated with volume mounts
├── Dockerfile           ← Updated with directory creation
└── deploy.sh           ← Updated to create directories
```

---

## 🔒 Security Benefits

1. **Non-root container** - App still runs as `nodejs` user (secure)
2. **Proper ownership** - Directories owned by `nodejs:nodejs` inside container
3. **Volume persistence** - Uploaded logos survive container restarts
4. **Host isolation** - Files stored on host, mounted into container

---

## 🎯 What Changed

| Component | Before | After |
|-----------|--------|-------|
| **Dockerfile** | No directory creation | Creates `/app/attached_assets` with ownership |
| **docker-compose.yml** | No volume mount | Mounts `./attached_assets` volume |
| **deploy.sh** | No directory creation | Creates `attached_assets` on host |
| **Permissions** | Runtime error | ✅ Works correctly |

---

## 📝 Testing the Fix

### Test 1: Upload Custom Logo

1. Go to Settings
2. Upload a custom logo
3. Should succeed without errors
4. Logo should be saved to `./attached_assets/` on host

### Test 2: Restart Container

```bash
./deploy.sh restart
```

Your custom logo should persist after restart (thanks to volume mount).

### Test 3: Complete Rebuild

```bash
./deploy.sh stop
./deploy.sh up --with-nginx
```

Custom logos should still be there (persisted on host).

---

## 🐳 Inside the Container

If you need to verify permissions inside the container:

```bash
# Open shell in container
./deploy.sh shell

# Check directory permissions
ls -la /app/attached_assets
# Should show: drwxr-xr-x nodejs nodejs

# Check file ownership
id
# Should show: uid=1001(nodejs) gid=1001(nodejs)
```

---

## ✨ Additional Benefits

1. **Logs persist** - Both `logs/` and `attached_assets/` survive container recreation
2. **Easy backup** - Just backup the `attached_assets/` directory
3. **Easy restore** - Copy `attached_assets/` to new deployment
4. **Version control** - Add `attached_assets/` to `.gitignore` (already done)

---

## 🆘 Troubleshooting

### Still getting permission errors?

```bash
# On host, check directory permissions
ls -la attached_assets/
# Should be readable/writable

# If needed, fix permissions on host
chmod 755 attached_assets/

# Rebuild and restart
./deploy.sh stop
./deploy.sh up --with-nginx
```

### Directory not being created?

```bash
# Manually create it
mkdir -p attached_assets logs

# Then deploy
./deploy.sh up --with-nginx
```

### Files not persisting?

```bash
# Check volume mounts
docker inspect mikrotik-monitor-app | grep -A 10 Mounts

# Should show:
# "Source": "/path/to/mikrotik-monitor/attached_assets"
# "Destination": "/app/attached_assets"
```

---

## 🎉 Result

**Before:** Permission denied errors when uploading logos

**After:** ✅ Logos upload successfully and persist across restarts!

---

**The fix is complete and ready to apply!**

Just run:
```bash
./deploy.sh stop
./deploy.sh up --with-nginx
```
