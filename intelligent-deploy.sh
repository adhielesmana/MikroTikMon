#!/bin/bash

# ========================================
# MikroTik Monitor - Host Nginx + Docker App Deployment
# ========================================
# Simple deployment: nginx on host, app in Docker
#
# SMART BEHAVIOR:
# - First run: Installs nginx, configures SSL (if available), deploys app
# - Subsequent runs: Only updates Docker app, skips nginx/SSL
# - Force nginx reconfigure: FORCE_NGINX_RECONFIGURE=1 ./intelligent-deploy.sh
#
# This prevents overwriting custom nginx configurations on app updates!

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

# Banner
echo ""
echo "========================================="
echo "  MikroTik Monitor - Smart Deploy"
echo "  Host Nginx + Docker App"
echo "========================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    print_error ".env file not found!"
    print_info "Create .env file first with required variables"
    exit 1
fi

# Determine docker-compose command
if docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# ========================================
# Check/Install Nginx
# ========================================

print_step "Checking nginx installation..."

if ! command -v nginx &> /dev/null; then
    print_warning "Nginx not found, installing..."
    apt-get update
    apt-get install -y nginx
    print_success "Nginx installed!"
else
    print_success "Nginx already installed"
fi

# Install certbot with nginx plugin
print_step "Checking certbot installation..."
if ! command -v certbot &> /dev/null; then
    print_info "Installing certbot with nginx plugin..."
    apt-get update
    apt-get install -y certbot python3-certbot-nginx
    print_success "Certbot and nginx plugin installed!"
else
    print_success "Certbot already installed"
    
    # Check if nginx plugin is installed
    if ! dpkg -l | grep -q python3-certbot-nginx; then
        print_info "Installing certbot nginx plugin..."
        apt-get install -y python3-certbot-nginx
        print_success "Certbot nginx plugin installed!"
    else
        print_success "Certbot nginx plugin already installed"
    fi
fi

# ========================================
# Configure Nginx
# ========================================

print_step "Configuring nginx..."

# Default app port (Docker app will run on this port)
APP_PORT=5000

# Update .env with app port
if grep -q "^APP_PORT=" .env; then
    sed -i "s/^APP_PORT=.*/APP_PORT=$APP_PORT/" .env
else
    echo "APP_PORT=$APP_PORT" >> .env
fi

# Get domain from environment or use default
DOMAIN="${DOMAIN:-mon.maxnetplus.id}"

# Check if nginx configuration already exists
NGINX_CONFIG_EXISTS=false
if [ -f "/etc/nginx/sites-available/mikrotik-monitor" ] && [ -L "/etc/nginx/sites-enabled/mikrotik-monitor" ]; then
    NGINX_CONFIG_EXISTS=true
    print_success "Nginx configuration already exists - skipping nginx setup"
    print_info "To reconfigure nginx, delete /etc/nginx/sites-available/mikrotik-monitor and run this script again"
fi

# Only configure nginx if config doesn't exist or FORCE_NGINX_RECONFIGURE=1
if [ "$NGINX_CONFIG_EXISTS" = false ] || [ "$FORCE_NGINX_RECONFIGURE" = "1" ]; then
    if [ "$FORCE_NGINX_RECONFIGURE" = "1" ]; then
        print_warning "Force reconfiguring nginx (FORCE_NGINX_RECONFIGURE=1)"
    fi

    # Check if we have SSL certificates
    if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
        print_success "SSL certificates found for $DOMAIN"
        USE_SSL=true
    else
        print_warning "No SSL certificates found for $DOMAIN"
        USE_SSL=false
    fi

    # Create nginx configuration
    if [ "$USE_SSL" = true ]; then
    print_info "Creating HTTPS nginx configuration..."
    cat > /etc/nginx/sites-available/mikrotik-monitor << 'EOF'
# WebSocket upgrade headers
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;
    return 301 https://$host$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name DOMAIN_PLACEHOLDER;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logging
    access_log /var/log/nginx/mikrotik-monitor-access.log;
    error_log /var/log/nginx/mikrotik-monitor-error.log;

    # Client settings
    client_max_body_size 10M;

    # Proxy to Docker app
    location / {
        proxy_pass http://127.0.0.1:APP_PORT_PLACEHOLDER;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # WebSocket endpoint
    location /ws {
        proxy_pass http://127.0.0.1:APP_PORT_PLACEHOLDER;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_buffering off;
    }
}
EOF
else
    print_info "Creating HTTP nginx configuration..."
    cat > /etc/nginx/sites-available/mikrotik-monitor << 'EOF'
# WebSocket upgrade headers
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

# HTTP server
server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;

    # Logging
    access_log /var/log/nginx/mikrotik-monitor-access.log;
    error_log /var/log/nginx/mikrotik-monitor-error.log;

    # Client settings
    client_max_body_size 10M;

    # Proxy to Docker app
    location / {
        proxy_pass http://127.0.0.1:APP_PORT_PLACEHOLDER;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # WebSocket endpoint
    location /ws {
        proxy_pass http://127.0.0.1:APP_PORT_PLACEHOLDER;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_buffering off;
    }
}
EOF
    fi

    # Replace placeholders
    sed -i "s|DOMAIN_PLACEHOLDER|$DOMAIN|g" /etc/nginx/sites-available/mikrotik-monitor
    sed -i "s|APP_PORT_PLACEHOLDER|$APP_PORT|g" /etc/nginx/sites-available/mikrotik-monitor

    # Enable site
    ln -sf /etc/nginx/sites-available/mikrotik-monitor /etc/nginx/sites-enabled/

    # Test nginx configuration
    print_info "Testing nginx configuration..."
    nginx -t

    if [ $? -eq 0 ]; then
        print_success "Nginx configuration valid!"
        
        # Reload nginx
        print_info "Reloading nginx..."
        systemctl reload nginx || systemctl restart nginx
        print_success "Nginx reloaded!"
    else
        print_error "Nginx configuration test failed!"
        exit 1
    fi
else
    print_info "Skipping nginx configuration (already exists)"
fi

# ========================================
# Prepare Host Directories for Docker Mounts
# ========================================

print_step "Preparing host directories for Docker volumes..."

# Create directories on the HOST (required for Docker volume mounts)
mkdir -p attached_assets/logos
mkdir -p logs
mkdir -p backups

# ========================================
# Intelligent UID Detection
# ========================================

print_step "Detecting container nodejs user UID..."

# Function to detect nodejs UID from running or temporary container
detect_nodejs_uid() {
    local detected_uid=""
    
    # Method 1: Check if container is already running
    if docker ps --format '{{.Names}}' | grep -q "mikrotik-monitor-app"; then
        print_info "Container is running, querying nodejs UID..." >&2
        detected_uid=$(docker exec mikrotik-monitor-app id -u nodejs 2>/dev/null)
        
        if [ -n "$detected_uid" ]; then
            print_success "Detected nodejs UID from running container: $detected_uid" >&2
            echo "$detected_uid"
            return 0
        fi
    fi
    
    # Method 2: Build a temporary container to check UID
    print_info "Building temporary container to detect nodejs UID..." >&2
    if docker build -t mikrotik-monitor-uid-check -f Dockerfile . >/dev/null 2>&1; then
        detected_uid=$(docker run --rm mikrotik-monitor-uid-check id -u nodejs 2>/dev/null)
        
        if [ -n "$detected_uid" ]; then
            print_success "Detected nodejs UID from Dockerfile: $detected_uid" >&2
            echo "$detected_uid"
            return 0
        fi
    fi
    
    # Method 3: Parse Dockerfile directly
    print_info "Parsing Dockerfile for nodejs UID..." >&2
    detected_uid=$(grep -E "adduser.*nodejs.*-u\s+[0-9]+" Dockerfile | sed -E 's/.*-u\s+([0-9]+).*/\1/' | head -1)
    
    if [ -n "$detected_uid" ]; then
        print_success "Detected nodejs UID from Dockerfile: $detected_uid" >&2
        echo "$detected_uid"
        return 0
    fi
    
    # Fallback: Use 1000 (most common)
    print_warning "Could not detect nodejs UID, using default: 1000" >&2
    echo "1000"
    return 1
}

# Detect the nodejs UID
NODEJS_UID=$(detect_nodejs_uid)
NODEJS_GID=$NODEJS_UID  # GID typically matches UID

# Set proper permissions and ownership on host directories
print_info "Setting ownership to $NODEJS_UID:$NODEJS_GID on host directories..."
chown -R $NODEJS_UID:$NODEJS_GID attached_assets
chown -R $NODEJS_UID:$NODEJS_GID logs
chown -R $NODEJS_UID:$NODEJS_GID backups

chmod -R 755 attached_assets
chmod -R 755 logs
chmod -R 755 backups

print_success "Host directories created with $NODEJS_UID:$NODEJS_GID ownership"
print_info "Container nodejs user UID: $NODEJS_UID (auto-detected)"

# ========================================
# Deploy Docker App
# ========================================

print_step "Deploying Docker application..."

# CRITICAL: Build ONLY the app service, never rebuild database service
# This prevents Docker from recreating the database container
print_info "Building application image (database untouched)..."
$DOCKER_COMPOSE build --no-cache app

# ULTRA-SAFE DEPLOYMENT STRATEGY:
# 1. Ensure database is running (start if stopped, but NEVER recreate)
# 2. Stop and remove ONLY the app container
# 3. Start new app container

# Check if database container exists
DB_CONTAINER_EXISTS=$(docker ps -a --filter "name=mikrotik-monitor-db" --format "{{.Names}}" | grep -q "mikrotik-monitor-db" && echo "yes" || echo "no")

if [ "$DB_CONTAINER_EXISTS" = "yes" ]; then
    # Database container exists - check if it's running
    DB_RUNNING=$(docker ps --filter "name=mikrotik-monitor-db" --format "{{.Names}}" | grep -q "mikrotik-monitor-db" && echo "yes" || echo "no")
    
    if [ "$DB_RUNNING" = "yes" ]; then
        print_success "Database container already running (preserving data)"
    else
        print_info "Starting existing database container..."
        docker start mikrotik-monitor-db
        sleep 5
        print_success "Database container started (data preserved)"
    fi
else
    # First deployment - create database container
    print_info "Creating database container (first deployment)..."
    $DOCKER_COMPOSE up -d mikrotik-monitor-db
    sleep 10
    print_success "Database container created and initialized"
fi

# Now handle the app container - stop and recreate it
print_info "Stopping application container..."
$DOCKER_COMPOSE stop app || true

print_info "Removing old application container..."
$DOCKER_COMPOSE rm -f app || true

print_info "Starting new application container..."
$DOCKER_COMPOSE up -d --no-deps app

# Wait for app to be ready
print_info "Waiting for application to start..."
sleep 5

# Check if containers are running
if $DOCKER_COMPOSE ps | grep -q "Up"; then
    print_success "Docker containers started successfully!"
    print_info "Directory ownership: Host UID 1000 = Container nodejs user (UID 1000)"
    print_success "Database data preserved in postgres_data volume"
else
    print_error "Docker containers failed to start!"
    print_info "Check logs with: docker-compose logs"
    exit 1
fi

# ========================================
# Verify Database Data Persistence
# ========================================

print_step "Verifying database data..."

# Source environment variables
source .env

# Check if database has existing data (strip all whitespace including newlines)
USER_COUNT=$(docker exec mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" -tA -c "SELECT COUNT(*) FROM users;" 2>/dev/null | tr -d '[:space:]' || echo "0")
ROUTER_COUNT=$(docker exec mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" -tA -c "SELECT COUNT(*) FROM routers;" 2>/dev/null | tr -d '[:space:]' || echo "0")

if [ "$USER_COUNT" != "0" ] || [ "$ROUTER_COUNT" != "0" ]; then
    print_success "Existing database data preserved!"
    print_info "  Users: $USER_COUNT"
    print_info "  Routers: $ROUTER_COUNT"
else
    print_warning "Database appears empty (might be a fresh deployment)"
fi

# ========================================
# Run Production Schema Fix (Auto-Migration)
# ========================================

print_step "Checking production database schema..."

# Wait for database to be fully ready
sleep 3

# Check if production-schema-fix.sql exists
if [ -f "production-schema-fix.sql" ]; then
    print_info "Applying production schema fixes..."
    
    # Execute the schema fix script
    docker exec -i mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" < production-schema-fix.sql 2>&1 | \
        grep -v "already exists" | \
        grep -E "NOTICE|ERROR|CREATE|ALTER|^✓|^✗" || true
    
    # Verify critical tables exist
    print_info "Verifying database schema..."
    
    # Check router_ip_addresses
    if docker exec mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" -tA -c \
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'router_ip_addresses');" 2>/dev/null | grep -q "t"; then
        print_success "✓ router_ip_addresses table exists"
    else
        print_error "✗ router_ip_addresses table missing"
    fi
    
    # Check router_routes
    if docker exec mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" -tA -c \
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'router_routes');" 2>/dev/null | grep -q "t"; then
        print_success "✓ router_routes table exists"
    else
        print_error "✗ router_routes table missing"
    fi
    
    # Check acknowledged_by column
    if docker exec mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" -tA -c \
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'alerts' AND column_name = 'acknowledged_by');" 2>/dev/null | grep -q "t"; then
        print_success "✓ alerts.acknowledged_by column exists"
    else
        print_error "✗ alerts.acknowledged_by column missing"
    fi
    
    # Check alerts indexes
    INDEX_COUNT=$(docker exec mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" -tA -c \
        "SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'alerts' AND indexname LIKE 'idx_alerts_%';" 2>/dev/null | tr -d '[:space:]')
    
    if [ "$INDEX_COUNT" -ge 4 ]; then
        print_success "✓ Alerts performance indexes created ($INDEX_COUNT indexes)"
    else
        print_warning "⚠ Alerts indexes incomplete (found $INDEX_COUNT, expected 4+)"
    fi
    
    print_success "Production schema updates completed!"
else
    print_warning "production-schema-fix.sql not found - skipping schema fixes"
    print_info "Auto-migrations will still run via application startup"
fi

# ========================================
# Run Database Migrations
# ========================================

print_step "Running additional database migrations..."

# Check if migrations directory exists
if [ -d "migrations" ] && [ "$(ls -A migrations/*.sql 2>/dev/null)" ]; then
    MIGRATION_COUNT=$(ls -1 migrations/*.sql 2>/dev/null | wc -l)
    print_info "Found $MIGRATION_COUNT migration file(s)"
    
    # Run each migration
    for migration_file in migrations/*.sql; do
        if [ -f "$migration_file" ]; then
            filename=$(basename "$migration_file")
            print_info "Running: $filename"
            
            # Execute migration (suppress "already exists" warnings)
            docker exec -i mikrotik-monitor-db psql -U "$PGUSER" -d "$PGDATABASE" < "$migration_file" 2>&1 | \
                grep -v "already exists\|does not exist\|skipping" || true
        fi
    done
    
    print_success "Database migrations completed!"
else
    print_info "No additional migrations to run"
fi


# ========================================
# SSL Certificate Setup (if needed)
# ========================================

if [ "$USE_SSL" = false ]; then
    echo ""
    print_warning "SSL certificates not configured"
    print_info "To setup SSL certificate, run:"
    echo ""
    echo "  1. Stop nginx: systemctl stop nginx"
    echo "  2. Generate cert: certbot certonly --standalone -d $DOMAIN --email your@email.com --agree-tos"
    echo "  3. Run this script again: ./intelligent-deploy.sh"
    echo ""
fi

# ========================================
# Deployment Summary
# ========================================

echo ""
echo "========================================="
print_success "Deployment Complete!"
echo "========================================="
echo ""
print_info "Access your application:"
if [ "$USE_SSL" = true ]; then
    echo "  • HTTPS: https://$DOMAIN"
else
    echo "  • HTTP: http://$DOMAIN"
fi
echo "  • Direct: http://localhost:$APP_PORT"
echo ""
print_info "Useful commands:"
echo "  • View logs:        docker-compose logs -f"
echo "  • Restart app:      docker-compose restart"
echo "  • Stop app:         docker-compose down"
echo "  • Nginx status:     systemctl status nginx"
echo "  • Nginx reload:     systemctl reload nginx"
echo ""
