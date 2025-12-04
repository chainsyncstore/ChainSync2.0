-- ============================================================================
-- FIX RETURNED INVENTORY
-- Run this to manually restock items from returns that didn't update inventory
-- ============================================================================

-- First, find returns with RESTOCK items that may not have updated inventory
-- Replace YOUR_STORE_ID with your actual store ID

-- View recent returns and their items
SELECT 
  r.id AS return_id,
  r.sale_id,
  r.occurred_at,
  ri.product_id,
  ri.quantity,
  ri.restock_action,
  p.name AS product_name,
  i.quantity AS current_inventory
FROM returns r
JOIN return_items ri ON ri.return_id = r.id
JOIN products p ON p.id = ri.product_id
LEFT JOIN inventory i ON i.product_id = ri.product_id AND i.store_id = r.store_id
WHERE ri.restock_action = 'RESTOCK'
ORDER BY r.occurred_at DESC
LIMIT 20;

-- To manually fix a specific return, update the inventory:
-- UPDATE inventory 
-- SET quantity = quantity + [RETURNED_QUANTITY]
-- WHERE store_id = '[STORE_ID]' AND product_id = '[PRODUCT_ID]';

-- Also add a stock movement record for audit trail:
-- INSERT INTO stock_movements (product_id, store_id, quantity_change, reason, reference_id, notes, created_by)
-- VALUES ('[PRODUCT_ID]', '[STORE_ID]', [RETURNED_QUANTITY], 'pos_return', '[RETURN_ID]', 'Manual fix for missed restock', '[YOUR_USER_ID]');
