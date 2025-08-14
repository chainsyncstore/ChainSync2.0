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
  connectionTimeoutMillis: 15000, // Increased timeout for production
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
    // Log more details for debugging
    if ((err as any).code) {
      console.error('Error code:', (err as any).code);
    }
    if ((err as any).detail) {
      console.error('Error detail:', (err as any).detail);
    }
  },
  onRemove: (client: any) => {
    console.log('🟡 Database connection removed from pool');
  },
  // Add retry logic for failed connections
  retryDelay: 1000,
  maxRetries: 3,
  // Additional production settings
  allowExitOnIdle: false
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
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database health check timeout')), 5000);
    });
    
    const healthCheckPromise = (async () => {
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
        return true;
      } finally {
        client.release();
      }
    })();
    
    // Race between timeout and health check
    await Promise.race([healthCheckPromise, timeoutPromise]);
    return true;
  } catch (error) {
    console.error('🔴 Database health check failed:', error);
    const anyErr = error as any;
    if (anyErr?.code) {
      console.error('Database error code:', anyErr.code);
    }
    if (anyErr?.message) {
      console.error('Database error message:', anyErr.message);
    }
    return false;
  }
}