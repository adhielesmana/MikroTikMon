-- Migration: Add router_interfaces table and partial unique index for alert deduplication
-- Date: 2025-11-04
-- Purpose: 
--   1. Cache ALL router interfaces in database to eliminate API calls when adding monitors
--   2. Prevent duplicate alerts from multiple app instances while allowing new alerts after acknowledgement

-- Create router_interfaces table to cache ALL router interfaces (monitored + unmonitored)
CREATE TABLE IF NOT EXISTS "router_interfaces" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "router_id" varchar NOT NULL REFERENCES "routers"("id") ON DELETE CASCADE,
  "interface_name" varchar(255) NOT NULL,
  "interface_comment" text,
  "interface_mac_address" varchar(17),
  "interface_type" varchar(50),
  "is_running" boolean DEFAULT false,
  "is_disabled" boolean DEFAULT false,
  "last_seen" timestamp DEFAULT now(),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  UNIQUE("router_id", "interface_name")
);

-- Create index for faster lookups by router
CREATE INDEX IF NOT EXISTS "idx_router_interfaces_router" ON "router_interfaces"("router_id");

-- Drop old unique constraint on alerts (if exists)
DROP INDEX IF EXISTS "unique_alert_port_unack";

-- Create partial unique index to prevent duplicate UNACKNOWLEDGED alerts
-- This allows new alerts after acknowledgement while preventing duplicates for same ongoing issue
-- CRITICAL: This is a partial index that only applies when acknowledged = false
CREATE UNIQUE INDEX IF NOT EXISTS "unique_alert_port_unack" 
ON "alerts"("router_id", "port_id") 
WHERE "acknowledged" = false;

-- Verify the partial index was created
SELECT 
  indexname, 
  indexdef 
FROM pg_indexes 
WHERE tablename = 'alerts' AND indexname = 'unique_alert_port_unack';
