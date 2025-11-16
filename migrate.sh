#!/bin/bash

# ========================================
# MikroTik Monitor - Database Migration Script
# ========================================
# Runs SAFE migrations only (excludes destructive fresh-init scripts)

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

print_info() { echo -e "${BLUE}ℹ${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }

echo ""
echo "========================================="
echo "  Database Migration Runner (SAFE MODE)"
echo "========================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    print_error ".env file not found!"
    exit 1
fi

# Source environment variables
print_info "Loading environment variables..."
source .env

# Check if database container is running
print_info "Checking database container..."
if ! docker ps | grep -q mikrotik-monitor-db; then
    print_error "Database container is not running!"
    print_info "Start it with: docker-compose up -d mikrotik-monitor-db"
    exit 1
fi

print_success "Database container is running"

# Check if database has existing data (safety check)
print_info "Checking database state..."
USER_COUNT=$(docker exec mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" -t -c "SELECT COUNT(*) FROM users WHERE is_superadmin = true" 2>/dev/null || echo "0")
USER_COUNT=$(echo $USER_COUNT | tr -d '[:space:]')

if [ "$USER_COUNT" -gt "0" ]; then
    print_success "Existing database detected (contains $USER_COUNT superadmin user(s))"
    FRESH_INSTALL=false
else
    print_warning "Empty or fresh database detected"
    FRESH_INSTALL=true
fi

# Check if migrations directory exists
if [ ! -d "migrations" ]; then
    print_warning "No migrations directory found"
    exit 0
fi

# Get list of migration files (EXCLUDING fresh init scripts)
MIGRATION_FILES=$(ls -1 migrations/*.sql 2>/dev/null | grep -v "00_fresh_init.sql" || true)
MIGRATION_COUNT=$(echo "$MIGRATION_FILES" | grep -v '^$' | wc -l)

if [ "$MIGRATION_COUNT" -eq 0 ]; then
    print_info "No upgrade migration files found"
    exit 0
fi

echo ""
print_warning "⚠️  SAFETY NOTICE:"
echo "  This script will run $MIGRATION_COUNT migration file(s)"
echo "  Fresh installation scripts (00_fresh_init.sql) are EXCLUDED"
echo ""

# List migrations to run
print_info "Migrations to execute:"
echo "$MIGRATION_FILES" | grep -v '^$' | while read -r file; do
    echo "  - $(basename "$file")"
done
echo ""

# Confirm before proceeding
read -p "Continue with migrations? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_info "Migration cancelled by user"
    exit 0
fi

echo ""
print_info "Running migrations..."

# Run each migration (excluding 00_fresh_init.sql)
SUCCESS_COUNT=0
SKIP_COUNT=0

for migration_file in $MIGRATION_FILES; do
    if [ -f "$migration_file" ]; then
        filename=$(basename "$migration_file")
        
        # Skip fresh init scripts
        if [[ "$filename" == "00_fresh_init.sql" ]]; then
            print_warning "⊘ Skipping: $filename (fresh installation only)"
            SKIP_COUNT=$((SKIP_COUNT + 1))
            continue
        fi
        
        print_info "Running migration: $filename"
        
        # Execute migration
        if docker exec -i mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" < "$migration_file" 2>&1 | \
            grep -v "already exists\|does not exist\|skipping\|NOTICE" || true; then
            print_success "✓ $filename completed"
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        else
            print_warning "⚠ $filename (may have already been applied)"
        fi
    fi
done

echo ""
if [ $SUCCESS_COUNT -gt 0 ]; then
    print_success "Successfully ran $SUCCESS_COUNT migration(s)"
fi
if [ $SKIP_COUNT -gt 0 ]; then
    print_info "Skipped $SKIP_COUNT destructive migration(s)"
fi
echo ""

# Show table list
print_info "Current database tables:"
docker exec -i mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" -c "\dt" | grep -v "^$"

echo ""
print_success "Migration complete!"
echo ""
