// Database connection setup - Referenced from javascript_database blueprint
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import ws from "ws";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Detect if using Neon (cloud) or local PostgreSQL
const isNeon = process.env.DATABASE_URL.includes('neon.tech') || 
               process.env.DATABASE_URL.includes('.pooler.supabase.com');

let pool: NeonPool | PgPool;
let db: ReturnType<typeof drizzleNeon> | ReturnType<typeof drizzlePg>;

if (isNeon) {
  // Use Neon serverless driver (requires WebSocket)
  neonConfig.webSocketConstructor = ws;
  pool = new NeonPool({ connectionString: process.env.DATABASE_URL });
  db = drizzleNeon({ client: pool, schema });
  console.log('[DB] Using Neon serverless driver (cloud PostgreSQL)');
} else {
  // Use regular pg driver for local PostgreSQL containers
  pool = new PgPool({ connectionString: process.env.DATABASE_URL });
  db = drizzlePg({ client: pool, schema });
  console.log('[DB] Using standard pg driver (local PostgreSQL)');
}

export { pool, db };
