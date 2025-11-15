-- Add retention_days column to app_settings table
-- This allows users to configure data retention from the UI

ALTER TABLE app_settings
ADD COLUMN IF NOT EXISTS retention_days INTEGER;

COMMENT ON COLUMN app_settings.retention_days IS 'Number of days to retain traffic data (null = keep forever)';
