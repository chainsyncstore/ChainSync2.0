-- ============================================================================
-- FIX RETURNED INVENTORY
-- Run this to manually restock items from returns that didn't update inventory
-- ============================================================================

-- 1. View recent returns and their items with current inventory
WITH scoped_returns AS (
  SELECT *
  FROM returns
  WHERE store_id = 'bf99069f-d004-4d8f-95fc-8f9e89bd758d'
)
SELECT 
  r.id AS return_id,
  r.sale_id,
  r.occurred_at,
  ri.product_id,
  ri.quantity AS returned_qty,
  ri.restock_action,
  p.name AS product_name,
  i.quantity AS current_inventory
FROM scoped_returns r
JOIN return_items ri ON ri.return_id = r.id
JOIN products p ON p.id = ri.product_id
LEFT JOIN inventory i ON i.product_id = ri.product_id AND i.store_id = r.store_id
WHERE ri.restock_action = 'RESTOCK'
ORDER BY r.occurred_at DESC
LIMIT 20;

-- 2. Check if stock_movements were recorded for returns
SELECT 
  sm.id,
  sm.product_id,
  sm.store_id,
  sm.quantity_before,
  sm.quantity_after,
  sm.source,
  sm.reference_id,
  sm.notes,
  sm.created_at
FROM stock_movements sm
WHERE sm.source = 'pos_return'
  AND sm.store_id = 'bf99069f-d004-4d8f-95fc-8f9e89bd758d'
ORDER BY sm.created_at DESC
LIMIT 20;

-- 3. Find returns with RESTOCK that DON'T have a matching stock_movement
SELECT 
  r.id AS return_id,
  r.store_id,
  ri.product_id,
  ri.quantity AS qty_to_restock,
  p.name AS product_name,
  i.quantity AS current_inventory
FROM scoped_returns r
JOIN return_items ri ON ri.return_id = r.id
JOIN products p ON p.id = ri.product_id
LEFT JOIN inventory i ON i.product_id = ri.product_id AND i.store_id = r.store_id
LEFT JOIN stock_movements sm ON sm.reference_id = r.id AND sm.source = 'pos_return' AND sm.product_id = ri.product_id
WHERE ri.restock_action = 'RESTOCK'
  AND sm.id IS NULL  -- No matching stock movement found
ORDER BY r.occurred_at DESC;

-- 4. FIX: Update inventory for missed restocks (run after reviewing query #3)
-- This will add the returned quantity back to inventory for all missed restocks
-- UNCOMMENT AND RUN AFTER CONFIRMING THE ABOVE QUERY SHOWS THE RIGHT ITEMS

UPDATE inventory i
SET quantity = i.quantity + ri.quantity
FROM scoped_returns r
JOIN return_items ri ON ri.return_id = r.id
LEFT JOIN stock_movements sm ON sm.reference_id = r.id AND sm.source = 'pos_return' AND sm.product_id = ri.product_id
WHERE i.product_id = ri.product_id 
  AND i.store_id = r.store_id
  AND ri.restock_action = 'RESTOCK'
  AND sm.id IS NULL;

-- 5. Manual fix for a single product (replace values):
-- UPDATE inventory 
-- SET quantity = quantity + [RETURNED_QUANTITY]
-- WHERE store_id = 'bf99069f-d004-4d8f-95fc-8f9e89bd758d' AND product_id = '[PRODUCT_ID]';
