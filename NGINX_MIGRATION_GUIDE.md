# Nginx Migration Guide: Docker → Host

## 🎯 Your Current Status

✅ **Step 1 Complete:** Docker containers stopped
```
✔ Container mikrotik-monitor-nginx   Removed
✔ Container mikrotik-monitor-app     Removed  
✔ Container mikrotik-monitor-db      Removed
```

⚠️ Network warning is **normal** - will be cleaned up automatically

---

## 📋 Next Steps

### Step 2: Run Intelligent Deployment

```bash
./intelligent-deploy.sh
```

**What will happen:**
1. Script detects no nginx running (you stopped Docker nginx)
2. Script detects existing app data (database, configs)
3. Script offers installation options
4. **Choose option 1:** Install nginx on host

### Step 3: Follow the Prompts

**You'll be asked:**

1. **Domain name:** Enter `mon.maxnetplus.id`
2. **Email:** Enter your email for Let's Encrypt
3. **SSL setup:** Answer `y` to setup SSL certificate

**The script will automatically:**
- Install nginx on your host
- Install certbot for SSL
- Generate SSL certificate
- Configure auto-renewal
- Add WebSocket support
- Add rate limiting
- Configure reverse proxy to your app
- Deploy app without Docker nginx

---

## 💡 Expected Output

```bash
$ ./intelligent-deploy.sh

========================================
  MikroTik Monitor - Smart Deploy
========================================

▶ Detecting nginx installations...

ℹ This appears to be a fresh installation

▶ Deployment Strategy:

ℹ Nginx Deployment Options:

  1. Install nginx on host (Recommended for production)
     ✓ Supports multiple applications
     ✓ Automatic SSL renewal with Let's Encrypt
     ✓ Centralized reverse proxy management

  2. Install nginx in Docker (Containerized)
     ✓ Fully containerized environment
     ✓ Portable deployment
     ✓ Isolated from host system

Choose installation method (1/2): 1  ← Choose this!

▶ Installing nginx on host...
✓ Nginx and certbot installed!

▶ Detecting port conflicts and adjusting Docker configuration...
ℹ Port 5000 is available
✓ Docker will use port 5000 for the application

▶ Updating host nginx configuration...
Enter your domain name (e.g., mon.maxnetplus.id): mon.maxnetplus.id
✓ Configuration created at /etc/nginx/sites-available/mikrotik-monitor
✓ Site enabled
✓ WebSocket map added to nginx.conf
✓ Rate limiting zones added to nginx.conf
✓ Host nginx configuration updated!

ℹ SSL certificate setup
⚠ Make sure your domain DNS points to this server's IP address
Do you want to setup SSL certificate now? (y/N): y

Enter your email for Let's Encrypt notifications: your-email@domain.com
Enter your domain name: mon.maxnetplus.id

✓ SSL certificate installed!
✓ Auto-renewal configured

▶ Deploying application...
✓ Deployment complete!

ℹ Application is running at:
  • https://mon.maxnetplus.id (via host nginx)
  • http://localhost:5000 (direct access)

ℹ Useful commands:
  • View logs:    ./deploy.sh logs
  • Stop app:     ./deploy.sh stop
  • Restart app:  ./deploy.sh restart
```

---

## ✅ After Migration - Verify Everything Works

### 1. Check Nginx Status
```bash
sudo systemctl status nginx
```

Should show: `active (running)`

### 2. Check App Status
```bash
./deploy.sh status
```

Should show all containers running (except nginx - that's on host now)

### 3. Test Your Application
```bash
# Should redirect to HTTPS
curl -I http://mon.maxnetplus.id

# Should return 200 OK
curl -I https://mon.maxnetplus.id
```

### 4. Login and Test
Open browser: `https://mon.maxnetplus.id`
- Login with your credentials (adhielesmana/admin123 or helpdesk/helpdesk6262)
- Check that routers are still there
- Verify monitoring still works
- Test WebSocket connections (real-time data)

---

## 🔧 Post-Migration Configuration

### View Host Nginx Logs
```bash
# Access logs
sudo tail -f /var/log/nginx/mikrotik-monitor-access.log

# Error logs
sudo tail -f /var/log/nginx/mikrotik-monitor-error.log
```

### View App Logs
```bash
./deploy.sh logs
```

### Restart Nginx (if needed)
```bash
sudo nginx -t && sudo systemctl reload nginx
```

### Check SSL Certificate
```bash
sudo certbot certificates
```

Should show:
- Certificate name: mon.maxnetplus.id
- Expiry date: ~90 days from now
- Auto-renewal: Enabled

---

## 🎉 Benefits You Now Have

✅ **Host-level nginx** - Ready for multiple apps
✅ **Automatic SSL renewal** - Certbot handles it (cron job)
✅ **Centralized management** - One nginx for all apps
✅ **Better performance** - No Docker overhead for nginx
✅ **Easy scaling** - Add more apps anytime

---

## 📝 Adding More Apps Later

When you want to add another app:

```bash
# 1. Create new nginx config
sudo nano /etc/nginx/sites-available/my-new-app

# Example config:
server {
    listen 80;
    server_name app2.yourdomain.com;
    
    location / {
        proxy_pass http://127.0.0.1:3000;  # Your new app port
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection $connection_upgrade;
        proxy_http_version 1.1;
    }
}

# 2. Enable site
sudo ln -s /etc/nginx/sites-available/my-new-app /etc/nginx/sites-enabled/

# 3. Test and reload
sudo nginx -t && sudo systemctl reload nginx

# 4. Get SSL certificate
sudo certbot --nginx -d app2.yourdomain.com
```

**That's it!** Your nginx can now handle unlimited apps.

---

## 🆘 Troubleshooting

### SSL Certificate Fails

**Error:** DNS challenge fails

**Solution:**
```bash
# Verify DNS is pointing to your server
dig mon.maxnetplus.id

# Should show your server IP

# If not, wait for DNS to propagate (can take 5-60 minutes)
```

### Port 80/443 Already in Use

**Error:** nginx can't bind to port 80/443

**Solution:**
```bash
# Find what's using the ports
sudo lsof -i :80
sudo lsof -i :443

# If it's old Docker nginx (shouldn't be, but check)
docker ps | grep nginx
docker stop mikrotik-monitor-nginx
docker rm mikrotik-monitor-nginx
```

### App Not Starting

**Error:** Database connection fails

**Solution:**
```bash
# Check if database is running
./deploy.sh status

# If not, start it
docker start mikrotik-monitor-db

# Then restart app
./deploy.sh restart
```

### WebSocket Not Connecting

The intelligent script automatically configures WebSocket support, but if issues persist:

```bash
# Check WebSocket map exists
sudo nginx -T | grep "connection_upgrade"

# Should show:
# map $http_upgrade $connection_upgrade {
#     default upgrade;
#     ''      close;
# }
```

---

## 📊 Migration Checklist

Before migration:
- [x] Stopped Docker nginx
- [ ] Run intelligent-deploy.sh
- [ ] Choose host nginx installation
- [ ] Enter domain and email
- [ ] Setup SSL certificate
- [ ] Verify app is running
- [ ] Test login
- [ ] Test monitoring features

After migration:
- [ ] Check nginx status
- [ ] Verify SSL certificate
- [ ] Test HTTPS access
- [ ] Check auto-renewal cron job
- [ ] Document new setup
- [ ] Plan for additional apps

---

## 🎯 Summary

**Current State:**
- ✅ Docker containers stopped
- ✅ Ready for migration

**Next Command:**
```bash
./intelligent-deploy.sh
```

**Choose:** Option 1 (Install nginx on host)

**Result:** Production-ready setup with host nginx, ready for multiple apps!

---

Good luck with the migration! The intelligent script will guide you through everything. 🚀
