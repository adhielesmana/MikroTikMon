-- Migration: Add missing columns safely (idempotent - safe to run multiple times)
-- This fixes schema mismatches when restoring old backups

-- Add cloud_ddns_hostname to routers table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'routers' AND column_name = 'cloud_ddns_hostname'
    ) THEN
        ALTER TABLE routers ADD COLUMN cloud_ddns_hostname VARCHAR(255);
        RAISE NOTICE 'Added cloud_ddns_hostname column to routers table';
    END IF;
END $$;

-- Add port_comment to alerts table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'alerts' AND column_name = 'port_comment'
    ) THEN
        ALTER TABLE alerts ADD COLUMN port_comment VARCHAR(255);
        RAISE NOTICE 'Added port_comment column to alerts table';
    END IF;
END $$;

-- Add retention_days to app_settings table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'app_settings' AND column_name = 'retention_days'
    ) THEN
        ALTER TABLE app_settings ADD COLUMN retention_days INTEGER;
        RAISE NOTICE 'Added retention_days column to app_settings table';
    END IF;
END $$;

-- Add interface_comment to monitored_ports table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'monitored_ports' AND column_name = 'interface_comment'
    ) THEN
        ALTER TABLE monitored_ports ADD COLUMN interface_comment TEXT;
        RAISE NOTICE 'Added interface_comment column to monitored_ports table';
    END IF;
END $$;

-- Add interface_mac_address to monitored_ports table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'monitored_ports' AND column_name = 'interface_mac_address'
    ) THEN
        ALTER TABLE monitored_ports ADD COLUMN interface_mac_address VARCHAR(17);
        RAISE NOTICE 'Added interface_mac_address column to monitored_ports table';
    END IF;
END $$;

-- Add last_interface_update to monitored_ports table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'monitored_ports' AND column_name = 'last_interface_update'
    ) THEN
        ALTER TABLE monitored_ports ADD COLUMN last_interface_update TIMESTAMP;
        RAISE NOTICE 'Added last_interface_update column to monitored_ports table';
    END IF;
END $$;
