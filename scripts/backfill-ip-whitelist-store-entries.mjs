import { Client } from 'pg';

async function fetchLegacyEntries(client) {
  const { rows } = await client.query(
    `SELECT id, ip_address, description, whitelisted_by, whitelisted_for, org_id, role, store_id
       FROM ip_whitelists
      WHERE store_id IS NOT NULL
        AND whitelisted_for = whitelisted_by
        AND is_active = true`
  );
  return rows;
}

async function fetchStoreUsers(client, storeId, role) {
  const normalizedRole = role?.toUpperCase() ?? null;
  if (!normalizedRole) return [];

  const users = new Set();

  const directAssignments = await client.query(
    `SELECT id
       FROM users
      WHERE store_id = $1
        AND is_admin = false
        AND (is_active IS DISTINCT FROM false)
        AND UPPER(COALESCE(role, '')) = $2`,
    [storeId, normalizedRole]
  );
  directAssignments.rows.forEach((row) => users.add(row.id));

  if (normalizedRole === 'MANAGER') {
    const delegated = await client.query(
      `SELECT usp.user_id AS id
         FROM user_store_permissions usp
         JOIN users u ON u.id = usp.user_id
        WHERE usp.store_id = $1
          AND (u.is_active IS DISTINCT FROM false)
          AND u.is_admin = false
          AND UPPER(COALESCE(u.role, '')) = 'MANAGER'`,
      [storeId]
    );
    delegated.rows.forEach((row) => users.add(row.id));
  }

  return Array.from(users);
}

async function ensureUserEntry(client, entry, userId) {
  const existing = await client.query(
    `SELECT id FROM ip_whitelists
      WHERE ip_address = $1 AND whitelisted_for = $2 AND is_active = true LIMIT 1`,
    [entry.ip_address, userId]
  );
  if (existing.rowCount > 0) {
    return { created: false, skipped: true };
  }

  await client.query(
    `INSERT INTO ip_whitelists (ip_address, description, whitelisted_by, whitelisted_for, org_id, role, store_id, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
    [
      entry.ip_address,
      entry.description,
      entry.whitelisted_by,
      userId,
      entry.org_id,
      entry.role,
      entry.store_id,
    ]
  );
  return { created: true, skipped: false };
}

async function deactivateLegacyEntry(client, entryId) {
  await client.query(
    `UPDATE ip_whitelists SET is_active = false, updated_at = NOW()
      WHERE id = $1`,
    [entryId]
  );
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('Connected to database.');

  try {
    await client.query('BEGIN');
    const legacyEntries = await fetchLegacyEntries(client);
    console.log(`Found ${legacyEntries.length} legacy store-level whitelist entr${legacyEntries.length === 1 ? 'y' : 'ies'}.`);

    let totalCreated = 0;
    let totalSkipped = 0;
    let totalNoUsers = 0;

    for (const entry of legacyEntries) {
      const userIds = await fetchStoreUsers(client, entry.store_id, entry.role);
      if (userIds.length === 0) {
        console.warn(`No staff found for store ${entry.store_id} & role ${entry.role}; leaving entry ${entry.id} active.`);
        totalNoUsers += 1;
        continue;
      }

      let entryCreated = 0;
      for (const userId of userIds) {
        const result = await ensureUserEntry(client, entry, userId);
        if (result.created) {
          totalCreated += 1;
          entryCreated += 1;
        } else {
          totalSkipped += 1;
        }
      }

      if (entryCreated > 0) {
        await deactivateLegacyEntry(client, entry.id);
        console.log(`Legacy entry ${entry.id} converted (${entryCreated} new record${entryCreated === 1 ? '' : 's'}).`);
      } else {
        console.log(`Legacy entry ${entry.id} already covered by existing records; leaving active.`);
      }
    }

    await client.query('COMMIT');
    console.log('Migration complete.');
    console.log(`Created ${totalCreated} new record(s). Skipped ${totalSkipped}. Entries without staff: ${totalNoUsers}.`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed, changes rolled back.', error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Fatal error running backfill:', error);
  process.exit(1);
});
