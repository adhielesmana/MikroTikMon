#!/bin/bash
#
# Automated Database Backup Script
# Creates compressed daily backups with retention policy
#

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/app/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-730}"  # Default: 2 years (730 days)
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="mikrotik_monitor_backup_${DATE}.sql"
COMPRESSED_FILE="${BACKUP_FILE}.gz"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "=========================================="
echo "  Database Backup - $(date)"
echo "=========================================="
echo ""

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"
echo -e "${GREEN}✓${NC} Backup directory: $BACKUP_DIR"

# Create database backup
echo -e "${YELLOW}⏳${NC} Creating database backup..."
if pg_dump -U "$PGUSER" -d "$PGDATABASE" -h "$PGHOST" -p "$PGPORT" > "$BACKUP_DIR/$BACKUP_FILE" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Database dump completed: $BACKUP_FILE"
    
    # Get uncompressed size
    UNCOMPRESSED_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}✓${NC} Uncompressed size: $UNCOMPRESSED_SIZE"
    
    # Compress the backup
    echo -e "${YELLOW}⏳${NC} Compressing backup..."
    if gzip "$BACKUP_DIR/$BACKUP_FILE"; then
        COMPRESSED_SIZE=$(du -h "$BACKUP_DIR/$COMPRESSED_FILE" | cut -f1)
        echo -e "${GREEN}✓${NC} Backup compressed: $COMPRESSED_FILE"
        echo -e "${GREEN}✓${NC} Compressed size: $COMPRESSED_SIZE"
        
        # Calculate compression ratio
        UNCOMPRESSED_KB=$(du -k "$BACKUP_DIR/$COMPRESSED_FILE" | cut -f1)
        gunzip -c "$BACKUP_DIR/$COMPRESSED_FILE" | wc -c > /tmp/uncompressed_size 2>/dev/null
        ORIGINAL_KB=$(cat /tmp/uncompressed_size)
        ORIGINAL_KB=$((ORIGINAL_KB / 1024))
        if [ "$ORIGINAL_KB" -gt 0 ]; then
            RATIO=$(echo "scale=1; (1 - $UNCOMPRESSED_KB / $ORIGINAL_KB) * 100" | bc 2>/dev/null || echo "N/A")
            if [ "$RATIO" != "N/A" ]; then
                echo -e "${GREEN}✓${NC} Compression ratio: ${RATIO}%"
            fi
        fi
        rm -f /tmp/uncompressed_size
    else
        echo -e "${RED}✗${NC} Compression failed!"
        exit 1
    fi
else
    echo -e "${RED}✗${NC} Database dump failed!"
    exit 1
fi

# Cleanup old backups
echo ""
echo -e "${YELLOW}⏳${NC} Cleaning up old backups (older than $RETENTION_DAYS days)..."
DELETED_COUNT=$(find "$BACKUP_DIR" -name "mikrotik_monitor_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
if [ "$DELETED_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} Deleted $DELETED_COUNT old backup(s)"
else
    echo -e "${GREEN}✓${NC} No old backups to delete"
fi

# Show backup summary
echo ""
echo "=========================================="
echo "  Backup Summary"
echo "=========================================="
echo -e "Location: $BACKUP_DIR"
echo -e "Latest: $COMPRESSED_FILE"
echo ""
echo "Recent backups:"
ls -lh "$BACKUP_DIR"/mikrotik_monitor_backup_*.sql.gz 2>/dev/null | tail -5 | awk '{print "  " $9 " (" $5 ")"}'
echo ""
TOTAL_BACKUPS=$(ls -1 "$BACKUP_DIR"/mikrotik_monitor_backup_*.sql.gz 2>/dev/null | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
echo -e "${GREEN}✓${NC} Total backups: $TOTAL_BACKUPS"
echo -e "${GREEN}✓${NC} Total size: $TOTAL_SIZE"
echo "=========================================="

exit 0
