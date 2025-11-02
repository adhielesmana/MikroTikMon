#!/bin/bash

# ========================================
# MikroTik Monitor - Initial Setup Script
# ========================================
# This script automates the initial setup process
# Run this once before first deployment

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored messages
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Function to generate random password
generate_password() {
    openssl rand -base64 24 | tr -d "=+/" | cut -c1-32
}

# Function to generate session secret
generate_session_secret() {
    openssl rand -base64 32
}

# Function to validate domain format
validate_domain() {
    local domain=$1
    if [[ $domain =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$ ]]; then
        return 0
    else
        return 1
    fi
}

# Function to validate IP address format
validate_ip() {
    local ip=$1
    if [[ $ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        return 0
    else
        return 1
    fi
}

# Function to detect server IP
get_server_ip() {
    # Try multiple methods to get server IP
    local ip=""
    
    # Method 1: Try hostname -I
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    if [ -n "$ip" ]; then
        echo "$ip"
        return 0
    fi
    
    # Method 2: Try ip route
    ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}')
    if [ -n "$ip" ]; then
        echo "$ip"
        return 0
    fi
    
    # Method 3: Try ifconfig
    ip=$(ifconfig 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | head -1)
    if [ -n "$ip" ]; then
        echo "$ip"
        return 0
    fi
    
    echo "unknown"
}

# Function to update nginx.conf with domain
update_nginx_config() {
    local domain=$1
    
    if [ ! -f nginx.conf ]; then
        print_warning "nginx.conf not found, skipping Nginx configuration"
        return 0
    fi
    
    print_info "Updating Nginx configuration with domain: $domain"
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/server_name _;/server_name $domain;/g" nginx.conf
    else
        # Linux
        sed -i "s/server_name _;/server_name $domain;/g" nginx.conf
    fi
    
    print_success "Nginx configuration updated"
}

# Function to setup SSL certificates
setup_ssl_certificates() {
    local domain=$1
    local email=$2
    
    print_info "Setting up SSL certificates for $domain..."
    
    # Check if certbot is installed
    if ! command -v certbot &> /dev/null; then
        print_info "Installing Certbot..."
        if command -v apt &> /dev/null; then
            apt update
            apt install -y certbot
        elif command -v yum &> /dev/null; then
            yum install -y certbot
        else
            print_error "Cannot install Certbot automatically. Please install manually."
            return 1
        fi
    fi
    
    # Stop any running containers to free port 80
    print_info "Stopping containers to free port 80..."
    docker compose down 2>/dev/null || true
    
    # Obtain certificate
    print_info "Obtaining SSL certificate from Let's Encrypt..."
    certbot certonly --standalone \
        -d "$domain" \
        --agree-tos \
        --email "$email" \
        --non-interactive \
        --quiet || {
        print_error "Failed to obtain SSL certificate"
        return 1
    }
    
    # Create ssl directory
    mkdir -p ssl
    
    # Copy certificates
    print_info "Copying certificates to project..."
    cp "/etc/letsencrypt/live/$domain/fullchain.pem" ssl/
    cp "/etc/letsencrypt/live/$domain/privkey.pem" ssl/
    
    # Fix permissions
    chown $USER:$USER ssl/*.pem
    chmod 644 ssl/fullchain.pem
    chmod 600 ssl/privkey.pem
    
    print_success "SSL certificates installed successfully"
    
    # Setup auto-renewal
    setup_ssl_renewal "$domain"
    
    return 0
}

# Function to setup SSL certificate auto-renewal
setup_ssl_renewal() {
    local domain=$1
    local current_dir=$(pwd)
    local username=$(whoami)
    
    print_info "Setting up automatic SSL certificate renewal..."
    
    # Create renewal script
    tee /usr/local/bin/renew-ssl-${domain}.sh > /dev/null <<EOF
#!/bin/bash
# Auto-renewal script for $domain
cd $current_dir
docker compose --profile with-nginx stop nginx 2>/dev/null || true
certbot renew --standalone --quiet --cert-name $domain
cp /etc/letsencrypt/live/$domain/fullchain.pem ssl/
cp /etc/letsencrypt/live/$domain/privkey.pem ssl/
chown $username:$username ssl/*.pem
chmod 644 ssl/fullchain.pem
chmod 600 ssl/privkey.pem
docker compose --profile with-nginx start nginx 2>/dev/null || true
echo "SSL certificate renewed for $domain: \$(date)" >> /var/log/ssl-renewal-${domain}.log
EOF
    
    chmod +x "/usr/local/bin/renew-ssl-${domain}.sh"
    
    # Add to crontab if not already present
    (crontab -l 2>/dev/null | grep -v "renew-ssl-${domain}.sh"; echo "0 3 1 * * /usr/local/bin/renew-ssl-${domain}.sh >> /var/log/ssl-renewal-${domain}.log 2>&1") | crontab -
    
    print_success "SSL auto-renewal configured (runs monthly)"
}

# Print banner
echo ""
echo "========================================="
echo "  MikroTik Monitor - Setup Script"
echo "========================================="
echo ""

# Function to detect OS
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        echo "$ID"
    elif [ -f /etc/redhat-release ]; then
        echo "rhel"
    elif [ "$(uname)" == "Darwin" ]; then
        echo "macos"
    else
        echo "unknown"
    fi
}

# Function to install Docker
install_docker() {
    local os=$(detect_os)
    
    print_info "Installing Docker for $os..."
    
    case $os in
        ubuntu|debian)
            print_info "Installing Docker on Ubuntu/Debian..."
            
            # Update package index
            apt-get update
            
            # Install prerequisites
            apt-get install -y \
                ca-certificates \
                curl \
                gnupg \
                lsb-release
            
            # Add Docker's official GPG key
            mkdir -p /etc/apt/keyrings
            curl -fsSL https://download.docker.com/linux/$os/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
            
            # Set up repository
            echo \
              "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$os \
              $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
            
            # Install Docker Engine
            apt-get update
            apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            
            # Add current user to docker group
            usermod -aG docker $USER
            
            print_success "Docker installed successfully"
            print_warning "You may need to log out and back in for group changes to take effect"
            ;;
            
        centos|rhel|fedora)
            print_info "Installing Docker on CentOS/RHEL/Fedora..."
            
            # Install prerequisites
            yum install -y yum-utils
            
            # Add repository
            yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
            
            # Install Docker Engine
            yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            
            # Start Docker
            systemctl start docker
            systemctl enable docker
            
            # Add current user to docker group
            usermod -aG docker $USER
            
            print_success "Docker installed successfully"
            print_warning "You may need to log out and back in for group changes to take effect"
            ;;
            
        macos)
            print_error "Please install Docker Desktop for Mac manually:"
            echo "  1. Visit: https://www.docker.com/products/docker-desktop"
            echo "  2. Download Docker Desktop for Mac"
            echo "  3. Install and start Docker Desktop"
            echo "  4. Run this script again"
            return 1
            ;;
            
        *)
            print_error "Unsupported OS: $os"
            echo "Please install Docker manually: https://docs.docker.com/get-docker/"
            return 1
            ;;
    esac
    
    # Start Docker service
    if [ "$os" != "macos" ]; then
        systemctl start docker 2>/dev/null || true
        systemctl enable docker 2>/dev/null || true
    fi
    
    return 0
}

# Function to install other prerequisites
install_prerequisites() {
    local os=$(detect_os)
    
    print_info "Installing additional prerequisites..."
    
    case $os in
        ubuntu|debian)
            apt-get update
            apt-get install -y \
                curl \
                wget \
                git \
                openssl \
                dnsutils \
                net-tools
            ;;
            
        centos|rhel|fedora)
            yum install -y \
                curl \
                wget \
                git \
                openssl \
                bind-utils \
                net-tools
            ;;
            
        macos)
            # Check if Homebrew is installed
            if ! command -v brew &> /dev/null; then
                print_info "Installing Homebrew..."
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            fi
            
            brew install openssl git wget
            ;;
    esac
    
    print_success "Prerequisites installed"
}

# Check prerequisites
print_info "Checking prerequisites..."

# Check for Docker
if ! command -v docker &> /dev/null; then
    print_warning "Docker is not installed"
    echo ""
    read -p "Would you like to install Docker automatically? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if install_docker; then
            print_success "Docker installation complete"
            
            # Check if we need to start a new shell for group changes
            if ! docker ps &> /dev/null 2>&1; then
                print_warning "Docker group changes require a new login session"
                echo ""
                echo "Please run ONE of the following commands:"
                echo "  Option 1 (Recommended): Log out and log back in, then run ./setup.sh again"
                echo "  Option 2 (Quick): Run: newgrp docker && ./setup.sh"
                echo ""
                exit 0
            fi
        else
            print_error "Docker installation failed"
            echo "Please install Docker manually: https://docs.docker.com/get-docker/"
            exit 1
        fi
    else
        print_error "Docker is required to continue"
        echo "Please install Docker manually: https://docs.docker.com/get-docker/"
        exit 1
    fi
fi

# Check for Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    print_warning "Docker Compose plugin not found"
    
    # Try to install compose plugin if Docker is already installed
    local os=$(detect_os)
    case $os in
        ubuntu|debian)
            print_info "Installing Docker Compose plugin..."
            apt-get update
            apt-get install -y docker-compose-plugin
            print_success "Docker Compose plugin installed"
            ;;
        centos|rhel|fedora)
            print_info "Installing Docker Compose plugin..."
            yum install -y docker-compose-plugin
            print_success "Docker Compose plugin installed"
            ;;
        *)
            print_error "Please install Docker Compose manually"
            echo "Visit: https://docs.docker.com/compose/install/"
            exit 1
            ;;
    esac
fi

# Install other prerequisites
if ! command -v openssl &> /dev/null || ! command -v git &> /dev/null; then
    print_info "Some prerequisites are missing"
    read -p "Install missing prerequisites? (Y/n): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        install_prerequisites
    fi
fi

print_success "All prerequisites are installed"

# Detect server IP
SERVER_IP=$(get_server_ip)
if [ "$SERVER_IP" != "unknown" ]; then
    print_info "Detected server IP: $SERVER_IP"
fi

# Check if .env already exists
if [ -f .env ]; then
    print_warning ".env file already exists"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Keeping existing .env file"
        exit 0
    fi
fi

# ========================================
# Domain/IP Configuration
# ========================================
echo ""
echo "========================================="
echo "  Network Configuration"
echo "========================================="
echo ""
print_info "This application can be accessed via IP address or domain name."
echo ""
echo "Options:"
echo "  1. IP address only (HTTP) - Quick setup, no SSL"
echo "  2. Domain name (HTTP) - Use custom domain without SSL"
echo "  3. Domain name (HTTPS) - Use custom domain with automatic SSL setup"
echo ""

read -p "Choose option (1/2/3): " -n 1 -r network_option
echo
echo

USE_HTTPS=false
USE_DOMAIN=false
DOMAIN=""
APP_URL=""

case $network_option in
    1)
        # IP address only
        if [ "$SERVER_IP" != "unknown" ]; then
            APP_URL="http://${SERVER_IP}:5000"
            print_success "Using IP address: $SERVER_IP"
        else
            read -p "Enter server IP address: " user_ip
            if validate_ip "$user_ip"; then
                APP_URL="http://${user_ip}:5000"
                print_success "Using IP address: $user_ip"
            else
                print_error "Invalid IP address format"
                exit 1
            fi
        fi
        ;;
    
    2)
        # Domain without SSL
        read -p "Enter domain name (e.g., mon.maxnetplus.id): " user_domain
        if validate_domain "$user_domain"; then
            DOMAIN="$user_domain"
            USE_DOMAIN=true
            APP_URL="http://${user_domain}"
            print_success "Using domain: $user_domain (HTTP only)"
            
            # Update nginx.conf
            update_nginx_config "$DOMAIN"
        else
            print_error "Invalid domain format"
            exit 1
        fi
        ;;
    
    3)
        # Domain with SSL
        read -p "Enter domain name (e.g., mon.maxnetplus.id): " user_domain
        if validate_domain "$user_domain"; then
            DOMAIN="$user_domain"
            USE_DOMAIN=true
            USE_HTTPS=true
            APP_URL="https://${user_domain}"
            print_success "Using domain: $user_domain (HTTPS)"
            
            # Update nginx.conf
            update_nginx_config "$DOMAIN"
            
            # Check DNS before proceeding
            echo ""
            print_warning "IMPORTANT: Before continuing, ensure DNS is configured!"
            echo ""
            echo "Add this DNS record at your domain provider:"
            echo "  Type: A"
            echo "  Name: $(echo $DOMAIN | cut -d. -f1)"
            echo "  Value: $SERVER_IP"
            echo ""
            print_info "Verifying DNS configuration..."
            
            DNS_IP=$(dig +short "$DOMAIN" 2>/dev/null | head -1)
            if [ -n "$DNS_IP" ]; then
                print_success "DNS resolves to: $DNS_IP"
                if [ "$DNS_IP" != "$SERVER_IP" ] && [ "$SERVER_IP" != "unknown" ]; then
                    print_warning "DNS IP ($DNS_IP) differs from server IP ($SERVER_IP)"
                    read -p "Continue anyway? (y/N): " -n 1 -r
                    echo
                    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                        print_info "Please configure DNS correctly and run setup again"
                        exit 0
                    fi
                fi
            else
                print_warning "DNS not configured yet or not propagated"
                read -p "Continue anyway? (y/N): " -n 1 -r
                echo
                if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                    print_info "Please configure DNS and run setup again"
                    exit 0
                fi
            fi
            
            # Get email for SSL certificate
            echo ""
            read -p "Enter email for SSL certificate notifications: " ssl_email
            if [ -z "$ssl_email" ]; then
                print_error "Email is required for SSL certificates"
                exit 1
            fi
        else
            print_error "Invalid domain format"
            exit 1
        fi
        ;;
    
    *)
        print_error "Invalid option"
        exit 1
        ;;
esac

echo ""
print_success "Network configuration complete"
echo "  Access URL: $APP_URL"

# Create .env file
echo ""
print_info "Creating .env file from template..."
cp .env.example .env
print_success ".env file created"

# Generate secure values
print_info "Generating secure credentials..."

DB_PASSWORD=$(generate_password)
SESSION_SECRET=$(generate_session_secret)

# Escape values for sed (replace / with \/)
DB_PASSWORD_ESCAPED=$(echo "$DB_PASSWORD" | sed 's/[\/&]/\\&/g')
SESSION_SECRET_ESCAPED=$(echo "$SESSION_SECRET" | sed 's/[\/&]/\\&/g')
APP_URL_ESCAPED=$(echo "$APP_URL" | sed 's/[\/&]/\\&/g')

# Update .env file with generated values
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/your_secure_database_password_here/${DB_PASSWORD_ESCAPED}/g" .env
    sed -i '' "s/your_random_secret_key_minimum_32_characters_long/${SESSION_SECRET_ESCAPED}/g" .env
    sed -i '' "s|APP_URL=.*|APP_URL=${APP_URL_ESCAPED}|g" .env
else
    # Linux
    sed -i "s/your_secure_database_password_here/${DB_PASSWORD_ESCAPED}/g" .env
    sed -i "s/your_random_secret_key_minimum_32_characters_long/${SESSION_SECRET_ESCAPED}/g" .env
    sed -i "s|APP_URL=.*|APP_URL=${APP_URL_ESCAPED}|g" .env
fi

# Set secure cookies flag for HTTPS
if [ "$USE_HTTPS" = true ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' '/^USE_SECURE_COOKIES=/d' .env
        echo "USE_SECURE_COOKIES=true" >> .env
    else
        sed -i '/^USE_SECURE_COOKIES=/d' .env
        echo "USE_SECURE_COOKIES=true" >> .env
    fi
fi

print_success "Secure credentials generated"

# Prompt for optional SMTP configuration
echo ""
echo "========================================="
echo "  Email Notifications (Optional)"
echo "========================================="
echo ""
read -p "Do you want to configure email notifications? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    read -p "SMTP Host (e.g., smtp.gmail.com): " smtp_host
    read -p "SMTP Port (default: 587): " smtp_port
    smtp_port=${smtp_port:-587}
    read -p "SMTP User (email address): " smtp_user
    read -sp "SMTP Password (app password): " smtp_pass
    echo
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/SMTP_HOST=.*/SMTP_HOST=${smtp_host}/" .env
        sed -i '' "s/SMTP_PORT=.*/SMTP_PORT=${smtp_port}/" .env
        sed -i '' "s/SMTP_USER=.*/SMTP_USER=${smtp_user}/" .env
        sed -i '' "s/SMTP_PASS=.*/SMTP_PASS=${smtp_pass}/" .env
        sed -i '' "s/SMTP_FROM_EMAIL=.*/SMTP_FROM_EMAIL=${smtp_user}/" .env
    else
        sed -i "s/SMTP_HOST=.*/SMTP_HOST=${smtp_host}/" .env
        sed -i "s/SMTP_PORT=.*/SMTP_PORT=${smtp_port}/" .env
        sed -i "s/SMTP_USER=.*/SMTP_USER=${smtp_user}/" .env
        sed -i "s/SMTP_PASS=.*/SMTP_PASS=${smtp_pass}/" .env
        sed -i "s/SMTP_FROM_EMAIL=.*/SMTP_FROM_EMAIL=${smtp_user}/" .env
    fi
    
    print_success "SMTP configuration saved"
fi

# Create necessary directories
echo ""
print_info "Creating necessary directories..."
mkdir -p logs
mkdir -p ssl
print_success "Directories created"

# Setup SSL certificates if HTTPS is enabled
if [ "$USE_HTTPS" = true ]; then
    echo ""
    echo "========================================="
    echo "  SSL Certificate Setup"
    echo "========================================="
    echo ""
    
    if setup_ssl_certificates "$DOMAIN" "$ssl_email"; then
        print_success "SSL certificates configured successfully"
    else
        print_error "SSL certificate setup failed"
        print_warning "You can set up SSL manually later using:"
        echo "  certbot certonly --standalone -d $DOMAIN"
        echo ""
        read -p "Continue without SSL? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
        # Downgrade to HTTP
        APP_URL="http://${DOMAIN}"
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|APP_URL=.*|APP_URL=${APP_URL}|g" .env
            sed -i '' '/^USE_SECURE_COOKIES=/d' .env
        else
            sed -i "s|APP_URL=.*|APP_URL=${APP_URL}|g" .env
            sed -i '/^USE_SECURE_COOKIES=/d' .env
        fi
    fi
fi

# Google OAuth configuration (optional)
echo ""
echo "========================================="
echo "  Google OAuth (Optional)"
echo "========================================="
echo ""
print_info "Google OAuth allows users to login with their Google account"
read -p "Do you want to configure Google OAuth? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "To set up Google OAuth:"
    echo "1. Go to: https://console.cloud.google.com/apis/credentials"
    echo "2. Create OAuth 2.0 Client ID"
    echo "3. Add authorized redirect URI: ${APP_URL}/api/auth/google/callback"
    echo ""
    read -p "Google Client ID: " google_client_id
    read -p "Google Client Secret: " google_client_secret
    
    if [ -n "$google_client_id" ] && [ -n "$google_client_secret" ]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/GOOGLE_CLIENT_ID=.*/GOOGLE_CLIENT_ID=${google_client_id}/" .env
            sed -i '' "s/GOOGLE_CLIENT_SECRET=.*/GOOGLE_CLIENT_SECRET=${google_client_secret}/" .env
        else
            sed -i "s/GOOGLE_CLIENT_ID=.*/GOOGLE_CLIENT_ID=${google_client_id}/" .env
            sed -i "s/GOOGLE_CLIENT_SECRET=.*/GOOGLE_CLIENT_SECRET=${google_client_secret}/" .env
        fi
        print_success "Google OAuth configuration saved"
    fi
fi

# Summary
echo ""
echo "========================================="
echo "  Setup Complete!"
echo "========================================="
echo ""
print_success "Configuration file created: .env"
echo ""
echo "Configuration Summary:"
echo "  Access URL: $APP_URL"
echo "  Database Password: $DB_PASSWORD"
echo "  Session Secret: Generated and saved"
if [ "$USE_HTTPS" = true ]; then
    echo "  SSL Certificates: Installed and auto-renewal configured"
fi
echo ""
print_warning "IMPORTANT: Keep your .env file secure and never commit it to git!"
echo ""
print_info "Next steps:"
if [ "$USE_HTTPS" = true ] || [ "$USE_DOMAIN" = true ]; then
    echo "  1. Run: ./deploy.sh up --with-nginx"
else
    echo "  1. Run: ./deploy.sh up"
fi
echo "  2. Access: $APP_URL"
echo "  3. Login with default credentials: admin / admin"
echo "  4. Change password on first login"
echo ""

if [ "$USE_DOMAIN" = true ] && [ "$USE_HTTPS" = false ]; then
    print_info "To enable HTTPS later, run: certbot certonly --standalone -d $DOMAIN"
fi

print_success "Setup complete! You're ready to deploy."
echo ""
