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

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });