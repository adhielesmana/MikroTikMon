# Duplicate Alerts Fix - Superadmin vs Normal Users

## Problem Identified

**Symptoms:**
- Normal users see 1 alert per issue ✓
- Superadmins see 3 duplicate alerts per issue ✗

**Root Cause:**
The `getAlerts()` SQL query was using a LEFT JOIN on the `user_routers` table, which created duplicate rows when:
1. A router had multiple users assigned to it
2. The same alert appeared multiple times in the result set (once per user assignment)

### Original Query Structure:
```sql
SELECT alerts.*, routers.name
FROM alerts
LEFT JOIN routers ON alerts.router_id = routers.id
LEFT JOIN user_routers ON alerts.router_id = user_routers.router_id
WHERE alerts.user_id = :userId OR user_routers.user_id = :userId
```

**Why normal users only saw 1 alert:**
- Normal users typically only have access to routers they own or a few assigned routers
- Even with the JOIN, the duplicate count was minimal or filtered by the frontend

**Why superadmins saw 3 duplicates:**
- Superadmins had access to ALL routers
- The JOIN created 1 row per user assignment (if 3 users assigned to router → 3 duplicate rows)
- All 3 rows matched the WHERE condition

## Solution Implemented

### For Superadmins:
Query ALL alerts directly without any JOIN filtering (superadmins should see everything):

```typescript
// Superadmins see ALL alerts
if (user?.isSuperadmin) {
  const results = await db
    .select({ alert: alerts, routerName: routers.name })
    .from(alerts)
    .leftJoin(routers, eq(alerts.routerId, routers.id))
    .orderBy(desc(alerts.createdAt));
}
```

**Benefits:**
- No user_routers JOIN → No duplicate rows
- Simple, fast query
- Superadmins see everything as expected

### For Normal Users:
Use a subquery to get assigned router IDs first, then filter alerts using `inArray`:

```typescript
// Normal users: Get alerts for owned + assigned routers
const assignedRouterIds = await db
  .select({ routerId: userRouters.routerId })
  .from(userRouters)
  .where(eq(userRouters.userId, userId));

const assignedIds = assignedRouterIds.map(r => r.routerId);

const results = await db
  .select({ alert: alerts, routerName: routers.name })
  .from(alerts)
  .leftJoin(routers, eq(alerts.routerId, routers.id))
  .where(
    or(
      eq(alerts.userId, userId),                              // Owned routers
      assignedIds.length > 0 ? inArray(alerts.routerId, assignedIds) : sql`false`
    )
  );
```

**Benefits:**
- Subquery approach eliminates JOIN-induced duplicates
- Normal users see alerts for owned + assigned routers
- No duplicate rows in result set

## Files Modified

### server/storage.ts
- Updated `getAlerts()` method
- Added `isSuperadmin` check
- Split logic between superadmins and normal users
- Added `inArray` import from drizzle-orm

## Testing

### Test Case 1: Superadmin View
**Before:** 3 duplicate alerts per issue (from multiple app instances)
**After:** 1 alert per issue ✓

### Test Case 2: Normal User View
**Before:** 1 alert per issue ✓
**After:** 1 alert per issue ✓ (unchanged, still working)

### Test Case 3: Assigned Users
**Before:** Could see duplicates if multiple assignments existed
**After:** No duplicates, clean alert list ✓

## Related Fixes

This fix complements the earlier **Alert Deduplication** fix that uses a partial unique index:

```sql
CREATE UNIQUE INDEX unique_alert_port_unack 
ON alerts(router_id, port_id) 
WHERE acknowledged = false;
```

**Combined Effect:**
1. **Database level:** Partial unique index prevents duplicate inserts from multiple app instances
2. **Query level:** This fix prevents duplicate rows in SELECT results from JOIN operations

Together, these ensure:
- ✅ No duplicate alerts in database
- ✅ No duplicate alerts in API responses
- ✅ Clean alert display for all user types

## Performance Impact

### Before:
- JOIN on user_routers table for all users
- Duplicate rows processed and returned
- Frontend had to deal with duplicate data

### After:
- Superadmins: Direct query (faster, no JOIN)
- Normal users: Subquery + inArray (efficient, no duplicates)
- Cleaner data flow from database → API → frontend

## Deployment

**Development:** Already applied (restart picked up the changes)

**Production:** 
```bash
# No migration needed - this is a code-only fix
./deploy.sh restart
```

## Verification

```sql
-- Check for any remaining duplicate alerts in query results
-- (This is a manual check, run against API response data)

-- Verify database still has no duplicates
SELECT router_id, port_id, COUNT(*) as count 
FROM alerts 
WHERE acknowledged = false 
GROUP BY router_id, port_id 
HAVING COUNT(*) > 1;
-- Should return 0 rows
```

## Summary

| User Type | Before | After | Status |
|-----------|--------|-------|--------|
| Normal User | 1 alert | 1 alert | ✅ Working |
| Superadmin | 3 duplicates | 1 alert | ✅ Fixed |
| Assigned User | 1-3 alerts | 1 alert | ✅ Fixed |

The duplicate alert issue for superadmins is now resolved while maintaining correct functionality for all user types.
