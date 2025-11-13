# Quick Start Deployment Guide

## 🚀 Intelligent Deployment (Recommended)

**The easiest way to deploy - one command, automatic detection:**

```bash
./intelligent-deploy.sh
```

The script will:
- ✅ Auto-detect existing nginx (host or Docker)
- ✅ Resolve port conflicts automatically
- ✅ Recommend the best deployment strategy
- ✅ Guide you through setup interactively

**See [INTELLIGENT_DEPLOYMENT.md](INTELLIGENT_DEPLOYMENT.md) for details.**

---

## 📖 Manual Deployment Options

Choose your deployment method based on your needs:

## 🚀 Option 1: Host-Level Nginx (Recommended for Production)

**Best for:** Running multiple apps on one server

### Quick Setup (3 commands):

```bash
# 1. Setup nginx on host with automatic SSL
sudo ./scripts/setup-nginx-host.sh

# 2. Deploy application (without Docker nginx)
./deploy.sh up

# 3. Verify
curl https://your-domain.com
```

**Features:**
- ✅ Automatic SSL certificate (Let's Encrypt)
- ✅ Auto-renewal configured
- ✅ Support multiple apps on same server
- ✅ Centralized nginx management

---

## 🐳 Option 2: Docker Nginx (Containerized)

**Best for:** Single app deployment, fully containerized

### Quick Setup (3 steps):

```bash
# 1. Prepare SSL certificates
mkdir -p ssl
sudo certbot certonly --standalone -d your-domain.com
sudo cp /etc/letsencrypt/live/your-domain.com/*.pem ssl/
sudo chmod 644 ssl/*.pem

# 2. Update nginx.conf with your domain
sed -i 's/mon.maxnetplus.id/your-domain.com/g' nginx.conf

# 3. Deploy with Docker nginx
./deploy.sh up --with-nginx
```

**Features:**
- ✅ Fully containerized
- ✅ Portable deployment
- ✅ Isolated environment
- ⚠️ Manual SSL renewal required

---

## 📋 Comparison

| Feature | Host-Level | Docker |
|---------|-----------|--------|
| **Multiple Apps** | ✅ Yes | ❌ No |
| **Auto SSL Renewal** | ✅ Yes | ❌ Manual |
| **Setup Complexity** | 🟡 Moderate | 🟢 Easy |
| **Best For** | Production servers | Single app/testing |

---

## 🔧 Post-Deployment

### Host-Level Nginx
```bash
# View logs
sudo tail -f /var/log/nginx/mikrotik-monitor-access.log

# Reload config
sudo nginx -t && sudo systemctl reload nginx

# Check SSL
sudo certbot certificates
```

### Docker Nginx
```bash
# View logs
docker logs -f mikrotik-monitor-nginx

# Reload config
docker exec mikrotik-monitor-nginx nginx -s reload

# Renew SSL (manual)
./ssl-renew.sh
```

---

## 📚 Full Documentation

See [DEPLOYMENT_OPTIONS.md](DEPLOYMENT_OPTIONS.md) for complete details, troubleshooting, and advanced configuration.

---

## ❓ Which Option Should I Choose?

### Choose **Host-Level Nginx** if you answer YES to any:
- Will you run other apps on this server later?
- Do you want automatic SSL renewal?
- Do you prefer system-level management?

### Choose **Docker Nginx** if you answer YES to all:
- Is this the only app on this server?
- Do you want everything in Docker?
- Are you okay with manual SSL renewal?

**Still unsure?** → Use **Host-Level Nginx** (it's more flexible for the future)
