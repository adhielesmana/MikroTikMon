# Fresh Deployment Guide - MikroTik Network Monitoring Platform

This guide is for deploying the application on a **fresh server with a clean database**.

## Prerequisites

- **Operating System**: Ubuntu 20.04+ / Debian 11+
- **PostgreSQL**: Version 12+
- **Node.js**: Version 18+
- **Nginx**: For reverse proxy (optional but recommended)
- **Domain**: With DNS configured (for production)
- **SSL Certificate**: Let's Encrypt recommended

---

## Part 1: Database Setup

### 1.1 Install PostgreSQL

```bash
# Update package list
sudo apt update

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Verify installation
psql --version
```

### 1.2 Create Database and User

```bash
# Switch to postgres user
sudo -u postgres psql

# Create database
CREATE DATABASE mikrotik_monitor;

# Create user with password
CREATE USER mikrotik_user WITH ENCRYPTED PASSWORD 'your_secure_password_here';

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE mikrotik_monitor TO mikrotik_user;

# Grant schema privileges
\c mikrotik_monitor
GRANT ALL ON SCHEMA public TO mikrotik_user;

# Exit psql
\q
```

### 1.3 Initialize Database Schema

Run the fresh initialization script:

```bash
# Navigate to project directory
cd /path/to/mikrotik-monitor

# Run initialization SQL script
psql -h localhost -U mikrotik_user -d mikrotik_monitor -f migrations/00_fresh_init.sql
```

**Expected output:**
```
         id         |   username    |    email         | role  | is_superadmin | enabled |        created_at
--------------------+---------------+------------------+-------+---------------+---------+---------------------------
 super-admin-001    | adhielesmana  | adhielesmana@... | admin | t             | t       | 2024-01-01 00:00:00.000000
```

### 1.4 Verify Database Structure

```bash
# Connect to database
psql -h localhost -U mikrotik_user -d mikrotik_monitor

# List all tables
\dt

# Expected tables:
# alerts, app_settings, monitored_ports, notifications,
# router_groups, routers, sessions, traffic_data, users

# Verify superadmin user
SELECT id, username, email, role, is_superadmin, enabled FROM users WHERE is_superadmin = true;

# Exit
\q
```

---

## Part 2: Application Setup

### 2.1 Install Node.js

```bash
# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v18.x or higher
npm --version
```

### 2.2 Clone and Install Application

```bash
# Create application directory
sudo mkdir -p /opt/mikrotik-monitor
sudo chown $USER:$USER /opt/mikrotik-monitor

# Clone repository (or copy files)
cd /opt/mikrotik-monitor
git clone <your-repo-url> .

# Install dependencies
npm install

# Build application
npm run build
```

### 2.3 Configure Environment Variables

Create `.env` file:

```bash
nano /opt/mikrotik-monitor/.env
```

Add the following configuration:

```env
# Database Configuration
DATABASE_URL=postgresql://mikrotik_user:your_secure_password_here@localhost:5432/mikrotik_monitor
PGHOST=localhost
PGPORT=5432
PGUSER=mikrotik_user
PGPASSWORD=your_secure_password_here
PGDATABASE=mikrotik_monitor

# Session Secret (generate with: openssl rand -base64 32)
SESSION_SECRET=your_generated_session_secret_here

# SMTP Configuration (Optional - for email alerts)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-specific-password
SMTP_FROM_EMAIL=your-email@gmail.com

# Environment
NODE_ENV=production
PORT=5000
```

**Generate secure values:**

```bash
# Generate SESSION_SECRET
openssl rand -base64 32

# Generate database password
openssl rand -base64 24
```

### 2.4 Test Application

```bash
# Start application in development mode
cd /opt/mikrotik-monitor
npm run dev
```

Open browser and navigate to `http://your-server-ip:5000`

**Login credentials:**
- Username: `adhielesmana`
- Password: `admin123`

If successful, press `Ctrl+C` to stop and proceed to production setup.

---

## Part 3: Production Setup

### 3.1 Create Systemd Service

Create service file:

```bash
sudo nano /etc/systemd/system/mikrotik-monitor.service
```

Add the following content:

```ini
[Unit]
Description=MikroTik Network Monitoring Platform
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/mikrotik-monitor
EnvironmentFile=/opt/mikrotik-monitor/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=mikrotik-monitor

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/mikrotik-monitor

[Install]
WantedBy=multi-user.target
```

### 3.2 Set Permissions

```bash
# Set ownership
sudo chown -R www-data:www-data /opt/mikrotik-monitor

# Secure .env file
sudo chmod 600 /opt/mikrotik-monitor/.env
```

### 3.3 Enable and Start Service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service (auto-start on boot)
sudo systemctl enable mikrotik-monitor

# Start service
sudo systemctl start mikrotik-monitor

# Check status
sudo systemctl status mikrotik-monitor

# View logs
sudo journalctl -u mikrotik-monitor -f
```

**Expected log output:**
```
✓ Hardcoded superadmin account enabled (adhielesmana)
[Scheduler] Starting traffic monitoring scheduler...
serving on port 5000
```

---

## Part 4: Nginx Reverse Proxy (Recommended)

### 4.1 Install Nginx

```bash
sudo apt install -y nginx
```

### 4.2 Configure Nginx

Create configuration file:

```bash
sudo nano /etc/nginx/sites-available/mikrotik-monitor
```

Add the following configuration:

```nginx
# HTTP to HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name mon.maxnetplus.id;
    
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name mon.maxnetplus.id;

    # SSL Configuration (will be added by certbot)
    ssl_certificate /etc/letsencrypt/live/mon.maxnetplus.id/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mon.maxnetplus.id/privkey.pem;
    
    # SSL Security
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # File upload size
    client_max_body_size 10M;

    # Proxy to Node.js application
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        
        # Proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Logging
    access_log /var/log/nginx/mikrotik-monitor-access.log;
    error_log /var/log/nginx/mikrotik-monitor-error.log;
}
```

### 4.3 Enable Site

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/mikrotik-monitor /etc/nginx/sites-enabled/

# Test nginx configuration
sudo nginx -t

# If successful, reload nginx
sudo systemctl reload nginx
```

---

## Part 5: SSL Certificate (Let's Encrypt)

### 5.1 Install Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 5.2 Obtain Certificate

```bash
# Get certificate and auto-configure nginx
sudo certbot --nginx -d mon.maxnetplus.id

# Follow prompts:
# - Enter email address
# - Agree to Terms of Service
# - Choose whether to share email (optional)
# - Choose redirect option (2 - Redirect HTTP to HTTPS)
```

### 5.3 Auto-Renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Auto-renewal is configured via systemd timer
sudo systemctl status certbot.timer
```

---

## Part 6: Firewall Configuration

### 6.1 Configure UFW

```bash
# Install UFW
sudo apt install -y ufw

# Allow SSH (IMPORTANT - Don't lock yourself out!)
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

---

## Part 7: Verification & Testing

### 7.1 Verify Database

```bash
# Check superadmin account
psql -h localhost -U mikrotik_user -d mikrotik_monitor -c "SELECT id, username, is_superadmin FROM users WHERE is_superadmin = true;"

# Expected output:
#       id         |   username    | is_superadmin 
# -----------------+---------------+---------------
#  super-admin-001 | adhielesmana  | t
```

### 7.2 Verify Application

```bash
# Check service status
sudo systemctl status mikrotik-monitor

# Check logs for errors
sudo journalctl -u mikrotik-monitor -n 50 --no-pager

# Expected: "✓ Hardcoded superadmin account enabled (adhielesmana)"
```

### 7.3 Verify Web Access

1. **Open browser**: `https://mon.maxnetplus.id`
2. **Check database status**: Should show "Database: Connected" (green badge)
3. **Login**:
   - Username: `adhielesmana`
   - Password: `admin123`
4. **Verify superadmin access**:
   - "User Management" menu should be visible
   - User list should be accessible
   - Can promote/demote users

### 7.4 Test Router Connection

1. Navigate to "Routers" page
2. Click "Add Router"
3. Enter a test MikroTik router
4. Test connection
5. Verify traffic monitoring starts

---

## Part 8: Post-Deployment Tasks

### 8.1 Create Admin Users

1. Login as superadmin
2. Navigate to "User Management"
3. Click "Create User"
4. Fill in user details
5. Enable the user
6. User will receive temporary password (if SMTP configured)

### 8.2 Configure Monitoring

1. Add MikroTik routers
2. Create router groups for organization
3. Configure monitored ports
4. Set alert thresholds
5. Test email notifications

### 8.3 Change Superadmin Password (Recommended)

For security, change the default password:

```bash
# Connect to database
psql -h localhost -U mikrotik_user -d mikrotik_monitor

# Generate new bcrypt hash for a new password
# (Use an online bcrypt generator or Node.js)

# Update password
UPDATE users SET password_hash = '$2b$10$new_hash_here' WHERE id = 'super-admin-001';

# Exit
\q
```

Or use the web interface:
1. Login as adhielesmana
2. Go to Profile Settings
3. Change Password

---

## Part 9: Backup Strategy

### 9.1 Database Backup Script

Create backup script:

```bash
sudo nano /usr/local/bin/backup-mikrotik-monitor.sh
```

Add content:

```bash
#!/bin/bash
BACKUP_DIR="/backups/mikrotik-monitor"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="mikrotik_monitor"
DB_USER="mikrotik_user"

mkdir -p $BACKUP_DIR

# Create backup
pg_dump -h localhost -U $DB_USER $DB_NAME > $BACKUP_DIR/backup_$DATE.sql

# Compress backup
gzip $BACKUP_DIR/backup_$DATE.sql

# Keep only last 30 days
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete

echo "Backup completed: backup_$DATE.sql.gz"
```

Make executable:

```bash
sudo chmod +x /usr/local/bin/backup-mikrotik-monitor.sh
```

### 9.2 Schedule Backups

```bash
# Edit crontab
sudo crontab -e

# Add daily backup at 2 AM
0 2 * * * /usr/local/bin/backup-mikrotik-monitor.sh >> /var/log/mikrotik-backup.log 2>&1
```

### 9.3 Restore from Backup

```bash
# Uncompress backup
gunzip /backups/mikrotik-monitor/backup_20240101_020000.sql.gz

# Restore
psql -h localhost -U mikrotik_user -d mikrotik_monitor < /backups/mikrotik-monitor/backup_20240101_020000.sql
```

---

## Part 10: Monitoring & Maintenance

### 10.1 Monitor Application

```bash
# Real-time logs
sudo journalctl -u mikrotik-monitor -f

# Last 100 lines
sudo journalctl -u mikrotik-monitor -n 100 --no-pager

# Check service status
sudo systemctl status mikrotik-monitor
```

### 10.2 Monitor Nginx

```bash
# Check error logs
sudo tail -f /var/log/nginx/mikrotik-monitor-error.log

# Check access logs
sudo tail -f /var/log/nginx/mikrotik-monitor-access.log

# Check nginx status
sudo systemctl status nginx
```

### 10.3 Monitor Database

```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check database connections
psql -h localhost -U mikrotik_user -d mikrotik_monitor -c "SELECT count(*) FROM pg_stat_activity;"

# Check database size
psql -h localhost -U mikrotik_user -d mikrotik_monitor -c "SELECT pg_size_pretty(pg_database_size('mikrotik_monitor'));"
```

### 10.4 Update Application

```bash
# Stop service
sudo systemctl stop mikrotik-monitor

# Backup first!
/usr/local/bin/backup-mikrotik-monitor.sh

# Pull latest code
cd /opt/mikrotik-monitor
git pull origin main

# Install dependencies
npm install

# Build
npm run build

# Start service
sudo systemctl start mikrotik-monitor

# Check logs
sudo journalctl -u mikrotik-monitor -f
```

---

## Troubleshooting

### Database Connection Failed

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check database exists
sudo -u postgres psql -c "\l" | grep mikrotik_monitor

# Check user exists
sudo -u postgres psql -c "\du" | grep mikrotik_user

# Test connection
psql -h localhost -U mikrotik_user -d mikrotik_monitor -c "SELECT 1;"
```

### Application Won't Start

```bash
# Check logs for errors
sudo journalctl -u mikrotik-monitor -n 50 --no-pager

# Check permissions
ls -la /opt/mikrotik-monitor

# Check .env file
sudo cat /opt/mikrotik-monitor/.env

# Try running manually
cd /opt/mikrotik-monitor
npm run dev
```

### Nginx Issues

```bash
# Test configuration
sudo nginx -t

# Check logs
sudo tail -f /var/log/nginx/error.log

# Restart nginx
sudo systemctl restart nginx
```

---

## Security Checklist

- ✅ Database password is strong and unique
- ✅ SESSION_SECRET is randomly generated (32+ characters)
- ✅ HTTPS is enabled with valid SSL certificate
- ✅ Firewall is configured (only ports 22, 80, 443 open)
- ✅ PostgreSQL only listens on localhost
- ✅ Application runs as www-data (non-root)
- ✅ `.env` file has restricted permissions (600)
- ✅ Automated backups are configured
- ✅ Superadmin password changed from default
- ✅ Security headers configured in nginx

---

## Quick Command Reference

```bash
# Service Management
sudo systemctl start mikrotik-monitor
sudo systemctl stop mikrotik-monitor
sudo systemctl restart mikrotik-monitor
sudo systemctl status mikrotik-monitor

# Logs
sudo journalctl -u mikrotik-monitor -f
sudo journalctl -u mikrotik-monitor -n 100 --no-pager

# Database
psql -h localhost -U mikrotik_user -d mikrotik_monitor
sudo -u postgres psql

# Nginx
sudo nginx -t
sudo systemctl reload nginx
sudo tail -f /var/log/nginx/mikrotik-monitor-error.log

# Backup
/usr/local/bin/backup-mikrotik-monitor.sh

# SSL
sudo certbot renew
sudo certbot certificates
```

---

**Deployment Complete!** 🚀

Access your monitoring platform at: **https://mon.maxnetplus.id**

Default login:
- Username: `adhielesmana`
- Password: `admin123`

**Remember to change the default password after first login!**
