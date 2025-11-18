#!/bin/bash
echo "Checking actual Docker volume name..."
echo ""
echo "All volumes containing 'postgres':"
docker volume ls | grep postgres || echo "No postgres volumes found!"
echo ""
echo "Docker Compose project name detection:"
grep "name:" docker-compose.yml || echo "No project name set - uses directory name"
