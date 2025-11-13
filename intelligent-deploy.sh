#!/bin/bash

# ========================================
# MikroTik Monitor - Host Nginx + Docker App Deployment
# ========================================
# Simple deployment: nginx on host, app in Docker

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

if ! command -v certbot &> /dev/null; then
    print_info "Installing certbot..."
    apt-get install -y certbot
    print_success "Certbot installed!"
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

# ========================================
# Deploy Docker App
# ========================================

print_step "Deploying Docker application..."

# Pull latest images and rebuild
$DOCKER_COMPOSE pull || true
$DOCKER_COMPOSE build --no-cache

# Start/restart containers
$DOCKER_COMPOSE up -d --force-recreate

# Wait for app to be ready
print_info "Waiting for application to start..."
sleep 5

# Check if containers are running
if $DOCKER_COMPOSE ps | grep -q "Up"; then
    print_success "Docker containers started successfully!"
else
    print_error "Docker containers failed to start!"
    print_info "Check logs with: docker-compose logs"
    exit 1
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
