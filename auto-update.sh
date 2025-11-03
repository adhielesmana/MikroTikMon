#!/bin/bash

# ========================================
# MikroTik Monitor - Auto Update Script
# ========================================
# Automatically checks for updates and deploys them
# Safe to run multiple times - only deploys if updates exist

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored messages
print_info() {
    echo -e "${BLUE}ℹ${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

print_error() {
    echo -e "${RED}✗${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

print_info "Checking for updates..."

# Ensure we're in a git repository
if [ ! -d .git ]; then
    print_error "Not a git repository! Cannot auto-update."
    exit 1
fi

# Fetch latest changes from remote
git fetch origin main 2>&1 || {
    print_error "Failed to fetch from git remote"
    exit 1
}

# Get current and remote commit hashes
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
    print_success "Already up to date (commit: ${LOCAL:0:7})"
    exit 0
fi

print_warning "Updates found!"
print_info "Local commit:  ${LOCAL:0:7}"
print_info "Remote commit: ${REMOTE:0:7}"

# Create backup before updating
print_info "Creating backup before update..."
./deploy.sh backup || print_warning "Backup failed, continuing anyway..."

# Pull latest changes
print_info "Pulling latest changes..."
git pull origin main || {
    print_error "Git pull failed!"
    exit 1
}

print_success "Code updated successfully"

# Deploy the update
print_info "Deploying update..."
./deploy.sh update || {
    print_error "Deployment failed!"
    print_warning "Rolling back to previous commit..."
    git reset --hard "$LOCAL"
    ./deploy.sh restart
    exit 1
}

print_success "✅ Update deployed successfully!"
print_info "New version is now live at http://localhost:5000"

# Optional: Send notification (uncomment and configure)
# curl -X POST "https://your-notification-webhook.com" \
#   -H "Content-Type: application/json" \
#   -d "{\"message\": \"MikroTik Monitor updated successfully to ${REMOTE:0:7}\"}"

exit 0
