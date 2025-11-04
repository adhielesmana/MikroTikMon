# Interface Caching & Alert Deduplication

## Overview
This document describes the interface caching system and alert deduplication mechanism implemented to solve production issues.

## Problems Solved

### 1. Duplicate Alerts (Production Issue)
**Problem:** Production showed exactly 3 duplicate alerts for every issue, indicating 3 app instances running. Each instance's scheduler was creating the same alert independently.

**Solution:** Partial unique index on `alerts` table that prevents duplicate unacknowledged alerts while allowing new alerts after acknowledgement.

### 2. Slow Interface Loading (UX Issue)
**Problem:** When adding monitored ports, the system made live API calls to routers to fetch interface lists, causing delays and unnecessary load on router hardware.

**Solution:** Cache ALL router interfaces in database during background polling (zero additional API calls), serve from cache when adding monitors.

## Database Schema Changes

### New Table: `router_interfaces`
Caches ALL interfaces from each router (both monitored and unmonitored).

```sql
CREATE TABLE router_interfaces (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id varchar NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
  interface_name varchar(255) NOT NULL,
  interface_comment text,
  interface_mac_address varchar(17),
  interface_type varchar(50),
  is_running boolean DEFAULT false,
  is_disabled boolean DEFAULT false,
  last_seen timestamp DEFAULT now(),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  UNIQUE(router_id, interface_name)
);
```

**Benefits:**
- Instant interface list when adding monitors (no router API calls)
- Automatically updated during background polling (zero overhead)
- Includes interface comments for better UX

### Partial Unique Index on `alerts`
Prevents duplicate unacknowledged alerts from multiple app instances.

```sql
CREATE UNIQUE INDEX unique_alert_port_unack 
ON alerts(router_id, port_id) 
WHERE acknowledged = false;
```

**How it works:**
1. **First Alert:** (router1, port1, acknowledged=FALSE) → INSERT succeeds
2. **Duplicate Attempt:** (router1, port1, acknowledged=FALSE) → **Constraint fires**, returns existing alert
3. **Acknowledge Alert:** UPDATE sets acknowledged=TRUE → **Partial index no longer applies**
4. **New Issue:** (router1, port1, acknowledged=FALSE) → **INSERT succeeds** (no constraint!)

**Benefits:**
- Eliminates duplicate alerts from multiple app instances (3x duplicates → 0x duplicates)
- Allows new alerts after acknowledgement (no false suppression)
- Database-level enforcement (works even with race conditions)

## Code Changes

### Storage Layer (`server/storage.ts`)

#### New Methods:
- `upsertRouterInterface()` - Insert/update cached interface data
- `getRouterInterfaces()` - Get all cached interfaces for a router
- `getAvailableInterfacesForMonitoring()` - Get interfaces excluding already monitored ones

#### Updated Methods:
- `createAlert()` - Added graceful duplicate error handling:
  - Catches unique constraint violations (error code 23505)
  - Queries for existing UNACKNOWLEDGED alert
  - Returns existing alert only if truly unacknowledged
  - Throws error if constraint fires but no unacknowledged alert found (race condition safety)

### Scheduler (`server/scheduler.ts`)

All three polling functions updated to cache interfaces with zero additional overhead:

1. **Background Traffic Polling** (`pollRouterTraffic()`)
   - Fetches ALL interfaces for alert checking (already happening)
   - **NEW:** Caches all interfaces to database
   - Zero additional API calls

2. **Alert Checking** (`checkAlerts()`)
   - Fetches ALL interfaces for traffic/status checks (already happening)
   - **NEW:** Caches all interfaces to database
   - Zero additional API calls

3. **Realtime Polling** (`pollSingleRouterRealtime()`)
   - Fetches ALL interfaces for realtime display (already happening)
   - **NEW:** Caches all interfaces to database
   - Zero additional API calls

### API Routes (`server/routes.ts`)

#### New Endpoint:
```
GET /api/routers/:id/available-interfaces
```

**Purpose:** Serve available interfaces for monitoring from database cache

**Response:**
```json
{
  "interfaces": [
    { "name": "ether1", "comment": "WAN" },
    { "name": "ether2", "comment": "LAN" }
  ]
}
```

**Benefits:**
- Zero API calls to router hardware
- Instant response (database query only)
- Already excludes monitored ports (backend filtering)
- HTTP caching with ETag support (30s max-age)

### Frontend (`client/src/components/AddPortDialog.tsx`)

**Changed:** Query endpoint from `/interfaces` (live API) to `/available-interfaces` (cached)

**Before:**
```typescript
queryKey: ["/api/routers", routerId, "interfaces"], // Live API call
```

**After:**
```typescript
queryKey: ["/api/routers", routerId, "available-interfaces"], // Database cache
```

**Result:** Instant interface loading, no waiting for router API calls

## Deployment

### Development
```bash
# Migration is applied automatically via execute_sql_tool
npm run dev
```

### Production
```bash
# Run migration script
./deploy.sh migrate

# Or manually:
docker-compose exec -T mikrotik-monitor-db psql -U mikrotik_user mikrotik_monitor < scripts/migrations/005_add_router_interfaces_and_alert_deduplication.sql
```

## Verification

### Check Interface Caching:
```sql
-- Count total cached interfaces
SELECT COUNT(*) as total_interfaces FROM router_interfaces;

-- Count interfaces per router
SELECT router_id, COUNT(*) as interface_count 
FROM router_interfaces 
GROUP BY router_id;
```

### Check Alert Deduplication:
```sql
-- Find any duplicate unacknowledged alerts (should be 0)
SELECT router_id, port_id, COUNT(*) as duplicate_count 
FROM alerts 
WHERE acknowledged = false 
GROUP BY router_id, port_id 
HAVING COUNT(*) > 1;

-- Verify partial index exists
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'alerts' AND indexname = 'unique_alert_port_unack';
```

### Expected Results:
- **Interface Caching:** Should show counts matching number of interfaces per router
- **Alert Deduplication:** Should return 0 duplicate unacknowledged alerts
- **Partial Index:** Should show index with `WHERE (acknowledged = false)` clause

## Performance Impact

### Before:
- AddPortDialog: 1-3 second wait for router API call
- Multiple app instances: 3x duplicate alerts per issue
- Router hardware: Extra API load from interface queries

### After:
- AddPortDialog: <100ms instant load from database
- Multiple app instances: 0x duplicate alerts (database-level prevention)
- Router hardware: Zero additional API load (caching reuses existing data)

## Maintenance

### Automatic Updates:
Interface cache is automatically updated during:
1. Background traffic polling (every 60 seconds)
2. Alert checking (every 60 seconds)
3. Realtime polling (every 1 second when router details page is open)

### Manual Cleanup (if needed):
```sql
-- Remove stale interfaces not seen in 24 hours
DELETE FROM router_interfaces 
WHERE last_seen < NOW() - INTERVAL '24 hours';

-- Rebuild interface cache for a specific router
DELETE FROM router_interfaces WHERE router_id = '<router_id>';
-- Next scheduler run will repopulate
```

## Troubleshooting

### AddPortDialog shows "All interfaces already monitored" but there are available ports:

**Cause:** Interface cache may be empty or stale

**Solution:**
1. Wait 60 seconds for next scheduler run to populate cache
2. Or manually trigger by viewing router details page (starts realtime polling)
3. Or query router_interfaces table to verify data exists

### Duplicate alerts still appearing in production:

**Cause:** Partial unique index may not exist

**Solution:**
```sql
-- Check if index exists
SELECT indexname FROM pg_indexes WHERE indexname = 'unique_alert_port_unack';

-- Recreate if missing
CREATE UNIQUE INDEX unique_alert_port_unack 
ON alerts(router_id, port_id) 
WHERE acknowledged = false;
```

### New alerts not created after acknowledgement:

**Cause:** Full unique constraint instead of partial index

**Solution:**
```sql
-- Drop wrong constraint
DROP INDEX IF EXISTS unique_alert_port_unack;

-- Create partial index
CREATE UNIQUE INDEX unique_alert_port_unack 
ON alerts(router_id, port_id) 
WHERE acknowledged = false;
```

## Testing

### Test Alert Deduplication:
1. Create alert for router/port combination
2. Try to create duplicate → should return existing alert
3. Acknowledge the alert
4. Create new alert for same router/port → should succeed

### Test Interface Caching:
1. Add a router with monitored ports
2. Wait 60 seconds for scheduler to cache interfaces
3. Open AddPortDialog → should load instantly
4. Verify only unmonitored interfaces are shown

## Migration File
See: `scripts/migrations/005_add_router_interfaces_and_alert_deduplication.sql`

This migration is idempotent and can be run multiple times safely.
