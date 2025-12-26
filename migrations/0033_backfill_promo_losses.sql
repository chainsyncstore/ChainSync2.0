-- Backfill promotion_discount for ALL sales (free or discounted)
-- to strictly reflect the Realized Loss (Amount by which Cost exceeds Revenue).
-- If Cost < Revenue (profitable sale despite discount), promotion_discount becomes 0.
-- If Cost > Revenue (loss leader / free item), promotion_discount becomes (Cost - Revenue).

UPDATE transaction_items
SET promotion_discount = GREATEST(0, total_cost - total_price);
