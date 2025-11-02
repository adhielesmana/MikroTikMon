-- Migration: Add cloud_ddns_hostname column to routers table
-- Date: 2025-11-02
-- Description: Adds Cloud DDNS hostname column for REST API HTTPS fallback support

-- Add cloud_ddns_hostname column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'routers' 
        AND column_name = 'cloud_ddns_hostname'
    ) THEN
        ALTER TABLE routers 
        ADD COLUMN cloud_ddns_hostname VARCHAR(255);
        
        -- Add comment
        COMMENT ON COLUMN routers.cloud_ddns_hostname IS 
            'Auto-extracted Cloud DDNS hostname from SSL certificate (for REST API HTTPS and display purposes only)';
        
        RAISE NOTICE 'Column cloud_ddns_hostname added successfully';
    ELSE
        RAISE NOTICE 'Column cloud_ddns_hostname already exists, skipping';
    END IF;
END $$;
