#!/bin/bash

set -e

echo "========================================="
echo "  Logo Download & Storage Script"
echo "========================================="
echo ""

cd ~/MikroTikMon
source .env

# Get current logo URL from database
LOGO_URL=$(docker exec -i mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -t -c "SELECT logo_url FROM app_settings;" | xargs)

echo "Current logo URL: $LOGO_URL"
echo ""

if [ -z "$LOGO_URL" ] || [ "$LOGO_URL" = "" ]; then
    echo "❌ No logo URL found in database"
    exit 1
fi

# Create attached_assets directory if it doesn't exist
mkdir -p attached_assets

# Download the logo
echo "📥 Downloading logo from: $LOGO_URL"
curl -L -o attached_assets/logo.png "$LOGO_URL" --max-time 30

if [ $? -eq 0 ] && [ -f attached_assets/logo.png ]; then
    FILE_SIZE=$(du -h attached_assets/logo.png | cut -f1)
    echo "✅ Logo downloaded successfully ($FILE_SIZE)"
    echo ""
    
    # Update database to use local file
    echo "📝 Updating database to use local logo..."
    docker exec -i mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -c "UPDATE app_settings SET logo_url = 'attached_assets/logo.png';"
    
    echo "✅ Database updated"
    echo ""
    
    # Verify the change
    NEW_LOGO_URL=$(docker exec -i mikrotik-monitor-db psql -U $PGUSER -d $PGDATABASE -t -c "SELECT logo_url FROM app_settings;" | xargs)
    echo "New logo URL: $NEW_LOGO_URL"
    echo ""
    
    echo "========================================="
    echo "  ✅ Logo Successfully Stored Locally"
    echo "========================================="
    echo ""
    echo "Logo location: $(pwd)/attached_assets/logo.png"
    echo "File size: $FILE_SIZE"
    echo ""
    echo "The logo will now load from local storage instead of"
    echo "the external URL. Refresh your browser to see it!"
    echo ""
else
    echo "❌ Failed to download logo from $LOGO_URL"
    echo ""
    echo "Please check:"
    echo "  1. The URL is accessible"
    echo "  2. Your server has internet connectivity"
    echo "  3. The URL is correct"
    exit 1
fi
