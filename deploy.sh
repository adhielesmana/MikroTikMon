#!/bin/bash

# ========================================
# MikroTik Monitor - Deployment Script
# ========================================
# This script automates the deployment process

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

# Print banner
echo ""
echo "========================================="
echo "  MikroTik Monitor - Deploy Script"
echo "========================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    print_error ".env file not found!"
    print_info "Run ./setup.sh first to create configuration"
    exit 1
fi

# Parse command line arguments
COMMAND=${1:-up}
WITH_NGINX=${2:-}

# Check prerequisites
print_info "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed"
    exit 1
fi

# Determine docker-compose command
if docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

print_success "Docker is ready"

# Handle different deployment commands
case $COMMAND in
    up|start)
        print_info "Starting MikroTik Monitor..."
        
        # Build images
        print_info "Building Docker images..."
        if [ "$WITH_NGINX" = "--with-nginx" ]; then
            $DOCKER_COMPOSE --profile with-nginx build
        else
            $DOCKER_COMPOSE build
        fi
        print_success "Images built successfully"
        
        # Start containers
        print_info "Starting containers..."
        if [ "$WITH_NGINX" = "--with-nginx" ]; then
            $DOCKER_COMPOSE --profile with-nginx up -d
        else
            $DOCKER_COMPOSE up -d
        fi
        print_success "Containers started"
        
        # Wait for database to be ready
        print_info "Waiting for database to be ready..."
        sleep 10
        
        # Run database migrations
        print_info "Running database migrations..."
        $DOCKER_COMPOSE exec -T app npm run db:push || {
            print_warning "Migration might have failed, trying with --force..."
            $DOCKER_COMPOSE exec -T app npm run db:push --force
        }
        print_success "Database migrations completed"
        
        # Show status
        echo ""
        print_success "Deployment complete!"
        echo ""
        print_info "Application is running at:"
        if [ "$WITH_NGINX" = "--with-nginx" ]; then
            echo "  • http://localhost (Nginx)"
        fi
        echo "  • http://localhost:5000 (Direct)"
        echo ""
        print_info "Useful commands:"
        echo "  • View logs:    ./deploy.sh logs"
        echo "  • Stop app:     ./deploy.sh stop"
        echo "  • Restart app:  ./deploy.sh restart"
        echo "  • View status:  ./deploy.sh status"
        echo ""
        ;;
        
    down|stop)
        print_info "Stopping MikroTik Monitor..."
        $DOCKER_COMPOSE --profile with-nginx down
        print_success "Containers stopped"
        ;;
        
    restart)
        print_info "Restarting MikroTik Monitor..."
        $DOCKER_COMPOSE --profile with-nginx restart
        print_success "Containers restarted"
        ;;
        
    logs)
        print_info "Showing logs (Ctrl+C to exit)..."
        $DOCKER_COMPOSE --profile with-nginx logs -f
        ;;
        
    status)
        print_info "Container status:"
        $DOCKER_COMPOSE --profile with-nginx ps
        ;;
        
    clean)
        print_warning "This will remove all containers, volumes, and data!"
        read -p "Are you sure? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_info "Cleaning up..."
            $DOCKER_COMPOSE --profile with-nginx down -v
            docker image prune -f
            print_success "Cleanup complete"
        else
            print_info "Cleanup cancelled"
        fi
        ;;
        
    update)
        print_info "Updating MikroTik Monitor..."
        
        # Pull latest code
        if [ -d .git ]; then
            print_info "Pulling latest changes..."
            git pull
        fi
        
        # Rebuild and restart
        print_info "Rebuilding images..."
        if [ "$WITH_NGINX" = "--with-nginx" ]; then
            $DOCKER_COMPOSE --profile with-nginx build --no-cache
            $DOCKER_COMPOSE --profile with-nginx up -d
        else
            $DOCKER_COMPOSE build --no-cache
            $DOCKER_COMPOSE up -d
        fi
        
        # Run migrations
        print_info "Running database migrations..."
        $DOCKER_COMPOSE exec -T app npm run db:push || {
            print_warning "Migration might have failed, trying with --force..."
            $DOCKER_COMPOSE exec -T app npm run db:push --force
        }
        
        print_success "Update complete"
        ;;
        
    backup)
        print_info "Creating database backup..."
        BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"
        $DOCKER_COMPOSE exec -T postgres pg_dump -U mikrotik_user mikrotik_monitor > "$BACKUP_FILE"
        print_success "Backup created: $BACKUP_FILE"
        ;;
        
    restore)
        if [ -z "$2" ]; then
            print_error "Usage: ./deploy.sh restore <backup_file>"
            exit 1
        fi
        print_warning "This will restore database from: $2"
        read -p "Continue? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_info "Restoring database..."
            cat "$2" | $DOCKER_COMPOSE exec -T postgres psql -U mikrotik_user mikrotik_monitor
            print_success "Database restored"
        fi
        ;;
        
    shell)
        print_info "Opening shell in application container..."
        $DOCKER_COMPOSE exec app sh
        ;;
        
    db-shell)
        print_info "Opening PostgreSQL shell..."
        $DOCKER_COMPOSE exec postgres psql -U mikrotik_user mikrotik_monitor
        ;;
        
    *)
        echo "Usage: ./deploy.sh [command] [options]"
        echo ""
        echo "Commands:"
        echo "  up, start       Start the application (default)"
        echo "  down, stop      Stop the application"
        echo "  restart         Restart the application"
        echo "  logs            View application logs"
        echo "  status          Show container status"
        echo "  update          Update and rebuild the application"
        echo "  clean           Remove all containers and volumes"
        echo "  backup          Create database backup"
        echo "  restore <file>  Restore database from backup"
        echo "  shell           Open shell in app container"
        echo "  db-shell        Open PostgreSQL shell"
        echo ""
        echo "Options:"
        echo "  --with-nginx    Include Nginx reverse proxy"
        echo ""
        echo "Examples:"
        echo "  ./deploy.sh up"
        echo "  ./deploy.sh up --with-nginx"
        echo "  ./deploy.sh logs"
        echo "  ./deploy.sh backup"
        exit 1
        ;;
esac
