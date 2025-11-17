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

# ========================================
# Intelligent UID Detection
# ========================================

echo "Detecting container nodejs user UID..."

# Function to detect nodejs UID from running or temporary container
detect_nodejs_uid() {
    local detected_uid=""
    
    # Method 1: Check if container is already running
    if docker ps --format '{{.Names}}' | grep -q "mikrotik-monitor-app"; then
        echo "  Container is running, querying nodejs UID..." >&2
        detected_uid=$(docker exec mikrotik-monitor-app id -u nodejs 2>/dev/null)
        
        if [ -n "$detected_uid" ]; then
            echo "  ✓ Detected nodejs UID from running container: $detected_uid" >&2
            echo "$detected_uid"
            return 0
        fi
    fi
    
    # Method 2: Parse Dockerfile directly
    echo "  Parsing Dockerfile for nodejs UID..." >&2
    if [ -f "Dockerfile" ]; then
        detected_uid=$(grep -E "adduser.*nodejs.*-u\s+[0-9]+" Dockerfile | sed -E 's/.*-u\s+([0-9]+).*/\1/' | head -1)
        
        if [ -n "$detected_uid" ]; then
            echo "  ✓ Detected nodejs UID from Dockerfile: $detected_uid" >&2
            echo "$detected_uid"
            return 0
        fi
    fi
    
    # Fallback: Use 1000 (most common)
    echo "  ⚠ Could not detect nodejs UID, using default: 1000" >&2
    echo "1000"
    return 1
}

# Detect the nodejs UID
NODEJS_UID=$(detect_nodejs_uid)
NODEJS_GID=$NODEJS_UID  # GID typically matches UID

echo ""
echo "Setting ownership to $NODEJS_UID:$NODEJS_GID on host directory..."
chown -R $NODEJS_UID:$NODEJS_GID backups
echo "✓ Host ownership: $NODEJS_UID:$NODEJS_GID"

echo "Setting permissions on host directory..."
chmod -R 755 backups
echo "✓ Host permissions: 755"
echo ""

# Verify ownership inside container
echo "Verifying ownership inside Docker container..."
if $DOCKER_COMPOSE ps | grep -q "mikrotik-monitor-app.*Up"; then
    echo "✓ Container is running - ownership automatically correct (nodejs user is UID $NODEJS_UID)"
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
