# Intelligent Deployment System

## Overview

The intelligent deployment system (`intelligent-deploy.sh`) automatically detects your nginx configuration and provides smart deployment options based on your server's current state.

## 🎯 What It Does

The script automatically:
- ✅ **Detects existing nginx** installations (host or Docker)
- ✅ **Resolves port conflicts** by finding free ports
- ✅ **Updates nginx configurations** automatically
- ✅ **Provides smart installation options** based on your setup
- ✅ **Handles fresh installs and updates** differently

---

## 🚀 Quick Start

### One Command Deployment

```bash
./intelligent-deploy.sh
```

That's it! The script will:
1. Analyze your current setup
2. Recommend the best deployment strategy
3. Handle everything automatically

---

## 📊 Detection Scenarios

### Scenario 1: Nginx Already on Host

**Detection:**
```
✓ Detected nginx running on host
```

**Strategy:**
- ✅ Updates nginx configuration for MikroTik Monitor
- ✅ Automatically adjusts Docker ports to avoid conflicts
- ✅ Deploys application without Docker nginx

**Example:**
```bash
$ ./intelligent-deploy.sh

========================================
  MikroTik Monitor - Smart Deploy
========================================

▶ Detecting nginx installations...

✓ Detected nginx running on host

▶ Deployment Strategy:

ℹ Strategy: Use existing host nginx (update configuration only)

ℹ Actions to be taken:
  1. Update nginx configuration for MikroTik Monitor
  2. Modify Docker ports to avoid conflicts
  3. Deploy application without Docker nginx

Continue with this strategy? (Y/n): y

⚠ Port 5000 is in use, using port 5001 instead
✓ Docker will use port 5001 for the application
▶ Updating host nginx configuration...
✓ Host nginx configuration updated!
▶ Deploying application...
✓ Deployment complete!

ℹ Application is running at:
  • https://your-domain.com (via host nginx)
  • http://localhost:5001 (direct access)
```

---

### Scenario 2: Docker Nginx Exists (Update)

**Detection:**
```
✓ Detected nginx Docker container (running)
ℹ This appears to be an update to existing deployment
```

**Strategy:**
- ✅ Updates existing Docker nginx deployment
- ✅ Preserves existing configuration
- ✅ Smooth update without reconfiguration

**Example:**
```bash
$ ./intelligent-deploy.sh

✓ Detected nginx Docker container (running)
ℹ This appears to be an update to existing deployment

▶ Deployment Strategy:

ℹ Strategy: Update existing Docker nginx deployment

Continue with update? (Y/n): y

▶ Updating deployment...
✓ Update complete!
```

---

### Scenario 3: Docker Nginx Exists (Fresh Install)

**Detection:**
```
✓ Detected nginx Docker container (stopped)
ℹ This appears to be a fresh installation
```

**Strategy:**
- ⚠️ Warns about existing nginx container
- ✅ Offers to remove and start fresh
- ✅ Allows cancellation

**Example:**
```bash
$ ./intelligent-deploy.sh

⚠ Found existing nginx Docker container from previous installation

ℹ Options:
  1. Remove existing nginx container and start fresh
  2. Cancel deployment

Choose option (1/2): 1

▶ Removing existing nginx container...
✓ Nginx container removed

[Continues to fresh install options]
```

---

### Scenario 4: No Nginx Detected

**Detection:**
```
ℹ This appears to be a fresh installation
```

**Strategy:**
- ✅ Presents two installation options
- ✅ Guides through setup process
- ✅ Handles SSL certificate setup

**Example:**
```bash
$ ./intelligent-deploy.sh

▶ Deployment Strategy:

ℹ Strategy: Fresh installation - choose nginx deployment method

ℹ Nginx Deployment Options:

  1. Install nginx on host (Recommended for production)
     ✓ Supports multiple applications
     ✓ Automatic SSL renewal with Let's Encrypt
     ✓ Centralized reverse proxy management

  2. Install nginx in Docker (Containerized)
     ✓ Fully containerized environment
     ✓ Portable deployment
     ✓ Isolated from host system

Choose installation method (1/2): 1

▶ Installing nginx on host...
✓ Nginx and certbot installed!
▶ Detecting port conflicts and adjusting Docker configuration...
✓ Docker will use port 5000 for the application
▶ Updating host nginx configuration...
Enter your domain name (e.g., mon.maxnetplus.id): mon.example.com
✓ Configuration created
✓ Site enabled
✓ Host nginx configuration updated!

ℹ SSL certificate setup
⚠ Make sure your domain DNS points to this server's IP address
Do you want to setup SSL certificate now? (y/N): y
Enter your email for Let's Encrypt notifications: admin@example.com
Enter your domain name: mon.example.com
✓ SSL certificate installed!
✓ Auto-renewal configured

▶ Deploying application...
✓ Deployment complete!

ℹ Application is running at:
  • https://mon.example.com (via host nginx)
  • http://localhost:5000 (direct access)
```

---

## 🔧 How It Works

### Detection Process

```
┌─────────────────────────────────────┐
│  Start Intelligent Deploy          │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Detect Host Nginx                  │
│  - Check if nginx command exists    │
│  - Check if nginx is running        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Detect Docker Nginx                │
│  - Check for nginx container        │
│  - Check if running or stopped      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Determine Installation Type        │
│  - Fresh install?                   │
│  - Update?                          │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Choose Deployment Strategy         │
│  - Use existing nginx               │
│  - Install new nginx (host/Docker)  │
│  - Update existing deployment       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Execute Deployment                 │
└─────────────────────────────────────┘
```

### Port Conflict Resolution

When host nginx is detected:

1. **Check port 5000**: Is it in use?
2. **If in use**: Find next available port (5001, 5002, etc.)
3. **Update .env**: Set `APP_PORT` to free port
4. **Update nginx config**: Point to new port
5. **Deploy**: Application uses conflict-free port

**Example:**
```bash
⚠ Port 5000 is in use, using port 5001 instead
✓ Docker will use port 5001 for the application
```

---

## 📋 Features

### Automatic Detection

| Feature | Description |
|---------|-------------|
| **Host Nginx Detection** | Checks if nginx is installed and running on host |
| **Docker Nginx Detection** | Finds existing nginx Docker containers |
| **Installation Type Detection** | Distinguishes fresh install from updates |
| **Port Conflict Detection** | Finds and resolves port conflicts automatically |

### Smart Configuration

| Feature | Description |
|---------|-------------|
| **Auto Config Update** | Updates nginx configuration automatically |
| **Port Reassignment** | Assigns free ports to avoid conflicts |
| **WebSocket Support** | Adds WebSocket map to nginx.conf |
| **Rate Limiting** | Configures rate limiting zones |

### Interactive Setup

| Feature | Description |
|---------|-------------|
| **Installation Options** | Choose between host or Docker nginx |
| **SSL Setup** | Guided SSL certificate configuration |
| **Conflict Resolution** | Options to remove or cancel on conflicts |

---

## 🎛️ Advanced Usage

### Environment Variables

The script respects and modifies `.env` file:

```bash
# Automatically set by the script
APP_PORT=5000  # Or next available port if 5000 is in use
```

### Manual Port Override

If you want to force a specific port:

```bash
# Edit .env before running
APP_PORT=3000

# Then run
./intelligent-deploy.sh
```

### Skip Prompts (Non-Interactive)

For automation, you can pre-configure:

```bash
# Example: Auto-accept defaults
yes | ./intelligent-deploy.sh
```

---

## 🔍 Troubleshooting

### Port Already in Use

**Problem:**
```
⚠ Port 5000 is in use, using port 5001 instead
```

**Solution:**
This is automatic! The script finds a free port and uses it.

**To verify:**
```bash
# Check what's using port 5000
sudo lsof -i :5000

# Check assigned port
grep APP_PORT .env
```

---

### Nginx Configuration Conflict

**Problem:**
```
⚠ Found existing nginx Docker container from previous installation
```

**Solution:**
Choose option 1 to remove and start fresh:
```
Choose option (1/2): 1
```

---

### SSL Certificate Issues

**Problem:**
SSL setup fails or certificates not found.

**Solution:**
1. Ensure DNS points to your server
2. Ensure port 80 is available
3. Run certbot manually:
```bash
sudo certbot certonly --standalone -d your-domain.com
```

---

### Permission Denied

**Problem:**
```
✗ Permission denied when updating nginx
```

**Solution:**
Run with sudo when modifying host nginx:
```bash
# The script will prompt for sudo when needed
./intelligent-deploy.sh
```

---

## 🆚 Comparison with Regular deploy.sh

| Feature | intelligent-deploy.sh | deploy.sh |
|---------|----------------------|-----------|
| **Auto-detection** | ✅ Yes | ❌ No |
| **Port conflict resolution** | ✅ Automatic | ⚠️ Manual |
| **Nginx config update** | ✅ Automatic | ⚠️ Manual |
| **Installation options** | ✅ Interactive | ⚠️ Manual |
| **Fresh install detection** | ✅ Yes | ❌ No |
| **Smart strategy selection** | ✅ Yes | ❌ No |

**Recommendation:** Use `intelligent-deploy.sh` for first-time setup and `deploy.sh` for routine operations (restart, logs, etc.)

---

## 📚 Related Documentation

- **[DEPLOYMENT_QUICK_START.md](DEPLOYMENT_QUICK_START.md)** - Quick start guide
- **[DEPLOYMENT_OPTIONS.md](DEPLOYMENT_OPTIONS.md)** - Detailed deployment options
- **[NGINX_ENHANCEMENTS.md](NGINX_ENHANCEMENTS.md)** - Nginx configuration details
- **[DEPLOYMENT_SUMMARY.md](DEPLOYMENT_SUMMARY.md)** - Overall summary

---

## 🎯 Best Practices

### When to Use

✅ **Use `intelligent-deploy.sh` for:**
- First-time deployment on a new server
- Migrating from another setup
- Uncertain about nginx configuration
- Want automatic conflict resolution

✅ **Use `deploy.sh` for:**
- Routine restart/stop/start operations
- Viewing logs
- Database operations
- Backup/restore

### Migration Path

**From manual setup → Intelligent deployment:**
```bash
# Just run the intelligent script
./intelligent-deploy.sh

# It will detect your setup and offer options
```

**From intelligent deployment → Manual control:**
```bash
# After intelligent setup, use regular commands
./deploy.sh restart
./deploy.sh logs
```

---

## ✅ Summary

**The intelligent deployment system provides:**

✅ **Zero-configuration detection** - Knows your setup automatically  
✅ **Conflict-free deployment** - Resolves port conflicts automatically  
✅ **Smart strategy selection** - Chooses best approach for your situation  
✅ **Interactive guidance** - Helps you make informed decisions  
✅ **Production-ready setup** - Follows best practices automatically  

**One command. Smart decisions. Hassle-free deployment.** 🚀
