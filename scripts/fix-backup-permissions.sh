#!/bin/bash
#
# Quick Fix: Backup Directory Permissions
# Run this on production server to fix backup directory permissions
#

set -e

echo "=========================================="
echo "  Fixing Backup Directory Permissions"
echo "=========================================="
echo ""

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    echo "ERROR: Please run as root or with sudo"
    echo "Usage: sudo bash scripts/fix-backup-permissions.sh"
    exit 1
fi

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Check if docker-compose is available
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
elif command -v docker &> /dev/null && docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    echo "ERROR: docker-compose not found!"
    exit 1
fi

echo "✓ Project root: $PROJECT_ROOT"
echo ""

# Create backups directory if it doesn't exist
if [ ! -d "backups" ]; then
    echo "Creating backups directory..."
    mkdir -p backups
    echo "✓ Created: backups/"
fi

# Set permissions on host
echo "Setting permissions on host directory..."
chmod -R 755 backups
echo "✓ Host permissions: 755"
echo ""

# Fix ownership inside container
echo "Fixing ownership inside Docker container..."
if $DOCKER_COMPOSE exec -T app chown -R nodejs:nodejs /app/backups 2>/dev/null; then
    echo "✓ Container ownership: nodejs:nodejs"
else
    echo "WARNING: Could not fix ownership inside container"
    echo "This is normal if container is not running"
fi

echo ""
echo "=========================================="
echo "  Permissions Fixed!"
echo "=========================================="
echo ""
echo "You can now create backups from the Settings page."
echo ""
