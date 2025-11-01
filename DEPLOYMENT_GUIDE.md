# MikroTik Monitor - Production Deployment Guide

## 🎯 Quick Start (New Server)

### Prerequisites
- Ubuntu/Debian server (tested on Ubuntu 20.04+)
- Docker and Docker Compose V2 installed
- Git installed
- Port 5000 available (or configure custom port)

### One-Command Setup

```bash
# Clone repository
git clone <your-repo-url> MikroTikMon
cd MikroTikMon

# Run setup (generates .env with secure credentials)
chmod +x setup.sh deploy.sh
./setup.sh

# Deploy application
./deploy.sh up
```

That's it! Your application is now running at `http://your-server-ip:5000`

---

## 📋 Detailed Setup Instructions

### Step 1: Install Prerequisites

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# Install Git
sudo apt install git -y
```

### Step 2: Clone Repository

```bash
cd ~
git clone <your-repo-url> MikroTikMon
cd MikroTikMon
```

### Step 3: Run Setup Script

```bash
# Make scripts executable
chmod +x setup.sh deploy.sh

# Run initial setup
./setup.sh
```

The setup script will:
- ✅ Create `.env` file from template
- ✅ Generate secure database password
- ✅ Generate session secret
- ✅ (Optional) Configure SMTP for email alerts
- ✅ (Optional) Create super admin account

### Step 4: Deploy Application

```bash
# Start all containers
./deploy.sh up

# Wait for deployment to complete (30-60 seconds)
# The script will automatically:
# - Build Docker images
# - Start PostgreSQL database
# - Start application container
# - Run database migrations
```

### Step 5: Access Application

Open your browser and navigate to:
```
http://your-server-ip:5000
```

**Default Login Credentials:**
- Username: `admin`
- Password: `admin`

⚠️ **You will be forced to change the password on first login**

---

## 🔧 Configuration

### Environment Variables (.env)

The `.env` file contains all configuration. Key variables:

```bash
# Database (auto-configured by setup.sh)
DATABASE_URL=postgresql://mikrotik_user:PASSWORD@mikrotik-monitor-db:5432/mikrotik_monitor
SESSION_SECRET=your-generated-secret

# Application
NODE_ENV=production
APP_PORT=5000

# Email Alerts (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM_EMAIL=your-email@gmail.com

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
APP_URL=http://your-server-ip:5000
```

### Customizing Port

Edit `.env`:
```bash
APP_PORT=8080  # Change to your preferred port
```

Then restart:
```bash
./deploy.sh restart
```

---

## 🚀 Deployment Commands

The `deploy.sh` script provides comprehensive deployment management:

### Basic Commands
```bash
./deploy.sh up              # Start application
./deploy.sh down            # Stop application
./deploy.sh restart         # Restart application
./deploy.sh logs            # View logs (Ctrl+C to exit)
./deploy.sh status          # Show container status
```

### Maintenance Commands
```bash
./deploy.sh update          # Pull latest code and rebuild
./deploy.sh backup          # Create database backup
./deploy.sh restore <file>  # Restore from backup
./deploy.sh clean           # Remove all containers and volumes
```

### Admin Commands
```bash
./deploy.sh reset-password  # Reset admin password (generates random temp)
./deploy.sh shell           # Open shell in app container
./deploy.sh db-shell        # Open PostgreSQL shell
```

### Troubleshooting Commands
```bash
./deploy.sh fix-db          # Fix database connection issues
./deploy.sh setup-admin     # Re-create admin user
```

---

## 🔄 Updating to Latest Version

```bash
cd ~/MikroTikMon
./deploy.sh update
```

This will:
1. Pull latest code from git
2. Rebuild Docker images
3. Restart containers
4. Run database migrations

---

## 🔒 Security Best Practices

### 1. Change Default Credentials
On first login, you'll be forced to change the default `admin/admin` credentials.

### 2. Enable HTTPS (Recommended for Production)

#### Option A: Using Nginx (Included)

1. Get SSL certificate (Let's Encrypt):
```bash
sudo apt install certbot
sudo certbot certonly --standalone -d your-domain.com
```

2. Copy certificates:
```bash
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ssl/
sudo chmod 644 ssl/*.pem
```

3. Edit `nginx.conf` and update domain name

4. Deploy with Nginx:
```bash
./deploy.sh up --with-nginx
```

5. Enable secure cookies in `.env`:
```bash
USE_SECURE_COOKIES=true
```

#### Option B: External Reverse Proxy
If using external nginx/Apache, proxy to `http://localhost:5000`

### 3. Firewall Configuration
```bash
# Allow only necessary ports
sudo ufw allow 22/tcp        # SSH
sudo ufw allow 5000/tcp      # Application (or 80/443 if using Nginx)
sudo ufw enable
```

### 4. Keep .env Secure
```bash
chmod 600 .env
# Never commit .env to version control!
```

---

## 📊 Monitoring & Logs

### View Application Logs
```bash
./deploy.sh logs            # All logs (live)
docker logs mikrotik-monitor-app --tail 100    # Last 100 lines
docker logs mikrotik-monitor-db --tail 50      # Database logs
```

### Health Check
```bash
curl http://localhost:5000/api/health
```

Should return:
```json
{"status":"ok","timestamp":"...","uptime":123.45}
```

---

## 🐛 Troubleshooting

### Problem: Application won't start

**Solution 1: Check logs**
```bash
./deploy.sh logs
```

**Solution 2: Fix database connection**
```bash
./deploy.sh fix-db
```

**Solution 3: Clean and restart**
```bash
./deploy.sh down
./deploy.sh up
```

### Problem: Can't login

**Solution: Reset admin password**
```bash
./deploy.sh reset-password
```

### Problem: Database connection errors

**Check .env file:**
```bash
cat .env | grep DATABASE_URL
```

Should contain: `@mikrotik-monitor-db:5432` (NOT `@postgres:5432`)

**Fix automatically:**
```bash
./deploy.sh fix-db
```

### Problem: Port 5000 already in use

**Option 1: Change port in .env**
```bash
# Edit .env
APP_PORT=8080

# Restart
./deploy.sh restart
```

**Option 2: Stop conflicting service**
```bash
sudo lsof -ti:5000 | xargs kill -9
./deploy.sh restart
```

---

## 💾 Backup & Restore

### Create Backup
```bash
./deploy.sh backup
```

Backup file saved as: `backup_YYYYMMDD_HHMMSS.sql`

### Restore from Backup
```bash
./deploy.sh restore backup_20231101_120000.sql
```

### Automated Backups (Optional)

Create cron job:
```bash
crontab -e
```

Add daily backup at 2 AM:
```
0 2 * * * cd ~/MikroTikMon && ./deploy.sh backup > /dev/null 2>&1
```

---

## 🔧 Advanced Configuration

### Custom Database Port (for debugging only)

Edit `docker-compose.yml`, uncomment ports section:
```yaml
ports:
  - "5433:5432"
```

Then in `.env`:
```bash
POSTGRES_PORT=5433
```

### Email Alerts with Gmail

1. Enable 2FA on Google Account
2. Generate App Password: https://myaccount.google.com/apppasswords
3. Add to `.env`:
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-character-app-password
SMTP_FROM_EMAIL=your-email@gmail.com
```

4. Restart:
```bash
./deploy.sh restart
```

### Google OAuth Setup

1. Go to https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID
3. Add authorized redirect URI: `http://your-server-ip:5000/api/auth/google/callback`
4. Add credentials to `.env`:
```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
APP_URL=http://your-server-ip:5000
```

5. Restart:
```bash
./deploy.sh restart
```

---

## 📦 What's Included

### Docker Containers
- `mikrotik-monitor-app` - Main application (Node.js/Express)
- `mikrotik-monitor-db` - PostgreSQL 16 database
- `mikrotik-monitor-nginx` - (Optional) Nginx reverse proxy with SSL

### Volumes
- `postgres_data` - Database persistent storage
- `nginx_cache` - (Optional) Nginx cache

### Networks
- `mikrotik-network` - Bridge network for container communication

---

## 🎓 Usage Guide

### First Login

1. Navigate to `http://your-server-ip:5000`
2. Click "Login"
3. Use default credentials: `admin` / `admin`
4. You'll be redirected to change password
5. Set new username (optional) and password
6. Access dashboard

### Adding Routers

1. Go to "Routers" page
2. Click "Add Router"
3. Fill in:
   - Name (e.g., "Office Router")
   - Host (IP address or hostname)
   - Username (MikroTik admin user)
   - Password
   - API Port (default: 8728)
4. Click "Test Connection" to verify
5. Save

### Monitoring Interfaces

1. Click on a router
2. Select interfaces to monitor
3. Set traffic thresholds (in KB/s)
4. Enable email alerts (optional)
5. View real-time graphs

### Managing Alerts

1. Go to "Alerts" page
2. View active/unacknowledged alerts
3. Click "Acknowledge" to dismiss
4. View alert history

### User Management (Admin Only)

1. Go to "Admin" → "Users"
2. Invite new users via email
3. Approve/disable user accounts
4. Manage roles (admin/user)

---

## 🌐 Production Checklist

Before going live, ensure:

- [ ] Changed default admin password
- [ ] Configured firewall (UFW/iptables)
- [ ] Set up HTTPS (Let's Encrypt or reverse proxy)
- [ ] Configured email alerts (SMTP)
- [ ] Set up automated backups (cron)
- [ ] Tested router connectivity
- [ ] Tested alert notifications
- [ ] Documented admin credentials (securely!)
- [ ] Set up monitoring (uptime checks)

---

## 📞 Support & Documentation

### Important Files
- `setup.sh` - Initial setup script
- `deploy.sh` - Deployment management
- `docker-compose.yml` - Container orchestration
- `.env` - Environment configuration
- `README.md` - Project documentation

### Scripts Directory
- `scripts/reset-admin-password.js` - Reset admin password
- `scripts/hash-password.js` - Generate password hash
- `scripts/diagnose-production.sh` - Production diagnostics

---

## 🔄 Migration from Replit to Self-Hosted

If migrating from Replit development:

1. Export database from Replit
2. Run setup on new server: `./setup.sh`
3. Deploy application: `./deploy.sh up`
4. Import database: `./deploy.sh restore <backup_file>`
5. Update router credentials (encryption keys different)
6. Test all functionality

---

## ✅ Version Information

**Current Version:** 1.0.0  
**Last Updated:** November 2025  
**Compatibility:** Ubuntu 20.04+, Docker 20.10+, Docker Compose V2

---

## 🎉 Success!

Your MikroTik Monitor is now running!

Access at: **http://your-server-ip:5000**

Default credentials: **admin / admin** (change on first login)

For help: Check logs with `./deploy.sh logs`
