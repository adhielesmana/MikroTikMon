# 🚀 MikroTik Monitor - Deployment Guide

## ✅ Automatic Directory Creation

The application now **automatically creates** all required directories on startup. No manual intervention needed!

### What Gets Created Automatically:
- ✅ `attached_assets/` - Root directory for assets
- ✅ `attached_assets/logos/` - Custom logo storage
- ✅ `logs/` - Application logs

### Startup Logs You'll See:
```
✓ Ensured directory exists: /app/attached_assets
✓ Ensured directory exists: /app/attached_assets/logos
✓ Ensured directory exists: /app/logs
```

---

## 🎨 Logo Upload Feature

### How It Works:
1. **Admin goes to Settings** → Paste any logo URL
2. **Click "Save"** → Backend automatically:
   - Downloads the image from the URL
   - Saves it to `attached_assets/logos/` with unique filename
   - Updates database with **local file path** (not external URL)
   - Deletes old logo file (if exists)
3. **Logo loads from local storage** → Faster, more reliable!

### Supported Formats:
- PNG, SVG, JPG, GIF, WebP
- Transparent backgrounds recommended
- Max width: 200px recommended

### Example URLs:
```
https://maxnetplus.id/img/logo.png
https://example.com/assets/company-logo.svg
https://cdn.example.com/branding/logo.png
```

---

## 📦 Production Deployment (Docker)

### Prerequisites:
```bash
cd ~/MikroTikMon
source .env  # Load environment variables
```

### One-Command Deploy:
```bash
bash intelligent-deploy.sh
```

### 🧠 Smart Deployment Behavior:

**First-time deployment:**
1. ✅ Installs Nginx (if not installed)
2. ✅ Configures SSL with Let's Encrypt (if certificates exist)
3. ✅ Creates Nginx reverse proxy configuration
4. ✅ Builds & starts Docker containers
5. ✅ Runs database migrations safely
6. ✅ Creates required directories on first startup
7. ✅ Starts auto-update polling (checks GitHub every 5 min)

**Subsequent deployments (app updates):**
1. ✅ **Skips Nginx configuration** (preserves your custom settings!)
2. ✅ **Skips SSL setup** (doesn't touch existing certificates)
3. ✅ **Only updates Docker app** (rebuild + restart containers)
4. ✅ Runs new database migrations (if any)

**Force Nginx reconfiguration (when needed):**
```bash
FORCE_NGINX_RECONFIGURE=1 bash intelligent-deploy.sh
```

**This smart behavior means:**
- ✅ Safe to run `intelligent-deploy.sh` anytime for app updates
- ✅ Your custom Nginx tweaks are never overwritten
- ✅ SSL certificates remain untouched
- ✅ Zero downtime deployments
- ✅ Auto-update from GitHub works seamlessly

---

## 🔧 Manual Directory Creation (If Needed)

**For Production Server:**
```bash
cd ~/MikroTikMon

# Create directories inside Docker container
docker compose exec app mkdir -p attached_assets/logos
docker compose exec app chmod 755 attached_assets/logos

# Verify
docker compose exec app ls -la attached_assets/
```

**For Development (Replit):**
```bash
# Directories are created automatically on server start!
# Just restart the workflow if needed
```

---

## 🐛 Troubleshooting Logo Upload

### Error: "500 Failed to update app settings"

**Cause:** Directory doesn't exist or permission issue

**Solution:**
1. Check logs:
   ```bash
   docker compose logs app --tail=50 | grep -i "settings\|error"
   ```

2. Verify directory exists:
   ```bash
   docker compose exec app ls -la attached_assets/logos/
   ```

3. If missing, restart container (auto-creates on startup):
   ```bash
   docker compose restart app
   ```

4. Try uploading logo again!

---

## 📂 Directory Structure

```
~/MikroTikMon/
├── attached_assets/              # Persisted via Docker volume
│   └── logos/                   # Custom logos (auto-created)
│       └── logo-abc123.png      # Unique filenames
├── logs/                        # App logs (auto-created)
│   └── server.log
├── docker-compose.yml           # Volume mappings configured
├── Dockerfile                   # Creates directories with proper permissions
├── server/index.ts              # Auto-creates dirs on startup
└── intelligent-deploy.sh        # One-command deployment
```

---

## 🔒 Security Notes

### File Storage:
- ✅ **Local storage only** - No external dependencies
- ✅ **Unique filenames** - Prevents overwrites (crypto random hash)
- ✅ **Old files deleted** - Prevents disk bloat
- ✅ **Proper permissions** - 755 for directories, 644 for files

### Docker Volumes:
- ✅ **Persistent storage** - Survives container restarts
- ✅ **Automatic mounting** - No manual setup
- ✅ **Backed up** - Part of backup_*.sql exports

---

## ✅ Verification Checklist

After deployment, verify everything works:

### 1. Check Directories:
```bash
docker compose exec app ls -la attached_assets/
# Should show: drwxr-xr-x logos/
```

### 2. Check Startup Logs:
```bash
docker compose logs app | grep "Ensured directory"
# Should show: ✓ Ensured directory exists...
```

### 3. Test Logo Upload:
1. Login as admin
2. Go to Settings
3. Paste: `https://maxnetplus.id/img/logo.png`
4. Click Save
5. Logo should appear instantly!

### 4. Verify Database:
```bash
docker exec -i mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -c \
  "SELECT logo_url FROM app_settings;"
```
Should show:
```
logo_url
-----------------------------------
/attached_assets/logos/logo-abc123.png
```
(Local path, not external URL!)

---

## 🎉 Summary

**Everything is now automatic!**
- ✅ Directories created on startup
- ✅ Logo downloads and stores locally
- ✅ Permissions set correctly
- ✅ Volume mapping configured
- ✅ Survives restarts and updates

**No manual intervention required!**

Just deploy and use! 🚀
