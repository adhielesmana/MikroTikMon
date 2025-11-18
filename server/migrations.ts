import { db } from "./db";
import { sql } from "drizzle-orm";

/**
 * Auto-Migration System
 * Runs on application startup to ensure database schema is up-to-date
 * Checks for missing columns and adds them automatically
 */

export async function runMigrations() {
  console.log("[Migrations] Checking database schema...");

  try {
    // Create router_ip_addresses table if it doesn't exist
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS router_ip_addresses (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        router_id VARCHAR NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
        address VARCHAR(255) NOT NULL,
        network VARCHAR(255) NOT NULL,
        interface_name VARCHAR(255) NOT NULL,
        disabled BOOLEAN NOT NULL DEFAULT false,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(router_id, address, interface_name)
      );
    `);
    console.log("[Migrations] ✓ Ensured router_ip_addresses table exists");

    // Create index for router_ip_addresses if it doesn't exist
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_router_ip_addresses_router 
      ON router_ip_addresses(router_id);
    `);

    // Create router_routes table if it doesn't exist
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS router_routes (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        router_id VARCHAR NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
        dst_address VARCHAR(255) NOT NULL,
        gateway VARCHAR(255) NOT NULL,
        distance VARCHAR(10) NOT NULL DEFAULT '1',
        scope VARCHAR(10),
        target_scope VARCHAR(10),
        disabled BOOLEAN NOT NULL DEFAULT false,
        dynamic BOOLEAN NOT NULL DEFAULT false,
        active BOOLEAN NOT NULL DEFAULT true,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(router_id, dst_address, gateway)
      );
    `);
    console.log("[Migrations] ✓ Ensured router_routes table exists");

    // Create index for router_routes if it doesn't exist
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_router_routes_router 
      ON router_routes(router_id);
    `);

    // Check if acknowledged_by column exists in alerts table
    const acknowledgedByCheck = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'alerts' AND column_name = 'acknowledged_by'
      ) as exists;
    `);

    const acknowledgedByExists = acknowledgedByCheck.rows[0]?.exists;

    if (!acknowledgedByExists) {
      console.log("[Migrations] Adding missing 'acknowledged_by' column to alerts table...");
      await db.execute(sql`
        ALTER TABLE alerts ADD COLUMN acknowledged_by VARCHAR(255);
      `);
      console.log("[Migrations] ✓ Added acknowledged_by column");
    }

    // Check if port_comment column exists in alerts table
    const portCommentCheck = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'alerts' AND column_name = 'port_comment'
      ) as exists;
    `);

    const portCommentExists = portCommentCheck.rows[0]?.exists;

    if (!portCommentExists) {
      console.log("[Migrations] Adding missing 'port_comment' column to alerts table...");
      await db.execute(sql`
        ALTER TABLE alerts ADD COLUMN port_comment VARCHAR(255);
      `);
      console.log("[Migrations] ✓ Added port_comment column");
    }

    // Fix acknowledged_by column if it's a foreign key (old schema)
    const acknowledgedByType = await db.execute(sql`
      SELECT 
        c.data_type,
        tc.constraint_type
      FROM information_schema.columns c
      LEFT JOIN information_schema.key_column_usage kcu 
        ON c.table_name = kcu.table_name AND c.column_name = kcu.column_name
      LEFT JOIN information_schema.table_constraints tc 
        ON kcu.constraint_name = tc.constraint_name
      WHERE c.table_name = 'alerts' 
        AND c.column_name = 'acknowledged_by';
    `);

    const hasConstraint = acknowledgedByType.rows.some(
      (row: any) => row.constraint_type === 'FOREIGN KEY'
    );

    if (hasConstraint) {
      console.log("[Migrations] Fixing acknowledged_by foreign key constraint...");
      
      // Find and drop the foreign key constraint
      const constraints = await db.execute(sql`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'alerts' 
          AND constraint_type = 'FOREIGN KEY'
          AND constraint_name IN (
            SELECT constraint_name
            FROM information_schema.key_column_usage
            WHERE table_name = 'alerts' AND column_name = 'acknowledged_by'
          );
      `);

      for (const row of constraints.rows as any[]) {
        await db.execute(sql.raw(`
          ALTER TABLE alerts DROP CONSTRAINT ${row.constraint_name};
        `));
        console.log(`[Migrations] ✓ Dropped foreign key constraint: ${row.constraint_name}`);
      }

      // Ensure column type is correct
      await db.execute(sql`
        ALTER TABLE alerts 
        ALTER COLUMN acknowledged_by TYPE VARCHAR(255);
      `);
      console.log("[Migrations] ✓ Fixed acknowledged_by column type");
    }

    // Remove deprecated alert_type column if it exists
    const alertTypeCheck = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'alerts' AND column_name = 'alert_type'
      ) as exists;
    `);

    const alertTypeExists = alertTypeCheck.rows[0]?.exists;

    if (alertTypeExists) {
      console.log("[Migrations] Removing deprecated 'alert_type' column...");
      await db.execute(sql`
        ALTER TABLE alerts DROP COLUMN IF EXISTS alert_type;
      `);
      console.log("[Migrations] ✓ Removed alert_type column");
    }

    // Make port_name nullable if it's not already
    const portNameCheck = await db.execute(sql`
      SELECT is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'alerts' AND column_name = 'port_name';
    `);

    const portNameNullable = portNameCheck.rows[0]?.is_nullable === 'YES';

    if (!portNameNullable) {
      console.log("[Migrations] Making port_name column nullable...");
      await db.execute(sql`
        ALTER TABLE alerts 
        ALTER COLUMN port_name DROP NOT NULL;
      `);
      console.log("[Migrations] ✓ Made port_name nullable");
    }

    // Add performance indexes for traffic_data table if they don't exist
    console.log("[Migrations] Checking performance indexes...");
    
    // Index for traffic queries by router and time range
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_traffic_router_timestamp 
      ON traffic_data(router_id, timestamp DESC);
    `);
    
    // Index for traffic queries by router, port, and time range
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_traffic_router_port_timestamp 
      ON traffic_data(router_id, port_name, timestamp DESC);
    `);
    
    // Index for port-specific queries
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_traffic_port_timestamp 
      ON traffic_data(port_id, timestamp DESC) 
      WHERE port_id IS NOT NULL;
    `);
    
    console.log("[Migrations] ✓ Performance indexes verified");

    console.log("[Migrations] ✓ Database schema is up-to-date");
  } catch (error) {
    console.error("[Migrations] Error running migrations:", error);
    throw error;
  }
}
