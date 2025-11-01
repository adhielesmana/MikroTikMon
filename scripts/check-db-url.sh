#!/bin/bash
# Quick DATABASE_URL checker

echo "==== Checking DATABASE_URL Configuration ===="
echo ""

echo "1. In .env file:"
grep "^DATABASE_URL" .env 2>/dev/null || echo "   (not found in .env)"
echo ""

echo "2. In docker-compose.yml:"
grep -A 2 "DATABASE_URL:" docker-compose.yml 2>/dev/null || echo "   (not found)"
echo ""

echo "3. Actually in app container:"
docker exec mikrotik-monitor-app sh -c 'echo $DATABASE_URL' 2>/dev/null || echo "   (container not running)"
echo ""

echo "4. What it SHOULD be:"
echo "   postgresql://mikrotik_user:PASSWORD@mikrotik-monitor-db:5432/mikrotik_monitor"
echo "                                        ^^^^^^^^^^^^^^^^^^^^"
echo "                                        Must match DB container name!"
echo ""

echo "5. Checking DB container name:"
docker ps --filter "name=db" --format "table {{.Names}}\t{{.Image}}"
echo ""
