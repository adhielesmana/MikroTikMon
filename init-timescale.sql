-- TimescaleDB Initialization Script
-- This script runs AFTER init-db.sql to enable TimescaleDB features
-- It is executed only on first database initialization

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Convert traffic_data table to a hypertable
-- This optimizes it for time-series queries and automatic partitioning
-- Note: Table must exist before converting (created by init-db.sql)
SELECT create_hypertable(
    'traffic_data',
    'timestamp',
    if_not_exists => TRUE,
    chunk_time_interval => INTERVAL '1 day'
);

-- Add compression policy to automatically compress data older than 7 days
-- This significantly reduces storage usage (typically 90%+ compression)
ALTER TABLE traffic_data SET (
    timescaledb.compress,
    timescaledb.compress_orderby = 'timestamp DESC',
    timescaledb.compress_segmentby = 'router_id, port_name'
);

-- Automatically compress chunks older than 7 days
SELECT add_compression_policy('traffic_data', INTERVAL '7 days');

-- NOTE: Data retention policy is now configurable via the Settings UI
-- Admins can set retention_days in the appSettings table, which will
-- dynamically add/remove TimescaleDB retention policies at runtime
-- By default, no retention policy is set (data kept forever)

-- Convert interface_graph table to hypertable (5-minute historical snapshots)
SELECT create_hypertable(
    'interface_graph',
    'timestamp',
    if_not_exists => TRUE,
    chunk_time_interval => INTERVAL '7 days'
);

-- Add compression policy for interface_graph
ALTER TABLE interface_graph SET (
    timescaledb.compress,
    timescaledb.compress_orderby = 'timestamp DESC',
    timescaledb.compress_segmentby = 'router_id, port_name'
);

-- Automatically compress interface_graph chunks older than 7 days
SELECT add_compression_policy('interface_graph', INTERVAL '7 days');

-- Create continuous aggregate for hourly traffic summaries (optional but recommended)
-- This pre-computes hourly averages for faster dashboard queries
CREATE MATERIALIZED VIEW IF NOT EXISTS traffic_data_hourly
WITH (timescaledb.continuous) AS
SELECT
    router_id,
    port_name,
    time_bucket('1 hour', timestamp) AS bucket,
    AVG(rx_bytes_per_second) AS avg_rx_bps,
    MAX(rx_bytes_per_second) AS max_rx_bps,
    AVG(tx_bytes_per_second) AS avg_tx_bps,
    MAX(tx_bytes_per_second) AS max_tx_bps,
    AVG(total_bytes_per_second) AS avg_total_bps,
    MAX(total_bytes_per_second) AS max_total_bps,
    COUNT(*) AS sample_count
FROM traffic_data
GROUP BY router_id, port_name, bucket;

-- Refresh policy for continuous aggregate (refresh every 1 hour)
SELECT add_continuous_aggregate_policy('traffic_data_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour');

-- Create continuous aggregate for daily traffic summaries
CREATE MATERIALIZED VIEW IF NOT EXISTS traffic_data_daily
WITH (timescaledb.continuous) AS
SELECT
    router_id,
    port_name,
    time_bucket('1 day', timestamp) AS bucket,
    AVG(rx_bytes_per_second) AS avg_rx_bps,
    MAX(rx_bytes_per_second) AS max_rx_bps,
    AVG(tx_bytes_per_second) AS avg_tx_bps,
    MAX(tx_bytes_per_second) AS max_tx_bps,
    AVG(total_bytes_per_second) AS avg_total_bps,
    MAX(total_bytes_per_second) AS max_total_bps,
    COUNT(*) AS sample_count
FROM traffic_data
GROUP BY router_id, port_name, bucket;

-- Refresh policy for daily aggregate (refresh every 1 day)
SELECT add_continuous_aggregate_policy('traffic_data_daily',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day');

-- Display TimescaleDB information
\echo 'TimescaleDB extension enabled successfully!'
\echo 'Hypertables created: traffic_data, interface_graph'
\echo 'Compression policy: 7 days (both tables)'
\echo 'Retention policy: Configurable via Settings UI (default: keep forever)'
\echo 'Continuous aggregates: traffic_data_hourly, traffic_data_daily'
\echo 'Interface graph: 5-minute historical snapshots for all monitored ports'
