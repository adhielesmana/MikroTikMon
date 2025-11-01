# Production Deployment Guide

This guide explains how to set up and manage your MikroTik Monitor in production.

## 🚀 Initial Production Setup

### Step 1: Pull Latest Code

```bash
cd /path/to/your/app
git pull origin main
```

### Step 2: Run Production Setup Script

```bash
./scripts/setup-production.sh
```

This script will:
- ✅ Find your PostgreSQL Docker container
- ✅ Verify database connection
- ✅ Check if users table exists
- ✅ Create the default admin user
- ✅ Set admin credentials to `admin` / `admin`

### Step 3: Login

Visit your production URL:
```
http://YOUR_SERVER_IP:5000/login
```

**Default Credentials:**
- Username: `admin`
- Password: `admin`

⚠️ **You will be forced to change the password on first login!**

---

## 🔄 Updating Production

When you pull new code from GitHub:

```bash
# Pull latest changes
git pull origin main

# Restart your application
docker-compose restart app
# OR
docker restart <your_app_container>
```

The database schema updates automatically when the app starts (if using migrations).

---

## 🗄️ Database Management

### Check Database Status

```bash
# Find postgres container
docker ps | grep postgres

# Connect to database
docker exec -it <postgres_container> psql -U mikrotik_user -d mikrotik_monitor

# List all tables
\dt

# Check users
SELECT id, username, email, role, enabled FROM users;

# Exit
\q
```

### Reset Admin Password

If you forget the admin password:

```bash
./scripts/reset-admin-password.sh
```

Or manually:

```bash
POSTGRES_CONTAINER=$(docker ps --format '{{.Names}}' | grep -i postgres | head -1)
docker exec -i "$POSTGRES_CONTAINER" psql -U mikrotik_user -d mikrotik_monitor << 'EOF'
UPDATE users 
SET password_hash = '$2b$10$cMvOUlC.MTj7ynM.j/JyMu4IfHEsTjHYTTJBNAmTklFZ9wxTUJP1O',
    must_change_password = true
WHERE id = 'super-admin-001';
EOF
```

This resets the password to `admin`.

---

## 📊 Migrating Data from Development

If you want to copy all data from development to production:

### On Development (Replit):

```bash
# Export development database
./scripts/export-dev-db.sh
```

This creates: `backups/dev_database_YYYYMMDD_HHMMSS.dump`

### Transfer to Production:

```bash
# From your local machine
scp backups/dev_database_*.dump user@YOUR_SERVER_IP:/tmp/
```

### On Production Server:

```bash
# Find postgres container
POSTGRES_CONTAINER=$(docker ps --format '{{.Names}}' | grep -i postgres | head -1)

# Import database
docker exec -i "$POSTGRES_CONTAINER" pg_restore \
  -U mikrotik_user \
  -d mikrotik_monitor \
  --clean --if-exists \
  < /tmp/dev_database_*.dump

# Restart app
docker-compose restart app
```

---

## 🔐 Environment Variables

Make sure these are set in your production environment:

```bash
# Database connection
DATABASE_URL=postgresql://mikrotik_user:PASSWORD@postgres:5432/mikrotik_monitor

# Session secret (generate a random string)
SESSION_SECRET=your-random-secret-here

# Node environment
NODE_ENV=production

# Optional: Email notifications
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
SMTP_FROM_EMAIL=noreply@example.com
```

---

## 🐛 Troubleshooting

### Login fails with "Authentication error"

**Solution 1: Check if admin user exists**
```bash
POSTGRES_CONTAINER=$(docker ps --format '{{.Names}}' | grep -i postgres | head -1)
docker exec -i "$POSTGRES_CONTAINER" psql -U mikrotik_user -d mikrotik_monitor \
  -c "SELECT id, username FROM users WHERE id = 'super-admin-001';"
```

If no results, run: `./scripts/setup-production.sh`

**Solution 2: Check app logs**
```bash
docker logs <your_app_container> --tail 100
```

### "Table users does not exist"

This means the database schema hasn't been created.

**Solution:**
```bash
# Option A: Run migrations in app container
docker exec -it <app_container> npm run db:push -- --force

# Option B: Import schema from development
# (See "Migrating Data from Development" section above)
```

### "Could not find postgres container"

**Solution:**
```bash
# List all containers
docker ps

# Set manually
export POSTGRES_CONTAINER=<your_postgres_container_name>

# Then run setup script
./scripts/setup-production.sh
```

### App can't connect to database

**Solution:**
```bash
# Check if postgres is running
docker ps | grep postgres

# Check database URL in app
docker exec <app_container> env | grep DATABASE_URL

# Test connection from app container
docker exec <app_container> psql "$DATABASE_URL" -c "SELECT 1;"
```

---

## 📋 Regular Maintenance

### Backup Production Database

```bash
# Create backup directory
mkdir -p /backups

# Backup database
POSTGRES_CONTAINER=$(docker ps --format '{{.Names}}' | grep -i postgres | head -1)
docker exec "$POSTGRES_CONTAINER" pg_dump \
  -U mikrotik_user \
  -d mikrotik_monitor \
  -Fc \
  > /backups/production_$(date +%Y%m%d_%H%M%S).dump
```

### View Application Logs

```bash
# Real-time logs
docker logs -f <app_container>

# Last 100 lines
docker logs <app_container> --tail 100

# Search for errors
docker logs <app_container> 2>&1 | grep -i error
```

### Restart Application

```bash
# Using docker-compose
docker-compose restart app

# Using docker directly
docker restart <app_container>
```

---

## 🎯 Quick Reference

| Task | Command |
|------|---------|
| Initial setup | `./scripts/setup-production.sh` |
| Reset admin password | `./scripts/reset-admin-password.sh` |
| Pull updates | `git pull origin main` |
| Restart app | `docker-compose restart app` |
| View logs | `docker logs <app_container> --tail 100` |
| Backup database | `docker exec <postgres> pg_dump ... > backup.dump` |
| Connect to database | `docker exec -it <postgres> psql -U mikrotik_user -d mikrotik_monitor` |

---

## 📞 Support

For issues or questions:
1. Check application logs: `docker logs <app_container>`
2. Check database connection: `docker exec <postgres> psql ...`
3. Review this guide for common issues
4. Check the main README.md for development setup

---

**Last Updated:** November 1, 2025
