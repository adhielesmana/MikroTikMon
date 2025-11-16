#!/bin/bash

echo "=== Checking Docker container status ==="
docker compose ps

echo ""
echo "=== Checking attached_assets directory in container ==="
docker compose exec -T app ls -la attached_assets/ 2>&1 || echo "Directory does not exist"

echo ""
echo "=== Checking if logos directory exists ==="
docker compose exec -T app ls -la attached_assets/logos/ 2>&1 || echo "Logos directory does not exist"

echo ""
echo "=== Creating logos directory if missing ==="
docker compose exec -T app mkdir -p attached_assets/logos

echo ""
echo "=== Setting permissions ==="
docker compose exec -T app chmod 755 attached_assets/logos

echo ""
echo "=== Checking recent logs for errors ==="
docker compose logs app --tail=50 | grep -i -A 5 -B 5 "settings\|error" | tail -50

echo ""
echo "=== Ready to test! Try updating your logo in Settings now. ==="
echo "=== After clicking Save, run: docker compose logs app --tail=20 ==="
