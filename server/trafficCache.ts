import memoizee from "memoizee";
import { db } from "./db";
import { trafficData } from "@shared/schema";
import { eq, gte, lt, and, sql } from "drizzle-orm";

/**
 * Traffic Data Caching and Aggregation Layer
 * Provides fast, cached access to traffic data with intelligent aggregation
 */

interface TrafficDataPoint {
  timestamp: string;
  rxBytesPerSecond: number;
  txBytesPerSecond: number;
  totalBytesPerSecond: number;
}

/**
 * Get aggregated traffic data for longer time ranges
 * - 1d: Raw data (1min intervals)
 * - 7d: 10min aggregation  
 * - 30d: 1hour aggregation
 * - 365d: 6hour aggregation
 */
async function getAggregatedTraffic(
  routerId: string,
  portName: string | undefined,
  since: Date,
  until: Date | undefined
): Promise<TrafficDataPoint[]> {
  const timeRangeDays = (Date.now() - since.getTime()) / (1000 * 60 * 60 * 24);
  
  let interval = '1 minute';  // Default for < 2 days
  
  if (timeRangeDays > 300) {
    // 365d range: aggregate to 6-hour intervals
    interval = '6 hours';
  } else if (timeRangeDays > 25) {
    // 30d range: aggregate to 1-hour intervals
    interval = '1 hour';
  } else if (timeRangeDays > 6) {
    // 7d range: aggregate to 10-minute intervals
    interval = '10 minutes';
  }
  
  const conditions = [
    eq(trafficData.routerId, routerId),
    gte(trafficData.timestamp, since)
  ];
  
  if (portName) {
    conditions.push(eq(trafficData.portName, portName));
  }
  
  if (until) {
    conditions.push(lt(trafficData.timestamp, until));
  }

  // Use time_bucket for aggregation (TimescaleDB feature)
  const result = await db.execute(sql`
    SELECT 
      time_bucket(${interval}::interval, timestamp) AS bucket_time,
      AVG(rx_bytes_per_second)::bigint AS avg_rx,
      AVG(tx_bytes_per_second)::bigint AS avg_tx,
      AVG(total_bytes_per_second)::bigint AS avg_total
    FROM traffic_data
    WHERE ${and(...conditions)}
    GROUP BY bucket_time
    ORDER BY bucket_time ASC
  `);

  return result.rows.map((row: any) => ({
    timestamp: new Date(row.bucket_time).toISOString(),
    rxBytesPerSecond: Number(row.avg_rx || 0),
    txBytesPerSecond: Number(row.avg_tx || 0),
    totalBytesPerSecond: Number(row.avg_total || 0),
  }));
}

/**
 * Cached version of getAggregatedTraffic
 * Cache for 2 minutes, max 100 different queries
 */
export const getCachedTrafficData = memoizee(
  getAggregatedTraffic,
  {
    maxAge: 120000, // 2 minutes
    max: 100,       // Cache up to 100 different queries
    promise: true,  // Cache promise to prevent duplicate DB calls
    normalizer: function(args) {
      // Create cache key from all arguments
      const [routerId, portName, since, until] = args;
      return JSON.stringify({
        routerId,
        portName: portName || 'all',
        since: since.toISOString(),
        until: until?.toISOString() || 'now'
      });
    }
  }
);

/**
 * Clear all traffic data cache (call after data updates)
 */
export function clearTrafficCache() {
  getCachedTrafficData.clear();
}
