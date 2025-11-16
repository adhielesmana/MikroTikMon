#!/bin/bash

# ========================================
# MikroTik Monitor - Database Migration Script
# ========================================
# Automatically runs all pending migrations

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
echo "  Database Migration Runner"
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

# Check if migrations directory exists
if [ ! -d "migrations" ]; then
    print_warning "No migrations directory found"
    exit 0
fi

# Count migration files
MIGRATION_COUNT=$(ls -1 migrations/*.sql 2>/dev/null | wc -l)

if [ "$MIGRATION_COUNT" -eq 0 ]; then
    print_warning "No migration files found in migrations/"
    exit 0
fi

print_info "Found $MIGRATION_COUNT migration file(s)"

# Run each migration
for migration_file in migrations/*.sql; do
    if [ -f "$migration_file" ]; then
        filename=$(basename "$migration_file")
        print_info "Running migration: $filename"
        
        # Execute migration
        if docker exec -i mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" < "$migration_file" 2>&1 | grep -v "already exists\|does not exist\|skipping"; then
            print_success "✓ $filename completed"
        else
            print_warning "⚠ $filename (may have already been applied)"
        fi
    fi
done

echo ""
print_success "All migrations completed!"
echo ""

# Show table list
print_info "Current database tables:"
docker exec -i mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" -c "\dt" | grep -v "^$"

echo ""
