#!/bin/bash
# Show actual app startup errors

echo "==== App Container Logs (Last 50 lines) ===="
echo ""
docker logs mikrotik-monitor-app --tail 50 2>&1 | grep -v "Scheduler"
echo ""
echo "==== Checking if app is listening on port 5000 ===="
docker exec mikrotik-monitor-app sh -c 'netstat -tuln | grep 5000 || ss -tuln | grep 5000 || echo "Port 5000 not listening"' 2>/dev/null || echo "Cannot check (netstat/ss not available)"
echo ""
echo "==== App container health status ===="
docker inspect mikrotik-monitor-app --format='{{json .State.Health}}' | grep -o '"Status":"[^"]*"' || echo "No health check configured"
echo ""
