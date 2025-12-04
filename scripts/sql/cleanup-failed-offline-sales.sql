-- ============================================================================
-- CLEANUP FAILED OFFLINE SALES SCRIPT (FULL RESET)
-- ============================================================================
-- This script removes ALL sales/transaction records and resets related data.
-- Use this for a clean testing slate.
--
-- IMPORTANT: This will DELETE ALL sales data! Review before running.
--
-- NOTE: After running this, also clear the BROWSER's IndexedDB:
--   1. Open browser DevTools (F12)
--   2. Go to Application tab > Storage > IndexedDB
--   3. Find "chainsync_catalog" database
--   4. Delete the "offline_queue" object store entries
--   OR clear all site data via Application > Storage > Clear site data
-- ============================================================================

-- FULL RESET: WIPE ALL SALES, TRANSACTIONS, AND RELATED DATA
-- --------------------------------------------------------------------
BEGIN;

-- 1. POS v2 tables (new system)
DELETE FROM transaction_items;
DELETE FROM transactions;

-- 2. Legacy POS tables
DELETE FROM sale_items;
DELETE FROM sales;

DELETE FROM stock_movements WHERE source = 'pos_sale';

-- 4. Reset customer loyalty points to zero (optional - comment out if needed)
UPDATE customers SET current_points = 0, lifetime_points = 0, updated_at = NOW();

-- 5. Clear return records
DELETE FROM return_items;
DELETE FROM returns;

COMMIT;

-- Verify cleanup
SELECT 'Transactions' as table_name, COUNT(*) as count FROM transactions
UNION ALL SELECT 'Transaction Items', COUNT(*) FROM transaction_items
UNION ALL SELECT 'Sales', COUNT(*) FROM sales
UNION ALL SELECT 'Sale Items', COUNT(*) FROM sale_items
UNION ALL SELECT 'POS Stock Movements', COUNT(*) FROM stock_movements WHERE reason = 'pos_sale'
UNION ALL SELECT 'Customers with Points', COUNT(*) FROM customers WHERE current_points > 0;

-- ============================================================================
-- AFTER RUNNING: Clear Browser IndexedDB
-- ============================================================================
-- 1. Open DevTools (F12)
-- 2. Application > Storage > IndexedDB > chainsync_catalog
-- 3. Delete "offline_queue" entries
-- OR: Application > Storage > Clear site data
-- ============================================================================
