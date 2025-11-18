-- Migration: Add acknowledged_by column to alerts table
-- This column stores who acknowledged the alert (user's full name or "system" for auto-acknowledgment)

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'alerts' AND column_name = 'acknowledged_by'
    ) THEN
        ALTER TABLE alerts ADD COLUMN acknowledged_by VARCHAR(255);
        RAISE NOTICE 'Added acknowledged_by column to alerts table';
    END IF;
END $$;
