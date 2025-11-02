import { Client } from 'pg';

async function main() {
  const argvConnection = process.argv[2]?.trim();
  const connectionString = argvConnection || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  console.log('Using connection', connectionString.replace(/:([^:@/]+)@/, ':***@'));
 
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const tables = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    const columns = await client.query(
      `SELECT table_name, column_name, data_type, udt_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`
    );

    const indexes = await client.query(
      `SELECT t.relname as table_name, i.relname as index_name, pg_get_indexdef(ix.indexrelid) as definition
       FROM pg_class t
       JOIN pg_index ix ON t.oid = ix.indrelid
       JOIN pg_class i ON ix.indexrelid = i.oid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = 'public'
       ORDER BY t.relname, i.relname`
    );

    console.log(JSON.stringify({ tables: tables.rows, columns: columns.rows, indexes: indexes.rows }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
