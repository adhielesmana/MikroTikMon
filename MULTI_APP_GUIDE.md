# 🚀 Multi-App Deployment Guide

## Running Multiple Apps on One Server

This guide explains how to run multiple MikroTik Monitor instances (or other apps) on a single server without manual configuration struggles.

---

## ✨ **New Automated Setup Features**

The enhanced `setup.sh` script now handles **everything automatically**:

✅ **Domain/IP Detection** - Automatically detects server IP  
✅ **DNS Verification** - Checks if domain is configured correctly  
✅ **SSL Automation** - Automatically obtains and configures Let's Encrypt certificates  
✅ **Nginx Configuration** - Updates nginx.conf with your domain  
✅ **Environment Setup** - Configures .env with correct URLs  
✅ **Auto-Renewal** - Sets up cron job for SSL certificate renewal  
✅ **Multi-App Support** - Each app gets its own configuration  

---

## 🎯 **Quick Start for mon.maxnetplus.id**

### Option 1: Fully Automated (Recommended)

```bash
# Clone repository
cd ~
git clone <your-repo-url> MikroTikMon
cd MikroTikMon

# Run enhanced setup
chmod +x setup.sh deploy.sh
./setup.sh
```

**Follow the interactive prompts:**

```
Choose option (1/2/3): 3  # Domain with HTTPS

Enter domain name: mon.maxnetplus.id

Enter email for SSL certificates: your-email@example.com

# Setup will automatically:
# ✅ Verify DNS configuration
# ✅ Obtain SSL certificate
# ✅ Configure Nginx
# ✅ Update .env
# ✅ Setup auto-renewal
```

**Then deploy:**
```bash
./deploy.sh up --with-nginx
```

**Done! Access at:** `https://mon.maxnetplus.id`

---

## 🏢 **Running Multiple Apps on Same Server**

### Scenario: You want to run:
- **App 1:** MikroTik Monitor at `https://mon.maxnetplus.id`
- **App 2:** Another app at `https://app2.maxnetplus.id`
- **App 3:** Third app at `https://app3.maxnetplus.id`

### Setup Each App

```bash
# App 1 - MikroTik Monitor
cd ~
git clone <repo-url> app1-mikrotik
cd app1-mikrotik
./setup.sh
# Choose option 3, enter: mon.maxnetplus.id
./deploy.sh up --with-nginx

# App 2 - Another instance
cd ~
git clone <repo-url> app2-instance
cd app2-instance
./setup.sh
# Choose option 3, enter: app2.maxnetplus.id
./deploy.sh up --with-nginx

# App 3 - Third instance
cd ~
git clone <repo-url> app3-instance
cd app3-instance
./setup.sh
# Choose option 3, enter: app3.maxnetplus.id
./deploy.sh up --with-nginx
```

### How It Works

Each app runs in **isolated containers** with:
- ✅ **Own domain** - Separate SSL certificate
- ✅ **Own database** - Isolated PostgreSQL container
- ✅ **Own Nginx** - Separate reverse proxy (ports 80/443 shared)
- ✅ **Own network** - Isolated Docker network

**Port Mapping:**
```
Internet → Port 80/443
    ↓
App 1: Nginx (mon.maxnetplus.id) → Container Port 5000
App 2: Nginx (app2.maxnetplus.id) → Container Port 5000
App 3: Nginx (app3.maxnetplus.id) → Container Port 5000
```

---

## 🔧 **Setup Options Explained**

When you run `./setup.sh`, you'll see:

```
Options:
  1. IP address only (HTTP) - Quick setup, no SSL
  2. Domain name (HTTP) - Use custom domain without SSL
  3. Domain name (HTTPS) - Use custom domain with automatic SSL setup
```

### Option 1: IP Address (HTTP)
**Use case:** Development, internal network, quick testing

```
Choose option (1/2/3): 1

# Auto-detects server IP: 203.175.11.12
# Access: http://203.175.11.12:5000
```

**Deploy:**
```bash
./deploy.sh up
```

---

### Option 2: Domain (HTTP)
**Use case:** Custom domain without SSL, behind external proxy

```
Choose option (1/2/3): 2
Enter domain name: mon.maxnetplus.id

# Access: http://mon.maxnetplus.id
```

**Deploy:**
```bash
./deploy.sh up --with-nginx
```

---

### Option 3: Domain (HTTPS) ⭐ **Recommended**
**Use case:** Production deployment with automatic SSL

```
Choose option (1/2/3): 3
Enter domain name: mon.maxnetplus.id
Enter email for SSL: admin@maxnetplus.id

# Automatically:
# ✅ Verifies DNS
# ✅ Obtains SSL certificate
# ✅ Configures Nginx
# ✅ Sets up auto-renewal

# Access: https://mon.maxnetplus.id
```

**Deploy:**
```bash
./deploy.sh up --with-nginx
```

---

## 📋 **What Setup.sh Does Automatically**

### 1. Network Configuration
- ✅ Detects server IP address
- ✅ Validates domain format
- ✅ Checks DNS configuration
- ✅ Suggests correct DNS records

### 2. SSL Certificate Setup
- ✅ Installs Certbot if needed
- ✅ Obtains Let's Encrypt certificate
- ✅ Copies certificates to project
- ✅ Sets proper permissions
- ✅ Creates auto-renewal script
- ✅ Adds cron job for monthly renewal

### 3. Configuration Files
- ✅ Updates `nginx.conf` with domain
- ✅ Updates `.env` with APP_URL
- ✅ Sets USE_SECURE_COOKIES for HTTPS
- ✅ Generates secure database password
- ✅ Generates session secret

### 4. Optional Features
- ✅ SMTP configuration (email alerts)
- ✅ Google OAuth setup
- ✅ SSL auto-renewal

---

## 🌐 **DNS Configuration**

Before running setup with HTTPS, configure DNS:

### For mon.maxnetplus.id

**At your DNS provider (e.g., Cloudflare, GoDaddy):**

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | mon | 203.175.11.12 | Auto |

**Verify DNS:**
```bash
dig mon.maxnetplus.id +short
# Should return: 203.175.11.12
```

**Wait for propagation:** 5-15 minutes

---

## 🔒 **SSL Certificate Auto-Renewal**

Setup.sh automatically creates renewal script at:
```
/usr/local/bin/renew-ssl-mon.maxnetplus.id.sh
```

**Cron job runs monthly:**
```cron
0 3 1 * * /usr/local/bin/renew-ssl-mon.maxnetplus.id.sh
```

**Manual renewal if needed:**
```bash
sudo /usr/local/bin/renew-ssl-mon.maxnetplus.id.sh
```

**Check certificate expiration:**
```bash
sudo certbot certificates
```

---

## 🔥 **Firewall Configuration**

**Shared ports across all apps:**

```bash
# Allow HTTP and HTTPS (shared by all apps)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable
```

**How multiple apps share ports 80/443:**

Each Nginx container listens on 80/443 but Docker handles routing based on the `server_name` directive in nginx.conf.

```nginx
# App 1
server_name mon.maxnetplus.id;

# App 2
server_name app2.maxnetplus.id;
```

Docker's bridge network ensures each container gets its own IP, allowing all Nginx instances to bind to 80/443 on their respective container IPs.

---

## 📊 **Directory Structure for Multiple Apps**

```
/home/user/
├── app1-mikrotik/          # mon.maxnetplus.id
│   ├── docker-compose.yml
│   ├── nginx.conf         # server_name mon.maxnetplus.id
│   ├── .env               # APP_URL=https://mon.maxnetplus.id
│   └── ssl/
│       ├── fullchain.pem
│       └── privkey.pem
│
├── app2-instance/          # app2.maxnetplus.id
│   ├── docker-compose.yml
│   ├── nginx.conf         # server_name app2.maxnetplus.id
│   ├── .env               # APP_URL=https://app2.maxnetplus.id
│   └── ssl/
│       ├── fullchain.pem
│       └── privkey.pem
│
└── app3-instance/          # app3.maxnetplus.id
    ├── docker-compose.yml
    ├── nginx.conf         # server_name app3.maxnetplus.id
    ├── .env               # APP_URL=https://app3.maxnetplus.id
    └── ssl/
        ├── fullchain.pem
        └── privkey.pem
```

---

## 🎓 **Understanding Container Isolation**

### Each App Has Its Own:

**Containers:**
- `appX-mikrotik-monitor-app` (Node.js application)
- `appX-mikrotik-monitor-db` (PostgreSQL database)
- `appX-mikrotik-monitor-nginx` (Nginx reverse proxy)

**Networks:**
- `appX-mikrotik-network` (isolated bridge network)

**Volumes:**
- `appX_postgres_data` (database storage)
- `appX_nginx_cache` (Nginx cache)

**This ensures:**
- ✅ No port conflicts
- ✅ No database conflicts
- ✅ No network interference
- ✅ Independent scaling
- ✅ Easy removal/updates

---

## 🔧 **Troubleshooting Multiple Apps**

### Issue: Port 80/443 Already in Use

**Cause:** Another app's Nginx is already using the port

**Solution:** Docker handles port sharing automatically. Just ensure each app has a different domain in nginx.conf.

**Verify:**
```bash
docker ps | grep nginx
# Should show multiple nginx containers
```

---

### Issue: SSL Certificate Error

**Cause:** DNS not configured or certificate not obtained

**Solution:**
```bash
# Check DNS
dig your-domain.com +short

# Manually obtain certificate
sudo certbot certonly --standalone -d your-domain.com

# Copy to app directory
cd ~/your-app
mkdir -p ssl
sudo cp /etc/letsencrypt/live/your-domain.com/*.pem ssl/
sudo chown $USER:$USER ssl/*.pem
```

---

### Issue: Apps Interfering with Each Other

**Cause:** Containers not properly isolated

**Solution:** Ensure each app is in its own directory with unique container names in docker-compose.yml.

**Check isolation:**
```bash
# List all containers
docker ps

# Check networks
docker network ls

# Verify each app has its own network
docker network inspect app1-mikrotik-network
docker network inspect app2-mikrotik-network
```

---

## 🚀 **Quick Command Reference**

### For Each App

```bash
# Setup
cd ~/appX-instance
./setup.sh

# Deploy
./deploy.sh up --with-nginx

# Update
./deploy.sh update

# View logs
./deploy.sh logs

# Restart
./deploy.sh restart

# Stop
./deploy.sh down

# Status
./deploy.sh status
```

### Manage All Apps

```bash
# Start all
for app in app1-mikrotik app2-instance app3-instance; do
    cd ~/$app && ./deploy.sh up --with-nginx
done

# Stop all
for app in app1-mikrotik app2-instance app3-instance; do
    cd ~/$app && ./deploy.sh down
done

# Update all
for app in app1-mikrotik app2-instance app3-instance; do
    cd ~/$app && ./deploy.sh update
done
```

---

## 📝 **Best Practices**

### 1. Use Separate Directories
Each app should be in its own directory to avoid configuration conflicts.

### 2. Use Different Domains
Each app should have its own unique domain or subdomain.

### 3. Regular Backups
```bash
# Backup each app's database
cd ~/app1-mikrotik && ./deploy.sh backup
cd ~/app2-instance && ./deploy.sh backup
```

### 4. Monitor Resources
```bash
# Check Docker resource usage
docker stats

# Check disk space
df -h
```

### 5. Keep SSL Certificates Updated
The auto-renewal cron job handles this, but verify occasionally:
```bash
sudo certbot certificates
```

---

## 🎉 **Summary**

### Before (Manual Configuration)
- ❌ Manual nginx.conf editing
- ❌ Manual SSL certificate setup
- ❌ Manual .env configuration
- ❌ Manual DNS checking
- ❌ Manual renewal setup
- ❌ Complex multi-app deployment

### After (Automated Setup)
- ✅ Run `./setup.sh`
- ✅ Choose domain option
- ✅ Enter domain name
- ✅ Everything configured automatically
- ✅ SSL certificates obtained
- ✅ Auto-renewal configured
- ✅ Ready for production
- ✅ Easy multi-app deployment

---

## 🎯 **Real-World Example**

### Deploy mon.maxnetplus.id Right Now

```bash
# Step 1: Configure DNS (at your DNS provider)
# Add A record: mon → 203.175.11.12

# Step 2: Clone and setup
cd ~
git clone <your-repo-url> MikroTikMon
cd MikroTikMon
chmod +x setup.sh deploy.sh

# Step 3: Run automated setup
./setup.sh
# Choose option: 3
# Enter domain: mon.maxnetplus.id
# Enter email: admin@maxnetplus.id

# Step 4: Deploy
./deploy.sh up --with-nginx

# Step 5: Access
# https://mon.maxnetplus.id
```

**Total time:** 5-10 minutes (including DNS propagation)  
**Manual configuration:** Zero! 🎉

---

**Last Updated:** November 1, 2025  
**Compatible with:** MikroTik Monitor v1.0.1+
