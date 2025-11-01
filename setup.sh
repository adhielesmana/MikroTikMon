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

# Print banner
echo ""
echo "========================================="
echo "  MikroTik Monitor - Setup Script"
echo "========================================="
echo ""

# Check prerequisites
print_info "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    echo "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    echo "Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

print_success "Docker and Docker Compose are installed"

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

# Create .env file
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

# Update .env file with generated values
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/your_secure_database_password_here/${DB_PASSWORD_ESCAPED}/g" .env
    sed -i '' "s/your_random_secret_key_minimum_32_characters_long/${SESSION_SECRET_ESCAPED}/g" .env
else
    # Linux
    sed -i "s/your_secure_database_password_here/${DB_PASSWORD_ESCAPED}/g" .env
    sed -i "s/your_random_secret_key_minimum_32_characters_long/${SESSION_SECRET_ESCAPED}/g" .env
fi

print_success "Secure credentials generated"

# Prompt for optional SMTP configuration
echo ""
print_info "Email notification setup (optional)"
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
print_info "Creating necessary directories..."
mkdir -p logs
mkdir -p ssl
print_success "Directories created"

# Summary
echo ""
echo "========================================="
echo "  Setup Complete!"
echo "========================================="
echo ""
print_success "Configuration file created: .env"
print_info "Database password: ${DB_PASSWORD}"
print_info "Session secret: Generated and saved"
echo ""
print_warning "IMPORTANT: Keep your .env file secure and never commit it to git!"
echo ""
print_info "Next steps:"
echo "  1. Review and customize .env if needed"
echo "  2. Run: ./deploy.sh to start the application"
echo ""
