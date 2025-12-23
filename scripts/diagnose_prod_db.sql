
-- Run this SQL in your database tool (Neon Console / Supabase / pgAdmin)

-- 1. Check DB Connection Info
SELECT current_database(), current_user, version();

-- 2. Validate Organization & User (from your screenshot)
SELECT id AS org_id, name AS org_name, is_active AS org_active 
FROM organizations 
WHERE id = '7d601616-c6ff-42b0-bb24-73252744c840';

SELECT id AS user_id, email, org_id, store_id, is_active, role 
FROM users 
WHERE email = 'info.elvisoffice@gmail.com';

-- 3. List ALL Stores for your Organization
-- We want to see what ACTUAL Store IDs exist in your DB.
SELECT s.id AS store_id, s.name, s.org_id, s.is_active, s.tax_included
FROM stores s
WHERE s.org_id = '7d601616-c6ff-42b0-bb24-73252744c840';

-- 4. Check for the "Phantom" Store ID causing the POS error
-- If this returns NO ROWS, then the POS is definitely trying to access a deleted/invalid store.
SELECT * FROM stores WHERE id = 'f508eda6-9d82-4690-9b48-b6313ad334d4';

-- 5. Check Inventory Counts for your valid stores
SELECT s.name as store_name, s.id as store_id, COUNT(i.id) as inventory_count
FROM stores s
LEFT JOIN inventory i ON s.id = i.store_id
WHERE s.org_id = '7d601616-c6ff-42b0-bb24-73252744c840'
GROUP BY s.id, s.name;
