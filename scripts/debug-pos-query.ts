
import { and, eq, sql } from "drizzle-orm";
import { db } from "../server/db";
import { inventory, products } from "../shared/schema";

async function main() {
  const storeId = "f508eda6-9d82-4690-9b48-b6313ad334d4";
  console.log(`Debugging POS query for store: ${storeId}`);

  // 1. Check raw inventory count
  const invCount = await db.execute(sql`
    SELECT COUNT(*) as count FROM inventory WHERE store_id = ${storeId}
  `);
  console.log(`Raw inventory count: ${invCount.rows[0].count}`);

  // 2. Check active products count
  const prodCount = await db.execute(sql`
    SELECT COUNT(*) as count FROM products WHERE is_active = true
  `);
  console.log(`Active products count: ${prodCount.rows[0].count}`);

  // 3. Run the exact POS query
  console.log("Running POS Logic Query...");
  try {
    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        quantity: inventory.quantity,
        isActive: products.isActive
      })
      .from(products)
      .innerJoin(inventory, and(
        eq(inventory.productId, products.id),
        eq(inventory.storeId, storeId)
      ))
      .where(eq(products.isActive, true))
      .limit(5);

    console.log(`POS Query returned ${rows.length} rows.`);
    if (rows.length > 0) {
      console.log("Sample rows:", rows);
    }
  } catch (err) {
    console.error("POS Query failed:", err);
  }

  console.log("\n--- Troubleshooting Mismatch ---");
  // 4. Check if we have inventory but product is inactive?
  const inactiveInv = await db.execute(sql`
    SELECT COUNT(*) as count 
    FROM inventory i
    JOIN products p ON i.product_id = p.id
    WHERE i.store_id = ${storeId} AND p.is_active = false
  `);
  console.log(`Inventory items with INACTIVE products: ${inactiveInv.rows[0].count}`);

  // 5. Check if we have inventory for product IDs that don't exist? (Orphaned inventory)
  const orphanedInv = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM inventory i
    LEFT JOIN products p ON i.product_id = p.id
    WHERE i.store_id = ${storeId} AND p.id IS NULL
  `);
  console.log(`Orphaned inventory (no matching product): ${orphanedInv.rows[0].count}`);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
