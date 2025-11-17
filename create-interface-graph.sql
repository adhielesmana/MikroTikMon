-- Create interface_graph table for 5-minute historical traffic snapshots
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

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_interface_graph_router_port_time 
    ON interface_graph(router_id, port_name, timestamp);

CREATE INDEX IF NOT EXISTS idx_interface_graph_timestamp 
    ON interface_graph(timestamp);

-- Create unique constraint to prevent duplicate samples
CREATE UNIQUE INDEX IF NOT EXISTS unique_interface_graph_sample 
    ON interface_graph(router_id, port_name, timestamp);

-- Convert to TimescaleDB hypertable for time-series optimization
SELECT create_hypertable('interface_graph', 'timestamp', 
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Add compression policy (compress data older than 7 days)
SELECT add_compression_policy('interface_graph', INTERVAL '7 days', if_not_exists => TRUE);

-- Add retention policy (delete data older than 2 years)
SELECT add_retention_policy('interface_graph', INTERVAL '2 years', if_not_exists => TRUE);

-- Create continuous aggregate for hourly summaries
CREATE MATERIALIZED VIEW IF NOT EXISTS interface_graph_hourly
WITH (timescaledb.continuous) AS
SELECT 
    router_id,
    port_name,
    time_bucket('1 hour', timestamp) AS hour,
    AVG(rx_bytes_per_second) AS avg_rx_bytes_per_second,
    AVG(tx_bytes_per_second) AS avg_tx_bytes_per_second,
    AVG(total_bytes_per_second) AS avg_total_bytes_per_second,
    MAX(total_bytes_per_second) AS max_total_bytes_per_second
FROM interface_graph
GROUP BY router_id, port_name, hour;

-- Create continuous aggregate for daily summaries
CREATE MATERIALIZED VIEW IF NOT EXISTS interface_graph_daily
WITH (timescaledb.continuous) AS
SELECT 
    router_id,
    port_name,
    time_bucket('1 day', timestamp) AS day,
    AVG(rx_bytes_per_second) AS avg_rx_bytes_per_second,
    AVG(tx_bytes_per_second) AS avg_tx_bytes_per_second,
    AVG(total_bytes_per_second) AS avg_total_bytes_per_second,
    MAX(total_bytes_per_second) AS max_total_bytes_per_second
FROM interface_graph
GROUP BY router_id, port_name, day;

-- Grant permissions
GRANT ALL ON interface_graph TO CURRENT_USER;
GRANT ALL ON interface_graph_hourly TO CURRENT_USER;
GRANT ALL ON interface_graph_daily TO CURRENT_USER;

-- Success message
SELECT 'interface_graph table created successfully!' AS result;
