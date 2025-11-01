# MikroTik Monitor - Deployment Guide

Complete guide for deploying MikroTik Monitor using Docker on your own server.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Detailed Setup](#detailed-setup)
- [Configuration](#configuration)
- [Deployment Commands](#deployment-commands)
- [Production Setup](#production-setup)
- [Backup & Restore](#backup--restore)
- [Troubleshooting](#troubleshooting)
- [Security Best Practices](#security-best-practices)

---

## Prerequisites

### System Requirements

- **OS**: Linux (Ubuntu 20.04+, Debian 11+, CentOS 8+) or macOS
- **RAM**: Minimum 2GB, Recommended 4GB+
- **Disk**: 10GB+ free space
- **Docker**: Version 20.10+
- **Docker Compose**: Version 2.0+

### Install Docker

**Ubuntu/Debian:**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

**CentOS/RHEL:**
```bash
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo yum install docker-ce docker-ce-cli containerd.io
sudo systemctl start docker
sudo systemctl enable docker
```

**macOS:**
```bash
brew install --cask docker
```

Verify installation:
```bash
docker --version
docker compose version
```

---

## Quick Start

### 1. Download the Project

```bash
# Clone the repository or download the files
git clone <your-repo-url> mikrotik-monitor
cd mikrotik-monitor
```

### 2. Run Setup Script

```bash
./setup.sh
```

This will:
- Create `.env` configuration file
- Generate secure passwords and secrets
- Set up required directories
- Optionally configure email notifications

⚠️ **Important:** You **must** run `./setup.sh` before deploying. The Docker Compose configuration requires a properly configured `.env` file and will fail with clear error messages if environment variables are missing.

### 3. Deploy the Application

```bash
./deploy.sh up
```

**Note:** If you get a "port already in use" error on port 5432, this is normal in development environments. The database port is not exposed externally by default for security. The application container connects to the database internally via Docker networking.

If you need external database access for debugging, see the "Database Access" section below.

### 4. Access the Application

Open your browser and navigate to:
- **http://localhost:5000** (or your server IP)

---

## Detailed Setup

### Step 1: Initial Configuration

The `setup.sh` script creates a `.env` file from `.env.example` and generates secure credentials.

**Manual Setup (Alternative):**
```bash
# Copy example file
cp .env.example .env

# Edit configuration
nano .env
```

**Generate secure values:**
```bash
# Generate SESSION_SECRET
openssl rand -base64 32

# Generate database password
openssl rand -base64 24
```

### Step 2: Email Configuration (Optional)

For alert notifications, configure SMTP settings in `.env`:

**Gmail Example:**
1. Enable 2-factor authentication
2. Create an App Password: https://myaccount.google.com/apppasswords
3. Update `.env`:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   SMTP_FROM_EMAIL=your-email@gmail.com
   ```

**Other Providers:**
- **Outlook**: smtp.office365.com:587
- **Yahoo**: smtp.mail.yahoo.com:587
- **SendGrid**: smtp.sendgrid.net:587
- **Mailgun**: smtp.mailgun.org:587

---

## Configuration

### Environment Variables

Key variables in `.env`:

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PGDATABASE` | Database name | Yes | mikrotik_monitor |
| `PGUSER` | Database user | Yes | mikrotik_user |
| `PGPASSWORD` | Database password | Yes | - |
| `SESSION_SECRET` | Session encryption key | Yes | - |
| `APP_PORT` | Application port | No | 5000 |
| `SMTP_HOST` | Email server | No | - |
| `SMTP_PORT` | Email port | No | 587 |
| `SMTP_USER` | Email username | No | - |
| `SMTP_PASS` | Email password | No | - |

### Port Configuration

Default ports:
- **5000**: Application (HTTP)
- **5432**: PostgreSQL (if exposed)
- **80/443**: Nginx (if using reverse proxy)

To change the application port:
```env
APP_PORT=8080
```

Then access via: http://localhost:8080

---

## Deployment Commands

### Basic Commands

```bash
# Start the application
./deploy.sh up

# Stop the application
./deploy.sh stop

# Restart the application
./deploy.sh restart

# View logs
./deploy.sh logs

# Check status
./deploy.sh status
```

### Advanced Commands

```bash
# Update to latest version
./deploy.sh update

# Create database backup
./deploy.sh backup

# Restore from backup
./deploy.sh restore backup_20240101_120000.sql

# Clean up (removes all data!)
./deploy.sh clean

# Open application shell
./deploy.sh shell

# Open database shell
./deploy.sh db-shell
```

### With Nginx Reverse Proxy

```bash
# Deploy with Nginx
./deploy.sh up --with-nginx

# Access via:
# http://localhost (Nginx)
# http://localhost:5000 (Direct)
```

---

## Database Access

### Security Note
By default, the PostgreSQL database is **NOT exposed** on any external port for security. The application container connects to the database internally via Docker networking.

### For Debugging/Development

If you need direct database access for debugging:

1. **Edit docker-compose.yml** - Uncomment the ports section for the `postgres` service:
   ```yaml
   ports:
     - "${POSTGRES_PORT:-5432}:5432"
   ```

2. **Edit .env** - Set a different port if 5432 is already in use:
   ```env
   POSTGRES_PORT=5433
   ```

3. **Restart containers:**
   ```bash
   ./deploy.sh restart
   ```

4. **Connect with any PostgreSQL client:**
   ```bash
   psql -h localhost -p 5433 -U mikrotik_user -d mikrotik_monitor
   ```

### Using Docker Shell (Recommended)

Instead of exposing ports, use the built-in shell access:

```bash
# Open database shell directly
./deploy.sh db-shell

# Then run SQL commands
\dt              # List tables
\d users         # Describe users table
SELECT * FROM users;
```

---

## Production Setup

### 1. Domain & DNS

Point your domain to your server:
```
A record: yourdomain.com -> your.server.ip.address
```

### 2. Nginx with SSL (Let's Encrypt)

First, deploy with Nginx:
```bash
./deploy.sh up --with-nginx
```

Then set up SSL:
```bash
# Install certbot
sudo apt update
sudo apt install certbot

# Get SSL certificate
sudo certbot certonly --standalone -d yourdomain.com

# Copy certificates
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ssl/
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ssl/
sudo chmod 644 ssl/*.pem

# Restart nginx
docker compose restart nginx
```

### 3. Firewall Configuration

```bash
# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Optional: Allow SSH
sudo ufw allow 22/tcp

# Enable firewall
sudo ufw enable
```

### 4. Auto-Start on Boot

Docker containers are configured with `restart: unless-stopped`, so they'll automatically start on system reboot.

To manage Docker service:
```bash
sudo systemctl enable docker
sudo systemctl start docker
```

### 5. Monitoring & Logs

View application logs:
```bash
./deploy.sh logs

# Or specific service
docker compose logs -f app
docker compose logs -f postgres
```

System resource usage:
```bash
docker stats
```

---

## Backup & Restore

### Automated Backups

Create a backup script:
```bash
#!/bin/bash
# backup-daily.sh

BACKUP_DIR="/backups/mikrotik-monitor"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
cd /path/to/mikrotik-monitor

./deploy.sh backup
mv backup_*.sql $BACKUP_DIR/backup_$DATE.sql

# Keep only last 30 days
find $BACKUP_DIR -name "backup_*.sql" -mtime +30 -delete
```

Add to crontab:
```bash
# Run daily at 2 AM
0 2 * * * /path/to/backup-daily.sh
```

### Manual Backup

```bash
./deploy.sh backup
```

This creates: `backup_YYYYMMDD_HHMMSS.sql`

### Restore from Backup

```bash
./deploy.sh restore backup_20240101_120000.sql
```

### Full System Backup

```bash
# Backup configuration
tar -czf config-backup.tar.gz .env docker-compose.yml

# Backup data volumes
docker run --rm \
  -v mikrotik-monitor_postgres_data:/data \
  -v $(pwd):/backup \
  alpine tar -czf /backup/data-backup.tar.gz /data
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs
./deploy.sh logs

# Check status
docker compose ps

# Restart
./deploy.sh restart
```

### Database Connection Errors

```bash
# Check database is running
docker compose ps postgres

# Check database logs
docker compose logs postgres

# Restart database
docker compose restart postgres
```

### Port Already in Use

```bash
# Find what's using port 5000
sudo lsof -i :5000

# Change port in .env
APP_PORT=8080

# Restart
./deploy.sh restart
```

### Permission Errors

```bash
# Fix ownership
sudo chown -R $USER:$USER .

# Fix script permissions
chmod +x setup.sh deploy.sh
```

### Migration Errors

```bash
# Force migrations
docker compose exec app npm run db:push --force

# Or reset database (warning: deletes all data!)
./deploy.sh clean
./deploy.sh up
```

### SSL Certificate Issues

```bash
# Test SSL renewal
sudo certbot renew --dry-run

# Auto-renew setup (crontab)
0 3 * * * certbot renew --quiet --post-hook "docker compose restart nginx"
```

---

## Security Best Practices

### 1. Secure Your .env File

```bash
# Set proper permissions
chmod 600 .env

# Never commit to git
echo ".env" >> .gitignore
```

### 2. Use Strong Passwords

```bash
# Generate strong password
openssl rand -base64 32
```

### 3. Keep Docker Updated

```bash
sudo apt update
sudo apt upgrade docker-ce docker-ce-cli
```

### 4. Regular Backups

Set up automated daily backups (see Backup section).

### 5. Enable Firewall

```bash
sudo ufw enable
sudo ufw allow 22,80,443/tcp
```

### 6. Monitor Logs

```bash
# Check for suspicious activity
./deploy.sh logs | grep -i error
./deploy.sh logs | grep -i unauthorized
```

### 7. Update Application

```bash
# Regular updates
./deploy.sh update
```

### 8. Secure Nginx

Add security headers in `nginx.conf`:
```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
```

---

## Performance Optimization

### Increase Docker Resources

Edit `/etc/docker/daemon.json`:
```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

Restart Docker:
```bash
sudo systemctl restart docker
```

### Database Optimization

```bash
# Connect to database
./deploy.sh db-shell

# Run vacuum
VACUUM ANALYZE;
```

---

## Support

For issues and questions:
- Check logs: `./deploy.sh logs`
- Review this guide
- Check Docker documentation: https://docs.docker.com

---

## Quick Reference

```bash
# Setup
./setup.sh                              # Initial configuration
./deploy.sh up                          # Start application
./deploy.sh up --with-nginx             # Start with Nginx

# Management
./deploy.sh stop                        # Stop application
./deploy.sh restart                     # Restart application
./deploy.sh logs                        # View logs
./deploy.sh status                      # Check status

# Maintenance
./deploy.sh update                      # Update application
./deploy.sh backup                      # Backup database
./deploy.sh restore <file>              # Restore database
./deploy.sh clean                       # Remove all (WARNING!)

# Debugging
./deploy.sh shell                       # App container shell
./deploy.sh db-shell                    # Database shell
docker compose ps                       # Container status
docker stats                            # Resource usage
```

---

**Happy Monitoring!** 🚀
