# 🚨 URGENT: Restore Your Database NOW

Your database was lost after deployment. Here's how to restore it:

## Option 1: SSH Restore (FASTEST - 2 minutes)

```bash
# 1. SSH to production
ssh root@mon.maxnetplus.id

# 2. Go to project directory
cd /root/MikroTikMon

# 3. Load environment
source .env

# 4. Stop app (keep database running)
docker compose stop app

# 5. Restore from your backup
docker exec -i mikrotik-monitor-db psql -U "$PGUSER" -d postgres << EOF
DROP DATABASE IF EXISTS ${PGDATABASE};
CREATE DATABASE ${PGDATABASE};
GRANT ALL PRIVILEGES ON DATABASE ${PGDATABASE} TO ${PGUSER};
