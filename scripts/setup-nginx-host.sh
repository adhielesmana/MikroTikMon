#!/bin/bash

# ========================================
# Nginx Host-Level Setup Script
# ========================================
# This script sets up nginx on the host server (outside Docker)
# for running multiple applications on one server

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${BLUE}ℹ${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }

echo ""
echo "========================================="
echo "  Nginx Host-Level Setup"
echo "========================================="
echo ""

# Get domain name
read -p "Enter your domain name (e.g., mon.maxnetplus.id): " DOMAIN_NAME
if [ -z "$DOMAIN_NAME" ]; then
    print_error "Domain name is required"
    exit 1
fi

# Check if nginx is installed
print_info "Checking if nginx is installed..."
if ! command -v nginx &> /dev/null; then
    print_warning "Nginx not found. Installing nginx..."
    apt-get update
    apt-get install -y nginx
    print_success "Nginx installed"
else
    print_success "Nginx is already installed"
fi

# Check if certbot is installed (for Let's Encrypt)
print_info "Checking if certbot is installed..."
if ! command -v certbot &> /dev/null; then
    print_warning "Certbot not found. Installing certbot..."
    apt-get update
    apt-get install -y certbot
    print_success "Certbot installed"
else
    print_success "Certbot is already installed"
fi

# Create nginx configuration
print_info "Creating nginx configuration..."
CONFIG_FILE="/etc/nginx/sites-available/mikrotik-monitor"

# Replace domain in config
sed "s/mon\.maxnetplus\.id/$DOMAIN_NAME/g" nginx-host.conf > "$CONFIG_FILE"
print_success "Configuration created at $CONFIG_FILE"

# Add WebSocket map to main nginx.conf if not present
print_info "Configuring WebSocket support in main nginx.conf..."
if ! grep -q "map \$http_upgrade \$connection_upgrade" /etc/nginx/nginx.conf; then
    # Add map directive to http block
    sed -i '/http {/a \    # Smart WebSocket connection handling\n    map $http_upgrade $connection_upgrade {\n        default upgrade;\n        '\'\''      close;\n    }\n' /etc/nginx/nginx.conf
    print_success "WebSocket map added to nginx.conf"
else
    print_info "WebSocket map already present in nginx.conf"
fi

# Add rate limiting zones to main nginx.conf if not present
print_info "Configuring rate limiting zones..."
if ! grep -q "limit_req_zone.*mikrotik_general" /etc/nginx/nginx.conf; then
    sed -i '/http {/a \    # Rate limiting zones for MikroTik Monitor\n    limit_req_zone $binary_remote_addr zone=mikrotik_general:10m rate=10r/s;\n    limit_req_zone $binary_remote_addr zone=mikrotik_api:10m rate=30r/s;\n' /etc/nginx/nginx.conf
    print_success "Rate limiting zones added to nginx.conf"
else
    print_info "Rate limiting zones already present in nginx.conf"
fi

# Enable site
print_info "Enabling site..."
ln -sf "$CONFIG_FILE" /etc/nginx/sites-enabled/mikrotik-monitor
print_success "Site enabled"

# Test nginx configuration
print_info "Testing nginx configuration..."
nginx -t
print_success "Nginx configuration is valid"

# Reload nginx
print_info "Reloading nginx..."
systemctl reload nginx
print_success "Nginx reloaded"

# Setup SSL certificate
echo ""
print_info "Setting up SSL certificate with Let's Encrypt..."
print_warning "Make sure your domain $DOMAIN_NAME points to this server's IP address"
read -p "Continue with SSL setup? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Get email for Let's Encrypt
    read -p "Enter your email for Let's Encrypt notifications: " EMAIL
    
    if [ -z "$EMAIL" ]; then
        print_error "Email is required for Let's Encrypt"
        exit 1
    fi
    
    # Stop nginx temporarily
    print_info "Stopping nginx temporarily..."
    systemctl stop nginx
    
    # Run certbot in standalone mode
    print_info "Generating SSL certificate..."
    certbot certonly --standalone -d "$DOMAIN_NAME" --email "$EMAIL" --agree-tos --non-interactive
    
    if [ $? -eq 0 ]; then
        print_success "SSL certificate obtained!"
        
        # Update nginx config with SSL
        print_info "Updating nginx configuration for HTTPS..."
        cat > /etc/nginx/sites-available/mikrotik-monitor << EOF
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name $DOMAIN_NAME;
    return 301 https://\$host\$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name $DOMAIN_NAME;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem;

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
        proxy_pass http://127.0.0.1:5000;
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
        proxy_pass http://127.0.0.1:5000;
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
        
        print_info "Starting nginx..."
        systemctl start nginx
        
        print_success "HTTPS configured!"
        
        # Setup auto-renewal
        print_info "Setting up automatic certificate renewal..."
        if ! crontab -l 2>/dev/null | grep -q "certbot renew"; then
            (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --deploy-hook 'systemctl reload nginx'") | crontab -
            print_success "Auto-renewal configured (runs daily at 3 AM)"
        else
            print_info "Auto-renewal already configured"
        fi
    else
        print_error "SSL certificate generation failed"
        print_info "Starting nginx without SSL..."
        systemctl start nginx
    fi
else
    print_warning "SSL setup skipped. You can run certbot manually later:"
    echo "  sudo certbot --nginx -d $DOMAIN_NAME"
fi

# Final instructions
echo ""
print_success "Nginx host-level setup complete!"
echo ""
print_info "Your application is now accessible at:"
echo "  • https://$DOMAIN_NAME (with SSL)"
echo "  • http://$DOMAIN_NAME (redirects to HTTPS)"
echo ""
print_info "Useful commands:"
echo "  • Test config:   nginx -t"
echo "  • Reload nginx:  systemctl reload nginx"
echo "  • View logs:     tail -f /var/log/nginx/mikrotik-monitor-*.log"
echo "  • Renew SSL:     certbot renew"
echo ""
print_info "Next steps:"
echo "  1. Start your Docker application (without nginx profile)"
echo "     ./deploy.sh up"
echo ""
echo "  2. Verify your app is accessible at https://$DOMAIN_NAME"
echo ""
