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

# Set ownership and permissions on host
echo "Setting ownership to 1000:1000 on host directory..."
chown -R 1000:1000 backups
echo "✓ Host ownership: 1000:1000"

echo "Setting permissions on host directory..."
chmod -R 755 backups
echo "✓ Host permissions: 755"
echo ""

# Verify ownership inside container
echo "Verifying ownership inside Docker container..."
if $DOCKER_COMPOSE ps | grep -q "mikrotik-monitor-app.*Up"; then
    echo "✓ Container is running - ownership automatically correct (nodejs user is UID 1000)"
else
    echo "WARNING: Container is not running"
    echo "Start the container and ownership will be automatically correct"
fi

echo ""
echo "=========================================="
echo "  Permissions Fixed!"
echo "=========================================="
echo ""
echo "You can now create backups from the Settings page."
echo ""
