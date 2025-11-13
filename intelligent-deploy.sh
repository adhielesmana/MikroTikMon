#!/bin/bash

# ========================================
# MikroTik Monitor - Intelligent Deployment
# ========================================
# Automatically detects nginx conflicts and provides smart deployment options

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
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
echo "========================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    print_error ".env file not found!"
    print_info "Run ./setup.sh first to create configuration"
    exit 1
fi

# Determine docker-compose command
if docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# ========================================
# Detection Functions
# ========================================

detect_host_nginx() {
    # Check if nginx is installed on host
    if command -v nginx &> /dev/null; then
        # Check if nginx is actually running
        if systemctl is-active --quiet nginx 2>/dev/null || pgrep nginx > /dev/null 2>&1; then
            return 0  # Found and running
        fi
    fi
    return 1  # Not found or not running
}

detect_docker_nginx() {
    # Check if nginx container exists
    if docker ps -a --format '{{.Names}}' | grep -q "mikrotik-monitor-nginx"; then
        return 0  # Found
    fi
    return 1  # Not found
}

is_docker_nginx_running() {
    if docker ps --format '{{.Names}}' | grep -q "mikrotik-monitor-nginx"; then
        return 0  # Running
    fi
    return 1  # Not running
}

is_fresh_install() {
    # Check if app container exists (indicates previous deployment)
    if docker ps -a --format '{{.Names}}' | grep -q "mikrotik-monitor-app"; then
        return 1  # Not fresh, already deployed before
    fi
    return 0  # Fresh install
}

check_port_conflicts() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0  # Port in use
    fi
    return 1  # Port free
}

get_free_port() {
    local start_port=$1
    local port=$start_port
    while check_port_conflicts $port; do
        port=$((port + 1))
    done
    echo $port
}

# ========================================
# Nginx Configuration Update
# ========================================

update_host_nginx_config() {
    local domain=$1
    
    print_step "Updating host nginx configuration..."
    
    # Check if config already exists
    if [ -f /etc/nginx/sites-available/mikrotik-monitor ]; then
        print_info "Configuration already exists, updating..."
        sed "s/server 127\.0\.0\.1:[0-9]\+/server 127.0.0.1:$APP_PORT/g" \
            /etc/nginx/sites-available/mikrotik-monitor > /tmp/mikrotik-monitor.conf
        mv /tmp/mikrotik-monitor.conf /etc/nginx/sites-available/mikrotik-monitor
    else
        print_info "Creating new configuration..."
        
        # Get domain from user if not provided
        if [ -z "$domain" ]; then
            read -p "Enter your domain name (e.g., mon.maxnetplus.id): " domain
            if [ -z "$domain" ]; then
                print_error "Domain name is required"
                exit 1
            fi
        fi
        
        # Create config from template
        sed -e "s/mon\.maxnetplus\.id/$domain/g" \
                 -e "s/127\.0\.0\.1:5000/127.0.0.1:$APP_PORT/g" \
                 nginx-host.conf > /tmp/mikrotik-monitor.conf
        mv /tmp/mikrotik-monitor.conf /etc/nginx/sites-available/mikrotik-monitor
        
        # Enable site
        ln -sf /etc/nginx/sites-available/mikrotik-monitor /etc/nginx/sites-enabled/
    fi
    
    # Add WebSocket map if not present
    if ! grep -q "map \$http_upgrade \$connection_upgrade" /etc/nginx/nginx.conf; then
        print_info "Adding WebSocket support to nginx.conf..."
        sed -i '/http {/a \    # Smart WebSocket connection handling\n    map $http_upgrade $connection_upgrade {\n        default upgrade;\n        '\'\''      close;\n    }\n' /etc/nginx/nginx.conf
    fi
    
    # Add rate limiting zones if not present
    if ! grep -q "limit_req_zone.*mikrotik_general" /etc/nginx/nginx.conf; then
        print_info "Adding rate limiting zones to nginx.conf..."
        sed -i '/http {/a \    # Rate limiting zones for MikroTik Monitor\n    limit_req_zone $binary_remote_addr zone=mikrotik_general:10m rate=10r/s;\n    limit_req_zone $binary_remote_addr zone=mikrotik_api:10m rate=30r/s;\n' /etc/nginx/nginx.conf
    fi
    
    # Test and reload
    print_info "Testing nginx configuration..."
    nginx -t
    
    print_info "Reloading nginx..."
    systemctl reload nginx
    
    print_success "Host nginx configuration updated!"
}

# ========================================
# Docker Port Modification
# ========================================

modify_docker_ports() {
    print_step "Detecting port conflicts and adjusting Docker configuration..."
    
    # Default ports
    APP_PORT=5000
    POSTGRES_PORT=5432
    
    # Check for conflicts and find free ports
    if check_port_conflicts 5000; then
        APP_PORT=$(get_free_port 5001)
        print_warning "Port 5000 is in use, using port $APP_PORT instead"
    else
        print_info "Port 5000 is available"
    fi
    
    # Update .env with new port
    if grep -q "^APP_PORT=" .env; then
        sed -i "s/^APP_PORT=.*/APP_PORT=$APP_PORT/" .env
    else
        echo "APP_PORT=$APP_PORT" >> .env
    fi
    
    print_success "Docker will use port $APP_PORT for the application"
    
    # Export for use in other functions
    export APP_PORT
}

# ========================================
# Installation Options
# ========================================

install_host_nginx() {
    print_step "Installing nginx on host..."
    
    if ! command -v nginx &> /dev/null; then
        print_info "Installing nginx..."
        apt-get update
        apt-get install -y nginx
    fi
    
    if ! command -v certbot &> /dev/null; then
        print_info "Installing certbot..."
        apt-get install -y certbot
    fi
    
    print_success "Nginx and certbot installed!"
    
    # Configure nginx
    modify_docker_ports
    update_host_nginx_config ""
    
    # Offer SSL setup
    echo ""
    print_info "SSL certificate setup"
    print_warning "Make sure your domain DNS points to this server's IP address"
    read -p "Do you want to setup SSL certificate now? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter your email for Let's Encrypt notifications: " EMAIL
        read -p "Enter your domain name: " DOMAIN
        
        if [ ! -z "$EMAIL" ] && [ ! -z "$DOMAIN" ]; then
            print_info "Stopping nginx temporarily for certificate generation..."
            systemctl stop nginx
            
            print_info "Generating SSL certificate..."
            certbot certonly --standalone -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive
            
            if [ $? -eq 0 ]; then
                print_success "SSL certificate obtained!"
                
                # Update nginx config with SSL
                print_info "Configuring nginx for HTTPS..."
                cat > /tmp/mikrotik-monitor-ssl.conf << EOF
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Proxy to app
    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # WebSocket endpoint
    location /ws {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_buffering off;
    }
}
EOF
                mv /tmp/mikrotik-monitor-ssl.conf /etc/nginx/sites-available/mikrotik-monitor
                
                print_info "Starting nginx..."
                systemctl start nginx
                
                print_success "HTTPS configured!"
                
                # Setup auto-renewal
                if ! crontab -l 2>/dev/null | grep -q "certbot renew"; then
                    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --deploy-hook 'systemctl reload nginx'") | crontab -
                    print_success "Auto-renewal configured"
                fi
            else
                print_error "SSL certificate generation failed"
                print_info "Starting nginx without SSL..."
                systemctl start nginx
            fi
        fi
    fi
}

install_docker_nginx() {
    print_step "Configuring Docker nginx deployment..."
    
    # Check if SSL certificates exist
    if [ ! -d ssl ] || [ ! -f ssl/fullchain.pem ] || [ ! -f ssl/privkey.pem ]; then
        print_warning "SSL certificates not found in ./ssl/ directory"
        echo ""
        print_info "You need SSL certificates for Docker nginx. Options:"
        echo "  1. Use certbot to generate certificates"
        echo "  2. Copy existing certificates to ./ssl/"
        echo "  3. Continue without SSL (not recommended for production)"
        echo ""
        read -p "Do you want to generate SSL certificates with certbot? (y/N): " -n 1 -r
        echo
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            read -p "Enter your domain name: " DOMAIN
            read -p "Enter your email: " EMAIL
            
            if [ ! -z "$DOMAIN" ] && [ ! -z "$EMAIL" ]; then
                print_info "Stopping any services on port 80..."
                systemctl stop nginx 2>/dev/null || true
                docker stop mikrotik-monitor-nginx 2>/dev/null || true
                
                print_info "Generating SSL certificate..."
                certbot certonly --standalone -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive
                
                print_info "Copying certificates to ssl directory..."
                mkdir -p ssl
                cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem ssl/
                cp /etc/letsencrypt/live/$DOMAIN/privkey.pem ssl/
                chmod 644 ssl/*.pem
                
                print_success "SSL certificates configured!"
            fi
        fi
    fi
    
    # Update nginx.conf with domain if needed
    print_info "Docker nginx will be deployed with --with-nginx flag"
}

# ========================================
# Main Detection Logic
# ========================================

print_step "Detecting nginx installations..."
echo ""

HOST_NGINX_FOUND=false
DOCKER_NGINX_FOUND=false
FRESH_INSTALL=false

if detect_host_nginx; then
    HOST_NGINX_FOUND=true
    print_success "Detected nginx running on host"
fi

if detect_docker_nginx; then
    DOCKER_NGINX_FOUND=true
    if is_docker_nginx_running; then
        print_success "Detected nginx Docker container (running)"
    else
        print_info "Detected nginx Docker container (stopped)"
    fi
fi

if is_fresh_install; then
    FRESH_INSTALL=true
    print_info "This appears to be a fresh installation"
else
    print_info "This appears to be an update to existing deployment"
fi

echo ""
print_step "Deployment Strategy:"
echo ""

# ========================================
# Scenario 1: Host Nginx Exists
# ========================================

if [ "$HOST_NGINX_FOUND" = true ]; then
    print_info "Strategy: Use existing host nginx (update configuration only)"
    echo ""
    print_info "Actions to be taken:"
    echo "  1. Update nginx configuration for MikroTik Monitor"
    echo "  2. Modify Docker ports to avoid conflicts"
    echo "  3. Deploy application without Docker nginx"
    echo ""
    
    read -p "Continue with this strategy? (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        modify_docker_ports
        update_host_nginx_config ""
        
        # Deploy without nginx
        print_step "Deploying application..."
        ./deploy.sh up
        
        echo ""
        print_success "Deployment complete!"
        print_info "Application is running at:"
        echo "  • https://your-domain.com (via host nginx)"
        echo "  • http://localhost:$APP_PORT (direct access)"
        exit 0
    else
        print_info "Deployment cancelled by user"
        exit 0
    fi
fi

# ========================================
# Scenario 2: Docker Nginx Exists
# ========================================

if [ "$DOCKER_NGINX_FOUND" = true ]; then
    if [ "$FRESH_INSTALL" = false ]; then
        # Update deployment
        print_info "Strategy: Update existing Docker nginx deployment"
        echo ""
        read -p "Continue with update? (Y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            print_step "Updating deployment..."
            ./deploy.sh up --with-nginx
            
            echo ""
            print_success "Update complete!"
            exit 0
        else
            print_info "Update cancelled by user"
            exit 0
        fi
    else
        # Fresh install with existing nginx container
        print_warning "Found existing nginx Docker container from previous installation"
        echo ""
        print_info "Options:"
        echo "  1. Remove existing nginx container and start fresh"
        echo "  2. Cancel deployment"
        echo ""
        read -p "Choose option (1/2): " -n 1 -r
        echo
        
        case $REPLY in
            1)
                print_step "Removing existing nginx container..."
                docker stop mikrotik-monitor-nginx 2>/dev/null || true
                docker rm mikrotik-monitor-nginx 2>/dev/null || true
                print_success "Nginx container removed"
                
                # Continue to fresh install options
                DOCKER_NGINX_FOUND=false
                ;;
            2)
                print_info "Deployment cancelled by user"
                exit 0
                ;;
            *)
                print_error "Invalid option"
                exit 1
                ;;
        esac
    fi
fi

# ========================================
# Scenario 3: No Nginx Detected (Fresh Install)
# ========================================

print_info "Strategy: Fresh installation - choose nginx deployment method"
echo ""
print_info "Nginx Deployment Options:"
echo ""
echo "  1. Install nginx on host (Recommended for production)"
echo "     ✓ Supports multiple applications"
echo "     ✓ Automatic SSL renewal with Let's Encrypt"
echo "     ✓ Centralized reverse proxy management"
echo ""
echo "  2. Install nginx in Docker (Containerized)"
echo "     ✓ Fully containerized environment"
echo "     ✓ Portable deployment"
echo "     ✓ Isolated from host system"
echo ""
read -p "Choose installation method (1/2): " -n 1 -r
echo
echo ""

case $REPLY in
    1)
        # Host nginx installation
        install_host_nginx
        
        # Deploy app
        print_step "Deploying application..."
        ./deploy.sh up
        
        echo ""
        print_success "Deployment complete!"
        print_info "Application is running at:"
        echo "  • https://your-domain.com (via host nginx)"
        echo "  • http://localhost:$APP_PORT (direct access)"
        ;;
    2)
        # Docker nginx installation
        install_docker_nginx
        
        # Deploy with nginx
        print_step "Deploying application with Docker nginx..."
        ./deploy.sh up --with-nginx
        
        echo ""
        print_success "Deployment complete!"
        print_info "Application is running at:"
        echo "  • http://localhost (nginx)"
        echo "  • http://localhost:5000 (direct)"
        ;;
    *)
        print_error "Invalid option"
        exit 1
        ;;
esac

echo ""
print_info "Useful commands:"
echo "  • View logs:    ./deploy.sh logs"
echo "  • Stop app:     ./deploy.sh stop"
echo "  • Restart app:  ./deploy.sh restart"
echo ""
