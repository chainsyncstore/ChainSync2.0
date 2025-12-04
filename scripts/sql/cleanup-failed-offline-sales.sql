-- ============================================================================
-- CLEANUP FAILED OFFLINE SALES SCRIPT
-- ============================================================================
-- This script removes sales records that failed to sync properly.
-- Run this AFTER you have already adjusted inventory for these items.
--
-- IMPORTANT: Review the SELECT statements first before running DELETE!
--
-- NOTE: If "1 pending" still shows after running this script, the pending
-- item is stored in the BROWSER's IndexedDB, not the database.
-- To clear browser-side pending sales:
--   1. Open browser DevTools (F12)
--   2. Go to Application tab > Storage > IndexedDB
--   3. Find "chainsync_catalog" database
--   4. Delete the "offline_queue" object store entries
--   OR clear all site data via Application > Storage > Clear site data
-- ============================================================================

-- QUICK OPTION: WIPE ALL SALES DATA (transactions + legacy sales)
-- --------------------------------------------------------------------
-- Uncomment the block below if you want to remove every sale/transaction
-- record (useful for fresh environments or when only test data exists).
-- This will delete ALL rows from both the new transactions tables and
-- the legacy sales tables.
-- --------------------------------------------------------------------
BEGIN;

-- POS v2 tables
DELETE FROM transaction_items;
DELETE FROM transactions;

-- Legacy POS tables
DELETE FROM sale_items;
DELETE FROM sales;

COMMIT;

-- Step 1: Preview sales with status 'pending' in the transactions table
-- These are likely failed POS transactions that never completed
SELECT 
    t.id,
    t.store_id,
    t.status,
    t.kind,
    t.total,
    t.payment_method,
    t.receipt_number,
    t.created_at,
    t.completed_at
FROM transactions t
WHERE t.status = 'pending'
  AND t.kind = 'SALE'
ORDER BY t.created_at DESC;

-- Step 2: Preview orphaned transaction items (items without valid transactions)
SELECT 
    ti.id,
    ti.transaction_id,
    ti.product_id,
    ti.quantity,
    ti.unit_price,
    ti.total_price
FROM transaction_items ti
LEFT JOIN transactions t ON t.id = ti.transaction_id
WHERE t.id IS NULL;

-- Step 3: Preview sales from the legacy sales table that might be problematic
-- Look for recent sales with very small amounts (possibly test/failed sales)
SELECT 
    s.id,
    s.store_id,
    s.total,
    s.payment_method,
    s.status,
    s.idempotency_key,
    s.occurred_at
FROM sales s
WHERE s.occurred_at > NOW() - INTERVAL '7 days'
ORDER BY s.occurred_at DESC
LIMIT 50;

-- ============================================================================
-- DELETE STATEMENTS - UNCOMMENT AND RUN AFTER REVIEWING ABOVE
-- ============================================================================

-- Delete pending transactions (failed POS sales)
-- UNCOMMENT THE FOLLOWING LINES TO EXECUTE:

/*
-- First delete the transaction items for pending transactions
DELETE FROM transaction_items 
WHERE transaction_id IN (
    SELECT id FROM transactions 
    WHERE status = 'pending' AND kind = 'SALE'
);

-- Then delete the pending transactions themselves
DELETE FROM transactions 
WHERE status = 'pending' AND kind = 'SALE';

-- Delete orphaned transaction items (no parent transaction)
DELETE FROM transaction_items ti
WHERE NOT EXISTS (
    SELECT 1 FROM transactions t WHERE t.id = ti.transaction_id
);
*/

-- ============================================================================
-- DELETE SPECIFIC SALES BY DATE RANGE
-- ============================================================================
-- If you know the specific date range of the failed sales, use this:

/*
-- Preview what will be deleted
SELECT id, store_id, total, occurred_at, idempotency_key
FROM sales 
WHERE occurred_at BETWEEN '2025-12-01' AND '2025-12-04'
  AND store_id = 'YOUR_STORE_ID_HERE';

-- Delete sale items first
DELETE FROM sale_items 
WHERE sale_id IN (
    SELECT id FROM sales 
    WHERE occurred_at BETWEEN '2025-12-01' AND '2025-12-04'
      AND store_id = 'YOUR_STORE_ID_HERE'
);

-- Then delete the sales
DELETE FROM sales 
WHERE occurred_at BETWEEN '2025-12-01' AND '2025-12-04'
  AND store_id = 'YOUR_STORE_ID_HERE';
*/

-- ============================================================================
-- DELETE BY SPECIFIC IDs (SAFEST OPTION)
-- ============================================================================
-- If you know the exact sale IDs to remove:

/*
-- Delete sale items for specific sales
DELETE FROM sale_items 
WHERE sale_id IN (
    'sale-id-1-here',
    'sale-id-2-here',
    'sale-id-3-here'
);

-- Delete the sales themselves
DELETE FROM sales 
WHERE id IN (
    'sale-id-1-here',
    'sale-id-2-here',
    'sale-id-3-here'
);
*/

-- ============================================================================
-- VERIFY CLEANUP
-- ============================================================================
-- Run these after cleanup to verify

-- Check remaining pending transactions
SELECT COUNT(*) as pending_transactions FROM transactions WHERE status = 'pending';

-- Check for orphaned transaction items
SELECT COUNT(*) as orphaned_items 
FROM transaction_items ti
LEFT JOIN transactions t ON t.id = ti.transaction_id
WHERE t.id IS NULL;

-- Check recent sales count
SELECT COUNT(*) as recent_sales 
FROM sales 
WHERE occurred_at > NOW() - INTERVAL '7 days';
