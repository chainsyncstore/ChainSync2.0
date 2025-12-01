/**
 * Transaction item cost backfill
 * ---------------------------------
 * Populates missing transaction_items.unit_cost/total_cost for historical rows.
 *
 * Usage:
 *   ts-node scripts/backfill-transaction-costs.ts [--batch=1000] [--execute]
 *   # defaults to dry-run; inspect output before re-running with --execute
 *
 * Safety:
 *   • Dry-run is default. Pass --execute (or --run) only after reviewing counts.
 *   • Batches updates (default 1000 rows) to avoid long transactions.
 *   • Requires NODE_ENV=production|staging|development before mutating data.
 *   • Stops automatically when no more rows need backfilling.
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';

import { db, pool } from '../server/db';

const DEFAULT_BATCH_SIZE = 1000;

function parseArgs() {
  const argv = process.argv.slice(2);
  const options: Record<string, string | boolean> = {};

  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.replace(/^--/, '').split('=');
      options[key] = value === undefined ? true : value;
    }
  }

  return options;
}

async function main() {
  const args = parseArgs();
  const batchSize = Number(args.batch ?? process.env.BACKFILL_BATCH_SIZE ?? DEFAULT_BATCH_SIZE);
  if (!Number.isFinite(batchSize) || batchSize <= 0) {
    throw new Error('Invalid batch size supplied.');
  }
  const shouldExecute = Boolean(args.execute || args['run']);
  const dryRun = !shouldExecute;

  console.log('🔍 Starting transaction item cost backfill');
  console.log(` • Dry run: ${dryRun ? 'yes (no data will be modified)' : 'no (updates will be applied)'}`);
  console.log(` • Batch size: ${batchSize}`);

  const [{ rows: [{ count: totalRemaining }] }] = await Promise.all([
    db.execute(sql`SELECT COUNT(*)::bigint AS count FROM transaction_items ti WHERE (ti.unit_cost IS NULL OR ti.unit_cost = 0) OR (ti.total_cost IS NULL OR ti.total_cost = 0)`)
  ]);

  const pending = Number(totalRemaining ?? 0);
  if (pending === 0) {
    console.log('✅ All transaction items already contain unit_cost/total_cost. No action required.');
    return;
  }

  console.log(` • Rows needing backfill: ${pending.toLocaleString()}`);

  if (dryRun) {
    console.log('\nThis is a dry run. Re-run with --execute to apply changes.');
    return;
  }

  if (process.env.NODE_ENV && !['production', 'staging', 'development'].includes(process.env.NODE_ENV)) {
    console.log(`⚠️  NODE_ENV=${process.env.NODE_ENV} is not recognized. Set NODE_ENV=production/staging/development to proceed.`);
    return;
  }

  let totalUpdated = 0;
  while (true) {
    const { rows } = await db.execute(sql`
      WITH target AS (
        SELECT ti.id,
               ti.quantity,
               COALESCE(
                 NULLIF(inv.avg_cost, 0),
                 NULLIF(prod.cost, 0),
                 CASE WHEN ti.quantity <> 0 THEN ti.total_price / ti.quantity ELSE 0 END,
                 NULLIF(ti.unit_price, 0),
                 0
               )::numeric(12,4) AS computed_unit_cost
        FROM transaction_items ti
        JOIN transactions tr ON tr.id = ti.transaction_id
        LEFT JOIN inventory inv ON inv.product_id = ti.product_id AND inv.store_id = tr.store_id
        LEFT JOIN products prod ON prod.id = ti.product_id
        WHERE (ti.unit_cost IS NULL OR ti.unit_cost = 0) OR (ti.total_cost IS NULL OR ti.total_cost = 0)
        ORDER BY ti.id
        LIMIT ${sql.raw(String(batchSize))}
      )
      UPDATE transaction_items ti
      SET unit_cost = target.computed_unit_cost,
          total_cost = target.computed_unit_cost * ti.quantity
      FROM target
      WHERE ti.id = target.id
      RETURNING ti.id
    `);

    const batchCount = rows.length;
    if (batchCount === 0) break;
    totalUpdated += batchCount;
    console.log(`   • Updated ${batchCount.toLocaleString()} rows (running total: ${totalUpdated.toLocaleString()})`);

    if (batchCount < batchSize) {
      break;
    }
  }

  console.log(`\n✅ Backfill complete. Updated ${totalUpdated.toLocaleString()} rows.`);
}

main()
  .catch((error) => {
    console.error('❌ Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
