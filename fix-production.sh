#!/bin/bash

# ========================================
# Production Fix Script
# Safely fixes common deployment issues
# ========================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_info() { echo -e "${BLUE}ℹ${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_step() { echo -e "${CYAN}▶${NC} $1"; }

echo ""
echo "========================================="
echo "  Production Fix Script"
echo "  MikroTik Network Monitoring Platform"
echo "========================================="
echo ""

# ========================================
# Step 1: Check Docker Compose Command
# ========================================

print_step "Detecting docker-compose command..."

if docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

print_success "Using: $DOCKER_COMPOSE"
echo ""

# ========================================
# Step 2: Check and Fix Database Container
# ========================================

print_step "Checking database container..."

DB_EXISTS=$(docker ps -a --filter "name=mikrotik-monitor-db" --format "{{.Names}}" | grep -q "mikrotik-monitor-db" && echo "yes" || echo "no")
DB_RUNNING=$(docker ps --filter "name=mikrotik-monitor-db" --format "{{.Names}}" | grep -q "mikrotik-monitor-db" && echo "yes" || echo "no")

if [ "$DB_EXISTS" = "no" ]; then
    print_error "Database container doesn't exist!"
    print_info "Creating database container..."
    $DOCKER_COMPOSE up -d mikrotik-monitor-db
    sleep 10
    print_success "Database container created"
elif [ "$DB_RUNNING" = "no" ]; then
    print_warning "Database container exists but is not running"
    print_info "Starting database container..."
    docker start mikrotik-monitor-db
    sleep 5
    print_success "Database container started"
else
    print_success "Database container is running"
fi

echo ""

# ========================================
# Step 3: Verify Database Volume
# ========================================

print_step "Verifying database volume..."

if docker volume ls | grep -q "postgres_data"; then
    print_success "Volume 'postgres_data' exists"
else
    print_error "Volume 'postgres_data' NOT found!"
    print_info "This will be created when database container starts"
fi

echo ""

# ========================================
# Step 4: Run Database Migrations
# ========================================

print_step "Running database migrations..."

# Source environment variables
if [ -f .env ]; then
    source .env
else
    print_error ".env file not found!"
    exit 1
fi

# Wait for database to be ready
sleep 3

# Run migrations if they exist
if [ -d "migrations" ] && [ "$(ls -A migrations/*.sql 2>/dev/null)" ]; then
    MIGRATION_COUNT=$(ls -1 migrations/*.sql 2>/dev/null | wc -l)
    print_info "Found $MIGRATION_COUNT migration file(s)"
    
    for migration_file in migrations/*.sql; do
        if [ -f "$migration_file" ]; then
            filename=$(basename "$migration_file")
            print_info "Running: $filename"
            docker exec -i mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" < "$migration_file" 2>&1 | \
                grep -v "already exists\|does not exist\|skipping" || true
        fi
    done
    
    print_success "Migrations completed"
else
    print_info "No migrations to run"
fi

echo ""

# ========================================
# Step 5: Check Database Data
# ========================================

print_step "Checking database contents..."

USER_COUNT=$(docker exec mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" -tA -c "SELECT COUNT(*) FROM users;" 2>/dev/null | tr -d '[:space:]' || echo "0")
ROUTER_COUNT=$(docker exec mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" -tA -c "SELECT COUNT(*) FROM routers;" 2>/dev/null | tr -d '[:space:]' || echo "0")

print_info "Database statistics:"
echo "  Users: $USER_COUNT"
echo "  Routers: $ROUTER_COUNT"

if [ "$USER_COUNT" = "0" ] && [ "$ROUTER_COUNT" = "0" ]; then
    print_warning "Database is EMPTY!"
    echo ""
    print_info "Do you want to restore from a backup? (y/n)"
    read -r RESTORE_CHOICE
    
    if [ "$RESTORE_CHOICE" = "y" ] || [ "$RESTORE_CHOICE" = "Y" ]; then
        # List available backups
        if [ -d "backups" ] && [ "$(ls -A backups/*.sql.gz 2>/dev/null)" ]; then
            print_info "Available backups:"
            ls -lh backups/*.sql.gz
            echo ""
            print_info "Enter backup filename (e.g., backup-2024-01-15.sql.gz):"
            read -r BACKUP_FILE
            
            if [ -f "backups/$BACKUP_FILE" ]; then
                print_info "Restoring from backups/$BACKUP_FILE..."
                ./scripts/restore-database.sh "backups/$BACKUP_FILE"
                print_success "Database restored!"
            else
                print_error "Backup file not found: backups/$BACKUP_FILE"
            fi
        else
            print_warning "No backups found in backups/ directory"
        fi
    fi
else
    print_success "Database has data"
fi

echo ""

# ========================================
# Step 6: Rebuild and Restart Application
# ========================================

print_step "Rebuilding application container..."

# Build only app (never rebuild database)
$DOCKER_COMPOSE build --no-cache app

print_info "Stopping old application container..."
$DOCKER_COMPOSE stop app || true

print_info "Removing old application container..."
$DOCKER_COMPOSE rm -f app || true

print_info "Starting new application container..."
$DOCKER_COMPOSE up -d --no-deps app

# Wait for app to start
print_info "Waiting for application to start..."
sleep 10

echo ""

# ========================================
# Step 7: Verify Application is Running
# ========================================

print_step "Verifying application..."

APP_RUNNING=$(docker ps --filter "name=mikrotik-monitor-app" --format "{{.Names}}" | grep -q "mikrotik-monitor-app" && echo "yes" || echo "no")

if [ "$APP_RUNNING" = "yes" ]; then
    print_success "Application is running!"
    
    # Check scheduler activity
    sleep 5
    SCHEDULER_LOGS=$(docker logs --since 1m mikrotik-monitor-app 2>&1 | grep "\[Scheduler\]" | wc -l)
    
    if [ "$SCHEDULER_LOGS" -gt 0 ]; then
        print_success "Scheduler is active! ($SCHEDULER_LOGS log entries)"
        print_info "Recent scheduler logs:"
        docker logs --since 1m mikrotik-monitor-app 2>&1 | grep "\[Scheduler\]" | tail -5
    else
        print_warning "No scheduler activity yet"
        print_info "This is normal if database is empty (no routers to monitor)"
        print_info "Add routers via the web interface to start monitoring"
    fi
else
    print_error "Application failed to start!"
    print_info "Checking logs for errors..."
    docker logs --tail 50 mikrotik-monitor-app
fi

echo ""

# ========================================
# Final Summary
# ========================================

echo "========================================="
print_success "Fix Complete!"
echo "========================================="
echo ""

print_info "Next steps:"
echo "  1. Access application at https://mon.maxnetplus.id"
echo "  2. Log in and verify your data is present"
echo "  3. Check routers page - they should update from 'disconnected' to 'connected' within 60 seconds"
echo "  4. Monitor logs: docker logs -f mikrotik-monitor-app | grep Scheduler"
echo ""

if [ "$USER_COUNT" = "0" ]; then
    print_warning "Database is empty - you'll need to:"
    echo "  1. Create a new admin user"
    echo "  2. Add routers"
    echo "  3. Configure monitored ports"
fi

echo ""
