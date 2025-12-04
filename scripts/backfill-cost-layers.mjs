#!/usr/bin/env node
/**
 * Backfill cost layers for existing inventory that was created before the cost layer fix.
 * 
 * This script finds inventory records that have:
 * - quantity > 0
 * - avgCost > 0
 * - No existing cost layers
 * 
 * And creates a synthetic cost layer representing the current inventory state.
 * 
 * Run: node scripts/backfill-cost-layers.mjs
 */

import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function backfillCostLayers() {
  const client = await pool.connect();
  
  try {
    console.log('Starting cost layer backfill...\n');
    
    // Find inventory records without cost layers
    const query = `
      SELECT 
        i.id,
        i.product_id,
        i.store_id,
        i.quantity,
        i.avg_cost,
        i.total_cost_value,
        i.created_at,
        i.updated_at,
        p.name as product_name
      FROM inventory i
      LEFT JOIN products p ON p.id = i.product_id
      LEFT JOIN inventory_cost_layers icl ON icl.product_id = i.product_id AND icl.store_id = i.store_id
      WHERE i.quantity > 0
        AND (i.avg_cost > 0 OR i.total_cost_value > 0)
        AND icl.id IS NULL
      ORDER BY i.created_at ASC
    `;
    
    const result = await client.query(query);
    const inventoryWithoutLayers = result.rows;
    
    if (inventoryWithoutLayers.length === 0) {
      console.log('No inventory records found without cost layers. Nothing to backfill.');
      return;
    }
    
    console.log(`Found ${inventoryWithoutLayers.length} inventory records without cost layers.\n`);
    
    let created = 0;
    let skipped = 0;
    
    await client.query('BEGIN');
    
    for (const inv of inventoryWithoutLayers) {
      const quantity = parseFloat(inv.quantity) || 0;
      const avgCost = parseFloat(inv.avg_cost) || 0;
      const totalCostValue = parseFloat(inv.total_cost_value) || 0;
      
      // Derive unit cost from avgCost or totalCostValue/quantity
      let unitCost = avgCost;
      if (unitCost <= 0 && quantity > 0 && totalCostValue > 0) {
        unitCost = totalCostValue / quantity;
      }
      
      if (quantity <= 0 || unitCost <= 0) {
        console.log(`  Skipping ${inv.product_name || inv.product_id}: quantity=${quantity}, unitCost=${unitCost}`);
        skipped++;
        continue;
      }
      
      // Insert cost layer
      const insertQuery = `
        INSERT INTO inventory_cost_layers (
          id,
          store_id,
          product_id,
          quantity_remaining,
          unit_cost,
          source,
          notes,
          created_at
        ) VALUES (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          $4,
          'backfill_legacy',
          'Backfilled from existing inventory avgCost',
          $5
        )
      `;
      
      const createdAt = inv.created_at || inv.updated_at || new Date();
      
      await client.query(insertQuery, [
        inv.store_id,
        inv.product_id,
        quantity,
        unitCost.toFixed(4),
        createdAt
      ]);
      
      console.log(`  Created layer for ${inv.product_name || inv.product_id}: ${quantity} units @ ${unitCost.toFixed(2)}`);
      created++;
    }
    
    await client.query('COMMIT');
    
    console.log(`\nBackfill complete!`);
    console.log(`  Created: ${created} cost layers`);
    console.log(`  Skipped: ${skipped} inventory records`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Backfill failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

backfillCostLayers()
  .then(() => {
    console.log('\nDone.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nFailed:', error.message);
    process.exit(1);
  });
