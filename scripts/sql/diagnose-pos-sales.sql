-- ============================================================================
-- POS SALES DIAGNOSTIC SCRIPT
-- Run these queries to find where data is/isn't being saved
-- ============================================================================

-- 1. Check if transactions exist (NEW analytics table)
SELECT 'TRANSACTIONS TABLE' as table_name;
SELECT id, store_id, cashier_id, status, kind, total, payment_method, created_at 
FROM transactions 
ORDER BY created_at DESC 
LIMIT 10;

-- 2. Check if legacy sales exist (OLD table - inventory uses this)
SELECT 'LEGACY SALES TABLE' as table_name;
SELECT id, store_id, cashier_id, total, status, occurred_at 
FROM sales 
ORDER BY occurred_at DESC 
LIMIT 10;

-- 3. Check customers with points
SELECT 'CUSTOMERS WITH POINTS' as table_name;
SELECT id, store_id, phone, first_name, current_points, lifetime_points, updated_at 
FROM customers 
WHERE current_points > 0 OR lifetime_points > 0
ORDER BY updated_at DESC 
LIMIT 10;

-- 4. Check all customers created recently
SELECT 'RECENT CUSTOMERS' as table_name;
SELECT id, store_id, phone, first_name, current_points, lifetime_points, created_at 
FROM customers 
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC 
LIMIT 10;

-- 5. Check stock movements (proves inventory IS being updated)
SELECT 'STOCK MOVEMENTS' as table_name;
SELECT id, store_id, product_id, delta, action_type, source, created_at 
FROM stock_movements 
WHERE source = 'pos_sale'
ORDER BY created_at DESC 
LIMIT 10;

-- 6. Check your store IDs
SELECT 'STORES' as table_name;
SELECT id, name, org_id FROM stores;

-- 7. Check organization loyalty settings
SELECT 'ORG LOYALTY SETTINGS' as table_name;
SELECT id, name, loyalty_earn_rate, loyalty_redeem_value FROM organizations;

-- ============================================================================
-- SUMMARY COUNTS
-- ============================================================================
SELECT 'SUMMARY COUNTS' as table_name;
SELECT 
  (SELECT COUNT(*) FROM transactions WHERE created_at > NOW() - INTERVAL '1 day') as transactions_today,
  (SELECT COUNT(*) FROM sales WHERE occurred_at > NOW() - INTERVAL '1 day') as legacy_sales_today,
  (SELECT COUNT(*) FROM customers WHERE current_points > 0) as customers_with_points,
  (SELECT COUNT(*) FROM stock_movements WHERE source = 'pos_sale' AND created_at > NOW() - INTERVAL '1 day') as pos_stock_moves_today;
