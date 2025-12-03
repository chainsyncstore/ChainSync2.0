-- ============================================================
-- Clear All Analytics & Sales Data for organization 7d601616-c6ff-42b0-bb24-73252744c840
-- ============================================================

-- Set your org ID here
DO $$
DECLARE
    target_org_id UUID := '7d601616-c6ff-42b0-bb24-73252744c840';  -- user org
    store_ids UUID[];
BEGIN
    -- Get all store IDs for this org
    SELECT ARRAY_AGG(id) INTO store_ids FROM stores WHERE org_id = target_org_id;
    
    RAISE NOTICE 'Clearing analytics data for org: %', target_org_id;
    RAISE NOTICE 'Found % stores', COALESCE(array_length(store_ids, 1), 0);
END $$;

-- ============================================================
-- 1. LOYALTY DATA (depends on transactions)
-- ============================================================
DELETE FROM loyalty_transactions
WHERE customer_id IN (
    SELECT id FROM customers 
    WHERE store_id IN (SELECT id FROM stores WHERE org_id = '7d601616-c6ff-42b0-bb24-73252744c840')
);

-- ============================================================
-- 2. TRANSACTION ITEMS (depends on transactions)
-- ============================================================
DELETE FROM transaction_items
WHERE transaction_id IN (
    SELECT id FROM transactions 
    WHERE store_id IN (SELECT id FROM stores WHERE org_id = '7d601616-c6ff-42b0-bb24-73252744c840')
);

-- ============================================================
-- 3. TRANSACTIONS
-- ============================================================
DELETE FROM transactions
WHERE store_id IN (SELECT id FROM stores WHERE org_id = '7d601616-c6ff-42b0-bb24-73252744c840');

-- ============================================================
-- 4. LEGACY RETURN ITEMS (depends on returns)
-- ============================================================
DELETE FROM return_items
WHERE return_id IN (
    SELECT id FROM returns 
    WHERE store_id IN (SELECT id FROM stores WHERE org_id = '7d601616-c6ff-42b0-bb24-73252744c840')
);

-- ============================================================
-- 5. LEGACY RETURNS (depends on sales)
-- ============================================================
DELETE FROM returns
WHERE store_id IN (SELECT id FROM stores WHERE org_id = '7d601616-c6ff-42b0-bb24-73252744c840');

-- ============================================================
-- 6. LEGACY SALE ITEMS (depends on sales)
-- ============================================================
DELETE FROM sale_items
WHERE sale_id IN (
    SELECT id FROM sales WHERE org_id = '7d601616-c6ff-42b0-bb24-73252744c840'
);

-- ============================================================
-- 7. LEGACY SALES
-- ============================================================
DELETE FROM sales
WHERE org_id = '7d601616-c6ff-42b0-bb24-73252744c840';

-- ============================================================
-- 8. STOCK MOVEMENTS
-- ============================================================
DELETE FROM stock_movements
WHERE store_id IN (SELECT id FROM stores WHERE org_id = '7d601616-c6ff-42b0-bb24-73252744c840');

-- ============================================================
-- 9. INVENTORY COST LAYERS
-- ============================================================
DELETE FROM inventory_cost_layers
WHERE store_id IN (SELECT id FROM stores WHERE org_id = '7d601616-c6ff-42b0-bb24-73252744c840');

-- ============================================================
-- 10. PRICE CHANGE EVENTS
-- ============================================================
DELETE FROM price_change_events
WHERE store_id IN (SELECT id FROM stores WHERE org_id = '7d601616-c6ff-42b0-bb24-73252744c840');

-- ============================================================
-- 11. INVENTORY REVALUATION EVENTS
-- ============================================================
DELETE FROM inventory_revaluation_events
WHERE store_id IN (SELECT id FROM stores WHERE org_id = '7d601616-c6ff-42b0-bb24-73252744c840');

-- ============================================================
-- 12. LOW STOCK ALERTS
-- ============================================================
DELETE FROM low_stock_alerts
WHERE store_id IN (SELECT id FROM stores WHERE org_id = '7d601616-c6ff-42b0-bb24-73252744c840');

-- ============================================================
-- 13. STOCK ALERTS (nightly scanner)
-- ============================================================
DELETE FROM stock_alerts
WHERE store_id IN (SELECT id FROM stores WHERE org_id = '7d601616-c6ff-42b0-bb24-73252744c840');

-- ============================================================
-- 14. STORE PERFORMANCE ALERTS (analytics snapshots)
-- ============================================================
DELETE FROM store_performance_alerts
WHERE org_id = '7d601616-c6ff-42b0-bb24-73252744c840';

-- ============================================================
-- 15. SCHEDULED REPORTS
-- ============================================================
DELETE FROM scheduled_reports
WHERE org_id = '7d601616-c6ff-42b0-bb24-73252744c840';

-- ============================================================
-- 16. INVENTORY (reset quantities to 0 or delete)
-- ============================================================
DELETE FROM inventory
WHERE store_id IN (SELECT id FROM stores WHERE org_id = '7d601616-c6ff-42b0-bb24-73252744c840');

-- ============================================================
-- 17. IMPORT JOBS (history of CSV imports)
-- ============================================================
DELETE FROM import_jobs
WHERE org_id = '7d601616-c6ff-42b0-bb24-73252744c840';

-- ============================================================
-- 18. NOTIFICATIONS
-- ============================================================
DELETE FROM notifications
WHERE store_id IN (SELECT id FROM stores WHERE org_id = '7d601616-c6ff-42b0-bb24-73252744c840');

-- ============================================================
-- 19. SYNC QUEUE
-- ============================================================
DELETE FROM sync_queue
WHERE store_id IN (SELECT id FROM stores WHERE org_id = '7d601616-c6ff-42b0-bb24-73252744c840');

-- ============================================================
-- SUMMARY: Verify cleanup
-- ============================================================
DO $$
DECLARE
    target_org_id UUID := '7d601616-c6ff-42b0-bb24-73252744c840';
    cnt INTEGER;
BEGIN
    SELECT COUNT(*) INTO cnt FROM transactions WHERE store_id IN (SELECT id FROM stores WHERE org_id = target_org_id);
    RAISE NOTICE 'Remaining transactions: %', cnt;
    
    SELECT COUNT(*) INTO cnt FROM sales WHERE org_id = target_org_id;
    RAISE NOTICE 'Remaining legacy sales: %', cnt;
    
    SELECT COUNT(*) INTO cnt FROM stock_movements WHERE store_id IN (SELECT id FROM stores WHERE org_id = target_org_id);
    RAISE NOTICE 'Remaining stock movements: %', cnt;
    
    SELECT COUNT(*) INTO cnt FROM inventory WHERE store_id IN (SELECT id FROM stores WHERE org_id = target_org_id);
    RAISE NOTICE 'Remaining inventory records: %', cnt;
    
    SELECT COUNT(*) INTO cnt FROM store_performance_alerts WHERE org_id = target_org_id;
    RAISE NOTICE 'Remaining performance alerts: %', cnt;
END $$;

-- Done! Your analytics should now be clean.
