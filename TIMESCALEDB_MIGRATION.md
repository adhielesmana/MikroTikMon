# TimescaleDB Migration Guide

This guide explains how to migrate your existing PostgreSQL database to TimescaleDB for better time-series performance.

## What is TimescaleDB?

TimescaleDB is a PostgreSQL extension optimized for time-series data. It's **100% compatible** with PostgreSQL, so all your existing queries work without changes.

### Benefits:

- ✅ **90%+ storage savings** via automatic compression
- ✅ **Faster queries** with automatic partitioning (chunks)
- ✅ **Automatic data retention** (2 years)
- ✅ **Pre-computed aggregates** for instant dashboard loads
- ✅ **Zero code changes** required

## For New Installations

If you're deploying fresh, TimescaleDB will be automatically configured:

```bash
cd /root/mikrotik-monitor
./intelligent-deploy.sh
```

The init scripts will automatically:
- Enable TimescaleDB extension
- Convert `traffic_data` to hypertable
- Add compression and retention policies
- Create continuous aggregates

## For Existing Production Databases

### Step 1: Backup Your Database

**IMPORTANT**: Always backup before migration!

```bash
# Backup the database
docker exec mikrotik-monitor-db pg_dump -U mikrotik_user mikrotik_monitor > backup_$(date +%Y%m%d).sql
```

### Step 2: Pull Latest Code

```bash
cd /root/mikrotik-monitor
git pull
```

### Step 3: Stop the Application

```bash
docker-compose down
```

### Step 4: Update Docker Image

The new `docker-compose.yml` already uses TimescaleDB. Just rebuild:

```bash
# Pull TimescaleDB image
docker-compose pull mikrotik-monitor-db

# Remove old PostgreSQL volume (if you want fresh start)
# WARNING: This deletes all data! Only do this if you have a backup!
# docker volume rm mikrotik-monitor_postgres_data

# Or keep existing data (recommended)
# TimescaleDB will migrate it automatically
```

### Step 5: Start Database Only

```bash
# Start only the database
docker-compose up -d mikrotik-monitor-db

# Wait for database to be ready (about 10 seconds)
sleep 10
```

### Step 6: Run Migration Script

```bash
# Copy migration script into database container
docker cp migrate-to-timescale.sql mikrotik-monitor-db:/tmp/

# Run migration
docker exec -it mikrotik-monitor-db psql -U mikrotik_user -d mikrotik_monitor -f /tmp/migrate-to-timescale.sql
```

You should see output like:
```
NOTICE: traffic_data converted to hypertable
NOTICE: Compression policy added
NOTICE: Retention policy added
...
TimescaleDB Migration Complete!
```

### Step 7: Start the Full Application

```bash
docker-compose up -d
```

### Step 8: Verify

```bash
# Check that containers are running
docker-compose ps

# Check application logs
docker-compose logs -f app

# Check database logs
docker-compose logs -f mikrotik-monitor-db
```

## Using Continuous Aggregates (Optional)

TimescaleDB creates pre-computed hourly and daily summaries. You can use these for faster dashboard queries:

### Hourly Data:
```sql
SELECT 
    router_id,
    port_name,
    bucket AS timestamp,
    avg_rx_bps,
    max_rx_bps
FROM traffic_data_hourly
WHERE bucket >= NOW() - INTERVAL '7 days'
ORDER BY bucket DESC;
```

### Daily Data:
```sql
SELECT 
    router_id,
    port_name,
    bucket AS timestamp,
    avg_rx_bps,
    max_rx_bps
FROM traffic_data_daily
WHERE bucket >= NOW() - INTERVAL '30 days'
ORDER BY bucket DESC;
```

## Troubleshooting

### Migration Failed

If migration fails, restore from backup:

```bash
# Stop containers
docker-compose down

# Remove database volume
docker volume rm mikrotik-monitor_postgres_data

# Start database
docker-compose up -d mikrotik-monitor-db

# Wait for it to be ready
sleep 10

# Restore backup
cat backup_20250115.sql | docker exec -i mikrotik-monitor-db psql -U mikrotik_user -d mikrotik_monitor
```

### Check TimescaleDB Status

```bash
# Connect to database
docker exec -it mikrotik-monitor-db psql -U mikrotik_user -d mikrotik_monitor

# Check if extension is enabled
SELECT * FROM pg_extension WHERE extname = 'timescaledb';

# Check hypertables
SELECT * FROM timescaledb_information.hypertables;

# Check compression stats
SELECT * FROM timescaledb_information.compression_settings;

# Check jobs (compression, retention, aggregates)
SELECT * FROM timescaledb_information.jobs;
```

### Compression Not Working

Compression runs automatically after 7 days. To manually compress:

```sql
-- Compress all chunks older than 7 days
CALL run_job((SELECT job_id FROM timescaledb_information.jobs WHERE proc_name = 'policy_compression'));
```

## Performance Tips

1. **Use continuous aggregates** for dashboard queries
2. **Query recent data** from `traffic_data` (fast, uncompressed)
3. **Query historical data** from `traffic_data_hourly` or `traffic_data_daily`
4. **Monitor compression** - should see 90%+ reduction in storage

## Rollback to PostgreSQL (Not Recommended)

If you need to rollback to plain PostgreSQL:

```bash
# Restore from backup to new PostgreSQL container
# Edit docker-compose.yml to use postgres:16-alpine
# Restore data from backup file
```

**Note**: You'll lose all TimescaleDB-specific features (compression, aggregates, etc.)

## Further Reading

- [TimescaleDB Documentation](https://docs.timescale.com/)
- [Compression Guide](https://docs.timescale.com/use-timescale/latest/compression/)
- [Continuous Aggregates](https://docs.timescale.com/use-timescale/latest/continuous-aggregates/)
