-- Backfill transaction_items for existing REFUND transactions that don't have items
-- This enables COGS tracking for refunds

-- Insert transaction items for refund transactions using return_items data
INSERT INTO transaction_items (transaction_id, product_id, quantity, unit_price, total_price, unit_cost, total_cost)
SELECT 
  t.id as transaction_id,
  ri.product_id,
  ri.quantity,
  COALESCE(ri.refund_amount::numeric / NULLIF(ri.quantity, 0), 0) as unit_price,
  COALESCE(ri.refund_amount::numeric, 0) as total_price,
  COALESCE(inv.avg_cost, 0) as unit_cost,
  COALESCE(inv.avg_cost * ri.quantity, 0) as total_cost
FROM transactions t
JOIN returns r ON r.id = t.receipt_number::uuid
JOIN return_items ri ON ri.return_id = r.id
LEFT JOIN inventory inv ON inv.product_id = ri.product_id AND inv.store_id = t.store_id
WHERE t.kind = 'REFUND'
  AND t.status = 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM transaction_items ti 
    WHERE ti.transaction_id = t.id
  );

-- Verify the backfill
SELECT 
  t.kind,
  COUNT(DISTINCT t.id) as transaction_count,
  COUNT(ti.id) as item_count
FROM transactions t
LEFT JOIN transaction_items ti ON ti.transaction_id = t.id
WHERE t.status = 'completed'
GROUP BY t.kind;
