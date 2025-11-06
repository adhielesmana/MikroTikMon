# Reachability Polling Update - All Routers Always Checked

## Change Summary

**Previously:** Only routers with monitored ports were polled for reachability every 60 seconds.

**Now:** ALL routers are polled every 60 seconds for reachability, regardless of whether they have monitored ports.

## Why This Matters

When you add a new router to production:
- **Before:** Reachability status would stay frozen at the initial check value until you added a monitored port
- **After:** Reachability status updates automatically every 60 seconds, even with no monitored ports

## How It Works

The scheduler now splits routers into two groups:

### Group 1: Routers WITH Monitored Ports
- **Action:** Full interface stats fetch + traffic data collection
- **Side Effect:** Reachability determined by API call success/failure
- **Frequency:** Every 60 seconds
- **Log Example:**
  ```
  [Scheduler] Polling 3 routers with monitored ports
  [Scheduler] ✓ Successfully processed 2 port(s) for MaxNet Core with 1 API call
  ```

### Group 2: Routers WITHOUT Monitored Ports
- **Action:** Lightweight TCP port reachability check ONLY
- **No Traffic Data:** Skips interface stats fetch (saves bandwidth)
- **Frequency:** Every 60 seconds
- **Log Example:**
  ```
  [Scheduler] Polling + 5 routers for reachability only
  [Scheduler] Router NewRouter is reachable (no monitored ports)
  ```

## Technical Implementation

### Code Location
`server/scheduler.ts` - `pollRouterTraffic()` function

### Key Changes

1. **Split router groups:**
   ```javascript
   const routersWithMonitoredPorts = allRouters.filter(r => uniqueRouterIds.has(r.id));
   const routersWithoutMonitoredPorts = allRouters.filter(r => !uniqueRouterIds.has(r.id));
   ```

2. **Lightweight reachability check:**
   ```javascript
   // For routers without monitored ports
   const isReachable = await client.checkReachability();
   await storage.updateRouterReachability(router.id, isReachable);
   ```

3. **Both groups run in parallel:**
   ```javascript
   await Promise.all([...routersWithMonitoredPorts]);
   await Promise.all([...routersWithoutMonitoredPorts]);
   ```

## Benefits

### 1. **Instant Status Updates**
- New routers show accurate reachability within 60 seconds
- No need to add monitored ports just to see if router is online

### 2. **Better Alerting**
- Router down alerts work for ALL routers (not just those with monitored ports)
- Accurate router connectivity monitoring

### 3. **Resource Efficient**
- Routers without monitored ports: Lightweight TCP check only (< 1KB network traffic)
- Routers with monitored ports: Full stats fetch (necessary for traffic monitoring)

### 4. **User Experience**
- Add router → See "Connected: Yes" immediately
- Wait 60 seconds → See "Reachable: Yes" automatically
- No manual intervention needed

## Reachability Check Method

The `checkReachability()` method performs:

1. **TCP Port Tests** (in order):
   - REST API port (usually 443)
   - Native API port (usually 8728)
   - SNMP port (usually 161)

2. **Result:**
   - ✅ `true` if ANY port responds
   - ❌ `false` if ALL ports fail

3. **Timeout:** 2 seconds per port (max 6 seconds total)

## Example Scenarios

### Scenario 1: New Router - No Monitored Ports
```
Time 0s:   User adds router "NewRouter"
           Initial check: Connected ✅, Reachable ✅

Time 60s:  Scheduler polls (reachability only)
           Result: Reachable ✅
           Log: "Router NewRouter is reachable (no monitored ports)"

Time 120s: Scheduler polls again
           Result: Reachable ✅
```

### Scenario 2: Router Goes Down - No Monitored Ports
```
Time 0s:   Router is online, Reachable ✅

Time 60s:  Router goes offline
           Scheduler polls (reachability check fails)
           Result: Reachable ❌
           Log: "Router NewRouter is unreachable (no monitored ports)"

Time 120s: checkAlerts() runs
           Violation count: 1/5
           (Alert created after 5 consecutive failures = 5 minutes)
```

### Scenario 3: Mixed Environment
```
Production has 10 routers:
- 7 routers WITH monitored ports → Full stats fetch
- 3 routers WITHOUT monitored ports → Reachability check only

Log output:
[Scheduler] Polling 7 routers with monitored ports + 3 routers for reachability only
```

## Migration Notes

### For Existing Routers
- ✅ No changes required
- ✅ Existing behavior unchanged
- ✅ Still uses cached connection method
- ✅ Still caches interface metadata

### For New Routers
- ✅ Reachability updates automatically every 60 seconds
- ✅ No need to add monitored ports for status updates
- ✅ Can verify connectivity before adding monitoring

### For Production Deployment
- ✅ Zero downtime - change is backward compatible
- ✅ No database migrations needed
- ✅ No configuration changes required
- ✅ Existing scheduler continues running

## Performance Impact

### Network Traffic
**Per Router Without Monitored Ports:**
- TCP SYN/ACK handshake: < 200 bytes
- Total per check: < 1KB

**Per Router With Monitored Ports:**
- Same as before (no change)

### Database Queries
**Additional Queries:**
- None - uses same `getAllRouters()` query

**Updated Records:**
- `router.reachable` field (already existed)

### CPU/Memory
- **Negligible** - TCP port checks are very lightweight
- **Parallel Execution** - all routers checked simultaneously

## Testing Verification

To verify this works in production:

1. **Add a new router** without monitored ports
2. **Check initial status:**
   - Connected: ✅ (from creation test)
   - Reachable: ✅ or ❌ (from creation test)
3. **Wait 60 seconds**
4. **Refresh router list**
5. **Verify reachability updated** (check server logs)

**Server Logs to Look For:**
```
[Scheduler] Polling X routers with monitored ports + Y routers for reachability only
[Scheduler] Router YourNewRouter is reachable (no monitored ports)
```

## Troubleshooting

### Reachability Still Shows "No" After 60 Seconds

**Check:**
1. Server logs - is scheduler running?
   ```
   [Scheduler] Polling X routers...
   ```
2. Router actually reachable?
   - Try "Test Connection" button manually
3. Firewall blocking TCP connections?
   - Check REST API port (443), Native API port (8728), SNMP port (161)

### New Router Shows Different Status

**Possible Causes:**
- Router genuinely offline
- Network firewall blocking connections
- Cloud DDNS hostname not resolving
- Temporary network issue during check

**Solution:**
- Wait for next poll (60 seconds)
- Check router directly via ping/telnet
- Review server logs for specific error

## Summary

✅ **All routers** now get reachability checks every 60 seconds  
✅ **No monitored ports required** for status updates  
✅ **Lightweight checks** for routers without monitoring  
✅ **Backward compatible** with existing behavior  
✅ **Better user experience** for new router onboarding  

**Your new router will show accurate reachability within 0-60 seconds!** 🎉
