import { Client } from 'pg';

async function main() {
  const connectionString = process.env.DATABASE_URL || process.argv[2];
  if (!connectionString) {
    throw new Error('Provide DATABASE_URL via env or first CLI argument');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const queries = {
      sales_status: "SELECT DISTINCT status FROM sales",
      sales_payment_method: "SELECT DISTINCT payment_method FROM sales",
      sales_occurred_nulls: "SELECT COUNT(*) FROM sales WHERE occurred_at IS NULL",
      subscriptions_columns: "SELECT column_name FROM information_schema.columns WHERE table_name = 'subscriptions' ORDER BY column_name",
      subscription_payments_columns: "SELECT column_name FROM information_schema.columns WHERE table_name = 'subscription_payments' ORDER BY column_name",
      subscription_status_values: "SELECT DISTINCT status FROM subscriptions",
      subscription_payments_provider: "SELECT DISTINCT provider FROM subscription_payments",
      stores_created_at_nulls: "SELECT COUNT(*) FROM stores WHERE created_at IS NULL",
      sales_created_at_nulls: "SELECT COUNT(*) FROM sales WHERE created_at IS NULL",
      products_created_at_nulls: "SELECT COUNT(*) FROM products WHERE created_at IS NULL",
      stores_rowcount: "SELECT COUNT(*) FROM stores",
      customers_rowcount: "SELECT COUNT(*) FROM customers",
      products_rowcount: "SELECT COUNT(*) FROM products",
      subscriptions_rowcount: "SELECT COUNT(*) FROM subscriptions",
      subscription_payments_rowcount: "SELECT COUNT(*) FROM subscription_payments"
    } as const;

    const result: Record<string, any> = {};
    for (const [key, sql] of Object.entries(queries)) {
      try {
        const res = await client.query(sql);
        result[key] = res.rows;
      } catch (err) {
        result[key] = { error: (err as Error).message };
      }
    }

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Inspection failed:', err.message);
  process.exit(1);
});
