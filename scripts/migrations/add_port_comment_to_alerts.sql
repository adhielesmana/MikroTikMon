-- Migration: Add port_comment column to alerts table
-- Date: 2025-11-03
-- Description: Adds port_comment field to store interface comments from MikroTik routers

-- Add port_comment column if it doesn't exist
ALTER TABLE alerts 
ADD COLUMN IF NOT EXISTS port_comment VARCHAR(255);

-- Create index for better query performance (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_alerts_port_comment ON alerts(port_comment);

-- Add comment to column for documentation
COMMENT ON COLUMN alerts.port_comment IS 'Interface comment from MikroTik router (e.g., "FIBER UPLINK")';
