import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import 'dotenv/config';

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is required");
  console.error("Please set DATABASE_URL in your .env file");
  console.error("Example: DATABASE_URL=postgresql://user:password@host:port/database");
  process.exit(1);
}

// Enhanced database connection configuration for production deployments
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  // Connection pooling settings for production
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
  maxUses: 7500, // Close (and replace) a connection after it has been used 7500 times
  // SSL configuration for production databases
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false, // Allow self-signed certificates
    require: true
  } : false,
  // Additional connection options
  application_name: 'ChainSync',
  // Handle connection errors gracefully
  onConnect: (client: any) => {
    console.log('🟢 New database connection established');
  },
  onError: (err: Error, client: any) => {
    console.error('🔴 Database connection error:', err.message);
  },
  onRemove: (client: any) => {
    console.log('🟡 Database connection removed from pool');
  }
};

export const pool = new Pool(dbConfig);

// Test database connection on startup
pool.on('connect', (client) => {
  console.log('🟢 Database client connected');
});

pool.on('error', (err) => {
  console.error('🔴 Database pool error:', err);
});

pool.on('acquire', (client) => {
  console.log('🟢 Database client acquired from pool');
});

pool.on('release', (client) => {
  console.log('🟡 Database client released back to pool');
});

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('🔄 Shutting down database connections...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🔄 Shutting down database connections...');
  await pool.end();
  process.exit(0);
});

export const db = drizzle({ client: pool, schema });

// Health check function for database
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.error('🔴 Database health check failed:', error);
    return false;
  }
}