-- Backfill script for inventory.last_restocked
--
-- Sets last_restocked for rows that have on-hand stock but never recorded a restock timestamp.
-- Prefers the most recent known update signal (last_cost_update, updated_at, created_at)
-- and falls back to the current timestamp.

UPDATE inventory
SET last_restocked = COALESCE(last_cost_update, updated_at, created_at, NOW())
WHERE last_restocked IS NULL
  AND quantity > 0;
