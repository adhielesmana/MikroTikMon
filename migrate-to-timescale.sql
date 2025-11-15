-- Migration Script: PostgreSQL to TimescaleDB
-- Run this AFTER upgrading to timescale/timescaledb image
-- This script is idempotent and safe to run multiple times

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Check if traffic_data is already a hypertable
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM timescaledb_information.hypertables 
        WHERE hypertable_name = 'traffic_data'
    ) THEN
        -- Convert traffic_data table to a hypertable
        PERFORM create_hypertable(
            'traffic_data',
            'timestamp',
            migrate_data => TRUE,  -- Migrate existing data
            chunk_time_interval => INTERVAL '1 day'
        );
        RAISE NOTICE 'traffic_data converted to hypertable';
    ELSE
        RAISE NOTICE 'traffic_data is already a hypertable';
    END IF;
END $$;

-- Add compression settings (safe to run multiple times)
ALTER TABLE traffic_data SET (
    timescaledb.compress,
    timescaledb.compress_orderby = 'timestamp DESC',
    timescaledb.compress_segmentby = 'router_id, port_name'
);

-- Add compression policy if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM timescaledb_information.jobs
        WHERE proc_name = 'policy_compression'
        AND hypertable_name = 'traffic_data'
    ) THEN
        PERFORM add_compression_policy('traffic_data', INTERVAL '7 days');
        RAISE NOTICE 'Compression policy added';
    ELSE
        RAISE NOTICE 'Compression policy already exists';
    END IF;
END $$;

-- Add retention policy if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM timescaledb_information.jobs
        WHERE proc_name = 'policy_retention'
        AND hypertable_name = 'traffic_data'
    ) THEN
        PERFORM add_retention_policy('traffic_data', INTERVAL '2 years');
        RAISE NOTICE 'Retention policy added';
    ELSE
        RAISE NOTICE 'Retention policy already exists';
    END IF;
END $$;

-- Create continuous aggregate for hourly traffic summaries
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

-- Add refresh policy for hourly aggregate
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM timescaledb_information.jobs
        WHERE proc_name = 'policy_refresh_continuous_aggregate'
        AND hypertable_name = 'traffic_data_hourly'
    ) THEN
        PERFORM add_continuous_aggregate_policy('traffic_data_hourly',
            start_offset => INTERVAL '3 hours',
            end_offset => INTERVAL '1 hour',
            schedule_interval => INTERVAL '1 hour');
        RAISE NOTICE 'Hourly aggregate refresh policy added';
    ELSE
        RAISE NOTICE 'Hourly aggregate refresh policy already exists';
    END IF;
END $$;

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

-- Add refresh policy for daily aggregate
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM timescaledb_information.jobs
        WHERE proc_name = 'policy_refresh_continuous_aggregate'
        AND hypertable_name = 'traffic_data_daily'
    ) THEN
        PERFORM add_continuous_aggregate_policy('traffic_data_daily',
            start_offset => INTERVAL '3 days',
            end_offset => INTERVAL '1 day',
            schedule_interval => INTERVAL '1 day');
        RAISE NOTICE 'Daily aggregate refresh policy added';
    ELSE
        RAISE NOTICE 'Daily aggregate refresh policy already exists';
    END IF;
END $$;

-- Display summary
\echo ''
\echo '========================================='
\echo 'TimescaleDB Migration Complete!'
\echo '========================================='
\echo 'Hypertable: traffic_data'
\echo 'Chunk interval: 1 day'
\echo 'Compression: Data older than 7 days'
\echo 'Retention: 2 years'
\echo 'Continuous aggregates: hourly, daily'
\echo ''
\echo 'Query existing data normally - no changes needed!'
\echo 'Use continuous aggregates for faster queries:'
\echo '  - traffic_data_hourly (1-hour buckets)'
\echo '  - traffic_data_daily (1-day buckets)'
\echo ''
