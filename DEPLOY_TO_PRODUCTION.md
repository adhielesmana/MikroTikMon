# 🚀 Deploy 5-Minute Polling Removal to Production

**Production Server:** mon.maxnetplus.id  
**What:** Remove redundant 5-minute polling, keep only 60-second polling

---

## 📋 **Pre-Deployment Checklist**

Before starting, make sure you have:
- ✅ SSH access to `root@mon.maxnetplus.id`
- ✅ The cleanup script: `cleanup-5min-polling.sh`
- ✅ The verification script: `verify-60s-polling.sh`

---

## 🔧 **Step-by-Step Deployment**

### **Step 1: Upload Scripts to Production**

From your **local machine**:

```bash
# Upload cleanup script
scp cleanup-5min-polling.sh root@mon.maxnetplus.id:/root/MikroTikMon/

# Upload verification script
scp verify-60s-polling.sh root@mon.maxnetplus.id:/root/MikroTikMon/
```

---

### **Step 2: SSH to Production Server**

```bash
ssh root@mon.maxnetplus.id
cd /root/MikroTikMon
```

---

### **Step 3: Check Current Status (Before)**

```bash
# Make scripts executable
chmod +x cleanup-5min-polling.sh verify-60s-polling.sh

# Run verification (to see current state)
./verify-60s-polling.sh
```

**Expected Output (BEFORE deployment):**
```
✓ Scheduler running
✓ 60-second polling active
✗ WARNING: Still seeing InterfaceGraph activity!  ← This will be fixed
✓ Database has traffic data
```

---

### **Step 4: Clean Up Database**

Remove the `interface_graph` table (if it exists):

```bash
./cleanup-5min-polling.sh
```

**Expected Output:**
```
✓ interface_graph table removed (or didn't exist)
✓ Database cleanup complete
✓ traffic_data table still working
```

---

### **Step 5: Deploy Updated Code**

Pull latest code and rebuild the app:

```bash
# Pull latest code (with 5-min polling removed)
git pull origin main

# Deploy updated app
bash intelligent-deploy.sh
```

**Expected Output:**
```
✓ Pulling latest code from GitHub
✓ Building Docker image
✓ Restarting app container
✓ App started successfully
```

**Wait 2 minutes for app to stabilize...**

---

### **Step 6: Verify 60-Second Polling Works**

```bash
# Run comprehensive verification
./verify-60s-polling.sh
```

**Expected Output (SUCCESS):**
```
========================================
✅ 60-SECOND POLLING IS WORKING!
========================================

Summary:
  ✓ Scheduler running
  ✓ 60-second polling active
  ✓ Data being collected to database
  ✓ 5-minute polling removed
```

---

### **Step 7: Watch Live Logs (Optional)**

Monitor the scheduler in real-time:

```bash
# Watch scheduler activity
docker compose logs -f app | grep -E "Scheduler|Polling"
```

**What to look for:**
```
✓ [Scheduler] Polling 3 routers with monitored ports
✓ [Scheduler] Processing X monitored port(s)
✓ [Scheduler] ✓ Successfully processed X port(s)
✗ NO [InterfaceGraph] messages (these are gone!)
```

**Press Ctrl+C to stop watching**

---

### **Step 8: Check Database Data**

Verify traffic data is being collected:

```bash
# Check recent data (last 5 minutes)
docker exec -i mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -c "
SELECT 
    r.name as router,
    COUNT(*) as samples,
    MAX(td.timestamp) as latest_capture
FROM traffic_data td
JOIN routers r ON td.router_id = r.id
WHERE td.timestamp > NOW() - INTERVAL '5 minutes'
GROUP BY r.name;
"
```

**Expected Output:**
```
router              | samples | latest_capture
--------------------+---------+--------------------
POP Soba Spasico    | 15      | 2025-11-17 10:45:30
MaxNet Core Pajang  | 10      | 2025-11-17 10:45:29
POP Porto Jambangan | 15      | 2025-11-17 10:45:28

✓ You should see 5-10 samples per router (depending on monitored ports)
```

---

## ✅ **Success Criteria**

Your deployment is successful if:

| Check | Status |
|-------|--------|
| App is running | ✅ `docker compose ps` shows "Up" |
| 60s polling active | ✅ Logs show "Polling...routers with monitored ports" |
| Database collecting data | ✅ Recent traffic records exist |
| 5-min polling removed | ✅ NO "InterfaceGraph" in logs |
| Monitored ports working | ✅ 8 enabled ports configured |

---

## 🔍 **Troubleshooting**

### **Issue 1: No traffic data being collected**

```bash
# Check if routers are reachable
docker compose logs app | grep "Error polling router"

# Check monitored ports
docker exec -i mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -c "
SELECT COUNT(*) FROM monitored_ports WHERE enabled = true;
"
```

**Solution:** Verify router connectivity and monitored port configuration in web UI.

---

### **Issue 2: Still seeing InterfaceGraph messages**

```bash
# Check current code
docker compose logs app | grep InterfaceGraph

# If found, redeploy
git pull origin main
bash intelligent-deploy.sh
```

**Solution:** Make sure you pulled the latest code.

---

### **Issue 3: App won't start**

```bash
# Check error logs
docker compose logs app --tail=50

# Restart app
docker compose restart app

# Check again
docker compose ps
```

**Solution:** Check logs for specific error, may need to fix configuration.

---

## 📊 **After Deployment**

Your production system now:
- ✅ Collects traffic every 60 seconds (monitored ports)
- ✅ Stores data for 2 years with compression
- ✅ Provides complete historical analysis
- ✅ Simplified architecture (no redundant 5-min polling)

---

## 📞 **Quick Commands Reference**

| Task | Command |
|------|---------|
| **Verify polling works** | `./verify-60s-polling.sh` |
| **Watch live logs** | `docker compose logs -f app \| grep Scheduler` |
| **Check recent data** | `docker exec mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -c "SELECT COUNT(*) FROM traffic_data WHERE timestamp > NOW() - INTERVAL '5 minutes';"` |
| **Restart app** | `docker compose restart app` |
| **Check app status** | `docker compose ps` |

---

## 🎯 **Final Verification**

After 5-10 minutes, run the full verification again:

```bash
./verify-60s-polling.sh
```

**You should see:**
```
✅ 60-SECOND POLLING IS WORKING!

  ✓ Scheduler running
  ✓ 60-second polling active  
  ✓ Data being collected to database
  ✓ 5-minute polling removed
```

**If you see this, deployment is 100% successful!** 🎉

---

## 📝 **What Changed**

### Before:
- 60-second polling ✓
- 5-minute interface_graph polling ✓ (redundant)
- 2 tables, 2 polling systems

### After:
- 60-second polling ✓
- 5-minute polling removed ✗
- 1 table (`traffic_data`), 1 polling system

**Result:** Simpler, more efficient, same functionality! 🚀

