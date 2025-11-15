-- Add interface_graph table for 5-minute historical traffic data
-- This is a TimescaleDB hypertable for efficient time-series storage

CREATE TABLE IF NOT EXISTS interface_graph (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id VARCHAR NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
  port_id VARCHAR REFERENCES monitored_ports(id) ON DELETE CASCADE,
  port_name VARCHAR(255) NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  rx_bytes_total REAL NOT NULL DEFAULT 0,
  tx_bytes_total REAL NOT NULL DEFAULT 0,
  rx_bytes_per_second REAL NOT NULL DEFAULT 0,
  tx_bytes_per_second REAL NOT NULL DEFAULT 0,
  total_bytes_per_second REAL NOT NULL DEFAULT 0
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_interface_graph_router_port_time 
  ON interface_graph(router_id, port_name, timestamp);
CREATE INDEX IF NOT EXISTS idx_interface_graph_timestamp 
  ON interface_graph(timestamp);

-- Prevent duplicate samples for same router/port/timestamp
CREATE UNIQUE INDEX IF NOT EXISTS idx_interface_graph_unique_sample 
  ON interface_graph(router_id, port_name, timestamp);

-- Note: TimescaleDB hypertable conversion, compression, and retention
-- policies are applied in init-timescale.sql for new installations
-- or manually via psql for existing installations
