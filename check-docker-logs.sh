#!/bin/bash
echo "=== Checking if docker is available in Replit ==="
if command -v docker &> /dev/null; then
    echo "Docker found, fetching logs..."
    docker logs mikrotik-monitor-app --tail 50 2>&1
else
    echo "Docker not available in this environment (Replit)"
    echo "User is running Docker on their own server"
    echo "Need to ask user for log output"
fi
