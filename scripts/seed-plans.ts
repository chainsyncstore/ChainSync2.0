import { db } from '../server/db';
import { organizations } from '@shared/prd-schema';

async function main() {
  // This script is a placeholder for future plan/price seeding if needed.
  // For now, ensure at least one organization exists in dev for testing billing flows.
  const name = 'Demo Org';
  const rows = await (db as any).execute(`SELECT id FROM organizations WHERE name = $1 LIMIT 1`, [name]);
  if (rows.rows.length === 0) {
    const ins = await (db as any).execute(`INSERT INTO organizations (name, currency, is_active) VALUES ($1, 'NGN', false) RETURNING id`, [name]);
    console.log('Seeded organization id:', ins.rows[0].id);
  } else {
    console.log('Organization already exists');
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});


