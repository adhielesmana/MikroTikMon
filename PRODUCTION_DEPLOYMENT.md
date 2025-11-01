# Production Deployment Instructions

## 🚀 Quick Deployment

### Step 1: Pull Latest Code

```bash
cd /path/to/your/app
git pull origin main
```

### Step 2: Stop Current Containers

```bash
docker-compose down
```

### Step 3: Use the Correct Configuration

```bash
# Use the production docker-compose file
docker-compose -f docker-compose.prod.yml up -d
```

### Step 4: Wait for Containers to Start

```bash
# Check container status
docker-compose -f docker-compose.prod.yml ps

# Wait until both are healthy
# App should show "Up (healthy)"
# DB should show "Up (healthy)"
```

### Step 5: Create Database Schema

```bash
# Run database migrations
docker exec -it mikrotik-monitor-app npm run db:push -- --force
```

### Step 6: Create Admin User

```bash
# Run the setup script
./scripts/setup-production.sh
```

### Step 7: Login

Visit: http://203.175.11.12:5000/login

**Credentials:**
- Username: `admin`
- Password: `admin`

You'll be forced to change the password on first login.

---

## 🔧 Configuration Details

### Database Connection

The correct DATABASE_URL format:
```
postgresql://mikrotik_user:PASSWORD@mikrotik-monitor-db:5432/mikrotik_monitor
                                     ^^^^^^^^^^^^^^^^^^^^
                                     This must match your database container name!
```

**Common mistake:** Using `@postgres:5432` instead of `@mikrotik-monitor-db:5432`

### Container Names

From `docker-compose.prod.yml`:
- App container: `mikrotik-monitor-app`
- Database container: `mikrotik-monitor-db`
- Network: `mikrotik-network`

---

## 🔍 Troubleshooting

### Issue: "Cannot connect to database"

**Cause:** DATABASE_URL has wrong hostname

**Fix:** Check docker-compose.prod.yml and ensure DATABASE_URL uses `mikrotik-monitor-db` as the host.

### Issue: "Table users does not exist"

**Cause:** Database schema not created

**Fix:**
```bash
docker exec -it mikrotik-monitor-app npm run db:push -- --force
```

### Issue: "Login failed - authentication error"

**Cause:** Admin user doesn't exist

**Fix:**
```bash
./scripts/setup-production.sh
```

### Issue: App shows "unhealthy"

**Cause:** App can't start or can't connect to database

**Check logs:**
```bash
docker logs mikrotik-monitor-app --tail 100
```

**Common fixes:**
1. Restart containers: `docker-compose -f docker-compose.prod.yml restart`
2. Check DATABASE_URL is correct
3. Ensure database is running: `docker ps | grep postgres`

---

## 📋 Useful Commands

### View Logs
```bash
# App logs
docker logs mikrotik-monitor-app -f

# Database logs
docker logs mikrotik-monitor-db -f

# All logs
docker-compose -f docker-compose.prod.yml logs -f
```

### Restart Services
```bash
# Restart everything
docker-compose -f docker-compose.prod.yml restart

# Restart just app
docker restart mikrotik-monitor-app

# Restart just database
docker restart mikrotik-monitor-db
```

### Check Status
```bash
# Container status
docker-compose -f docker-compose.prod.yml ps

# Detailed health
docker inspect mikrotik-monitor-app | grep -A 10 Health
```

### Database Operations
```bash
# Connect to database
docker exec -it mikrotik-monitor-db psql -U mikrotik_user -d mikrotik_monitor

# Check if tables exist
docker exec -it mikrotik-monitor-db psql -U mikrotik_user -d mikrotik_monitor -c "\dt"

# Check admin user
docker exec -it mikrotik-monitor-db psql -U mikrotik_user -d mikrotik_monitor -c "SELECT id, username, role FROM users WHERE id = 'super-admin-001';"
```

### Reset Everything (Nuclear Option)
```bash
# WARNING: This deletes all data!
docker-compose -f docker-compose.prod.yml down -v
docker-compose -f docker-compose.prod.yml up -d
docker exec -it mikrotik-monitor-app npm run db:push -- --force
./scripts/setup-production.sh
```

---

## 🔐 Security Notes

1. **Change SESSION_SECRET**: Generate a random secret:
   ```bash
   openssl rand -hex 32
   ```
   Then update it in docker-compose.prod.yml

2. **Database Password**: Change the default password in production:
   - Update POSTGRES_PASSWORD in docker-compose.prod.yml
   - Update password in DATABASE_URL
   - Recreate containers

3. **Firewall**: Ensure only port 5000 is exposed to the internet

---

## 📊 Health Checks

The docker-compose file includes health checks:

**App Health Check:**
- Checks: http://localhost:5000/api/health
- Interval: Every 30 seconds
- Healthy after: 3 successful checks

**Database Health Check:**
- Checks: PostgreSQL is ready
- Interval: Every 10 seconds  
- Healthy after: 5 successful checks

View health status:
```bash
docker ps
```

Look for "(healthy)" or "(unhealthy)" in the STATUS column.

---

## 🎯 Quick Reference

| Task | Command |
|------|---------|
| Deploy | `git pull && docker-compose -f docker-compose.prod.yml up -d` |
| View logs | `docker logs mikrotik-monitor-app -f` |
| Restart | `docker-compose -f docker-compose.prod.yml restart` |
| Setup admin | `./scripts/setup-production.sh` |
| Check status | `docker-compose -f docker-compose.prod.yml ps` |
| Database shell | `docker exec -it mikrotik-monitor-db psql -U mikrotik_user -d mikrotik_monitor` |

---

**Last Updated:** November 1, 2025
