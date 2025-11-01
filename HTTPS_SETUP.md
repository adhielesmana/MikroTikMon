# 🔒 HTTPS Setup Guide for mon.maxnetplus.id

Complete guide to enable HTTPS with Let's Encrypt SSL certificate for your MikroTik Monitor.

---

## ⚠️ Prerequisites

Before starting, ensure:
- [ ] Domain `mon.maxnetplus.id` DNS points to your server IP (203.175.11.12)
- [ ] Ports 80 and 443 are open on your firewall
- [ ] Application is currently running (can be HTTP for now)

---

## 📋 Step-by-Step Setup

### Step 1: Verify DNS Configuration

```bash
# Check if domain points to your server
dig mon.maxnetplus.id +short

# Should return: 203.175.11.12
```

If it doesn't, update your DNS:
- Go to your DNS provider (e.g., Cloudflare, GoDaddy)
- Add/update A record:
  - **Type:** A
  - **Name:** mon
  - **Value:** 203.175.11.12
  - **TTL:** Auto or 300

Wait 5-15 minutes for DNS propagation.

---

### Step 2: Stop Application (Temporarily)

```bash
cd ~/MikroTikMon
./deploy.sh down
```

We need port 80 available for Let's Encrypt verification.

---

### Step 3: Install Certbot (Let's Encrypt Client)

```bash
# Update package list
sudo apt update

# Install Certbot and Nginx plugin
sudo apt install certbot python3-certbot-nginx -y
```

---

### Step 4: Obtain SSL Certificate

```bash
# Get SSL certificate for your domain
sudo certbot certonly --standalone \
  -d mon.maxnetplus.id \
  --agree-tos \
  --email your-email@example.com \
  --non-interactive

# Replace 'your-email@example.com' with your actual email
```

**Expected Output:**
```
Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/mon.maxnetplus.id/fullchain.pem
Key is saved at:         /etc/letsencrypt/live/mon.maxnetplus.id/privkey.pem
```

---

### Step 5: Copy SSL Certificates to Project

```bash
cd ~/MikroTikMon

# Create ssl directory (if not exists)
mkdir -p ssl

# Copy certificates (requires sudo)
sudo cp /etc/letsencrypt/live/mon.maxnetplus.id/fullchain.pem ssl/
sudo cp /etc/letsencrypt/live/mon.maxnetplus.id/privkey.pem ssl/

# Set proper permissions
sudo chown $USER:$USER ssl/*.pem
chmod 644 ssl/fullchain.pem
chmod 600 ssl/privkey.pem
```

---

### Step 6: Update Nginx Configuration

Edit `nginx.conf` and change the domain:

```bash
cd ~/MikroTikMon
nano nginx.conf
```

Find this line (around line 58 and 75):
```nginx
server_name _;
```

Replace **both occurrences** with your domain:
```nginx
server_name mon.maxnetplus.id;
```

**Save and exit:** Ctrl+X, then Y, then Enter

---

### Step 7: Update Environment Configuration

Edit `.env` file:

```bash
nano .env
```

Update these lines:
```bash
# Change APP_URL to use HTTPS and your domain
APP_URL=https://mon.maxnetplus.id

# Enable secure cookies for HTTPS
USE_SECURE_COOKIES=true
```

**Save and exit:** Ctrl+X, then Y, then Enter

---

### Step 8: Update Google OAuth (If Configured)

If you're using Google OAuth, update the callback URL:

1. Go to: https://console.cloud.google.com/apis/credentials
2. Find your OAuth 2.0 Client ID
3. Under "Authorized redirect URIs", update to:
   ```
   https://mon.maxnetplus.id/api/auth/google/callback
   ```
4. Save changes

---

### Step 9: Deploy with Nginx and HTTPS

```bash
cd ~/MikroTikMon

# Deploy with Nginx reverse proxy
./deploy.sh up --with-nginx

# Wait for deployment to complete (30-60 seconds)
```

---

### Step 10: Verify HTTPS is Working

```bash
# Test HTTPS endpoint
curl -I https://mon.maxnetplus.id

# Should return: HTTP/2 200
```

**Open browser:**
```
https://mon.maxnetplus.id
```

You should see:
- ✅ Padlock icon in address bar
- ✅ "Secure" or "Connection is secure"
- ✅ Login page loads

---

## 🔄 Certificate Auto-Renewal

Let's Encrypt certificates expire after 90 days. Set up automatic renewal:

### Create Renewal Script

```bash
sudo nano /usr/local/bin/renew-ssl.sh
```

Add this content:
```bash
#!/bin/bash
# Renew Let's Encrypt certificates and update Docker container

# Stop Nginx to free port 80
cd /home/YOUR_USERNAME/MikroTikMon
docker compose --profile with-nginx stop nginx

# Renew certificate
certbot renew --standalone --quiet

# Copy updated certificates
cp /etc/letsencrypt/live/mon.maxnetplus.id/fullchain.pem ssl/
cp /etc/letsencrypt/live/mon.maxnetplus.id/privkey.pem ssl/
chown YOUR_USERNAME:YOUR_USERNAME ssl/*.pem
chmod 644 ssl/fullchain.pem
chmod 600 ssl/privkey.pem

# Restart Nginx
docker compose --profile with-nginx start nginx

echo "SSL certificate renewed: $(date)" >> /var/log/ssl-renewal.log
```

**Replace `YOUR_USERNAME` with your actual username!**

Make it executable:
```bash
sudo chmod +x /usr/local/bin/renew-ssl.sh
```

### Set Up Cron Job

```bash
sudo crontab -e
```

Add this line (runs every month at 3 AM):
```cron
0 3 1 * * /usr/local/bin/renew-ssl.sh >> /var/log/ssl-renewal.log 2>&1
```

Save and exit.

---

## 🔥 Firewall Configuration

Ensure your firewall allows HTTPS traffic:

```bash
# If using UFW
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable
sudo ufw status

# If using iptables
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT
sudo iptables-save > /etc/iptables/rules.v4
```

**Important:** If your server is behind a router/gateway, configure port forwarding:
- Forward external port 80 → 203.175.11.12:80
- Forward external port 443 → 203.175.11.12:443

---

## ✅ Verification Checklist

After setup, verify everything works:

- [ ] DNS resolves: `dig mon.maxnetplus.id +short` returns 203.175.11.12
- [ ] HTTP redirects to HTTPS: `curl -I http://mon.maxnetplus.id` returns 301
- [ ] HTTPS works: `curl -I https://mon.maxnetplus.id` returns 200
- [ ] Browser shows padlock icon
- [ ] Certificate is valid: Click padlock → Valid until (3 months from now)
- [ ] Login works via HTTPS
- [ ] WebSocket connects (real-time updates work)
- [ ] All features work (routers, graphs, alerts)

---

## 🐛 Troubleshooting

### Issue: "NET::ERR_CERT_AUTHORITY_INVALID"

**Cause:** Certificate not trusted or domain mismatch

**Solution:**
```bash
# Check certificate
sudo certbot certificates

# Verify domain in certificate
openssl x509 -in ssl/fullchain.pem -text -noout | grep DNS

# Should show: DNS:mon.maxnetplus.id
```

If domain is wrong, re-run Step 4 with correct domain.

---

### Issue: "Connection Refused" on HTTPS

**Cause:** Port 443 not open or Nginx not running

**Solution:**
```bash
# Check if Nginx is running
docker ps | grep nginx

# Check firewall
sudo ufw status

# Check Nginx logs
docker logs mikrotik-monitor-nginx
```

---

### Issue: "Too Many Redirects"

**Cause:** Redirect loop between HTTP and HTTPS

**Solution:**
Check `.env` has:
```bash
APP_URL=https://mon.maxnetplus.id
USE_SECURE_COOKIES=true
```

Restart:
```bash
./deploy.sh restart
```

---

### Issue: Certificate Expired

**Cause:** Auto-renewal didn't work

**Solution:**
```bash
# Manually renew
cd ~/MikroTikMon
docker compose --profile with-nginx stop nginx
sudo certbot renew
./deploy.sh up --with-nginx
```

---

### Issue: "404 Not Found" after HTTPS setup

**Cause:** Nginx configuration issue

**Solution:**
```bash
# Test Nginx config
docker exec mikrotik-monitor-nginx nginx -t

# View Nginx logs
docker logs mikrotik-monitor-nginx --tail 50

# Restart Nginx
docker compose --profile with-nginx restart nginx
```

---

## 📊 Monitoring HTTPS

### Check Certificate Expiration

```bash
# View certificate details
sudo certbot certificates

# Check expiration date
openssl x509 -in ssl/fullchain.pem -noout -enddate
```

### Test SSL Configuration

Use online tools:
- SSL Labs: https://www.ssllabs.com/ssltest/analyze.html?d=mon.maxnetplus.id
- Should get A+ rating

---

## 🔄 Updating Application with HTTPS

When updating your application:

```bash
cd ~/MikroTikMon

# Pull latest changes
git pull origin main

# Update with Nginx
./deploy.sh update --with-nginx
```

The `--with-nginx` flag ensures Nginx stays running with HTTPS.

---

## 🎯 Quick Command Reference

```bash
# View SSL certificates
sudo certbot certificates

# Renew certificates manually
sudo certbot renew

# Check Nginx status
docker ps | grep nginx

# View Nginx logs
docker logs mikrotik-monitor-nginx

# Restart Nginx only
docker compose --profile with-nginx restart nginx

# Restart everything
./deploy.sh restart

# Test HTTPS
curl -I https://mon.maxnetplus.id
```

---

## 📝 What Changed

### Before (HTTP Only)
```
http://203.175.11.12:5000
```
- ❌ No encryption
- ❌ Browsers show "Not Secure"
- ❌ Data transmitted in plain text

### After (HTTPS)
```
https://mon.maxnetplus.id
```
- ✅ Full encryption (TLS 1.2/1.3)
- ✅ Browsers show padlock icon
- ✅ Data encrypted end-to-end
- ✅ Professional domain name
- ✅ Automatic HTTP → HTTPS redirect
- ✅ Secure session cookies

---

## 🎓 Understanding the Setup

### What is Let's Encrypt?
Free, automated certificate authority that issues SSL/TLS certificates trusted by all browsers.

### What is Certbot?
Official Let's Encrypt client that automates certificate issuance and renewal.

### What is Nginx?
High-performance reverse proxy that:
- Terminates SSL/TLS (handles encryption)
- Proxies requests to your app (port 5000)
- Serves static files efficiently
- Provides DDoS protection (rate limiting)
- Caches responses

### Architecture
```
Internet → Port 443 (HTTPS) → Nginx Container → App Container (port 5000)
                ↓
         SSL Certificate
         (Let's Encrypt)
```

---

## 🔐 Security Best Practices

### ✅ Already Configured
- Modern TLS protocols (1.2, 1.3)
- Strong cipher suites
- HSTS header (force HTTPS)
- X-Frame-Options (prevent clickjacking)
- X-Content-Type-Options (prevent MIME sniffing)
- Rate limiting (prevent DDoS)

### Additional Recommendations
- Keep system updated: `sudo apt update && sudo apt upgrade`
- Monitor certificate expiration
- Review access logs regularly
- Use strong passwords
- Enable 2FA on admin accounts
- Regular database backups

---

## 📞 Support

If you encounter issues:

1. **Check logs:**
   ```bash
   ./deploy.sh logs
   docker logs mikrotik-monitor-nginx
   ```

2. **Verify configuration:**
   ```bash
   docker exec mikrotik-monitor-nginx nginx -t
   cat .env | grep -E 'APP_URL|USE_SECURE_COOKIES'
   ```

3. **Test connectivity:**
   ```bash
   curl -I https://mon.maxnetplus.id
   openssl s_client -connect mon.maxnetplus.id:443
   ```

---

## 🎉 Success!

Once complete, your MikroTik Monitor will be accessible at:

**https://mon.maxnetplus.id**

With:
- ✅ Full HTTPS encryption
- ✅ Valid SSL certificate
- ✅ Professional domain name
- ✅ Auto-renewal configured
- ✅ Secure session cookies
- ✅ Production-ready security

---

**Last Updated:** November 1, 2025  
**Domain:** mon.maxnetplus.id  
**Server IP:** 203.175.11.12
