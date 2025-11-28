-- Backfill legacy store-level IP whitelist entries into per-user records.
-- Run inside a transaction-aware environment (psql, Neon SQL editor, etc.).

BEGIN;

WITH legacy_entries AS (
  SELECT id,
         ip_address,
         description,
         whitelisted_by,
         whitelisted_for,
         org_id,
         UPPER(role::text) AS role,
         store_id
    FROM ip_whitelists
   WHERE store_id IS NOT NULL
     AND whitelisted_for = whitelisted_by
     AND is_active = TRUE
),
eligible_staff AS (
  SELECT le.id                AS legacy_id,
         staff.user_id        AS user_id,
         le.ip_address,
         le.description,
         le.whitelisted_by,
         le.org_id,
         le.role,
         le.store_id
    FROM legacy_entries le
    CROSS JOIN LATERAL (
      -- Direct store assignments matching the role.
      SELECT u.id AS user_id
        FROM users u
       WHERE u.store_id = le.store_id
         AND COALESCE(u.is_admin, FALSE) = FALSE
         AND COALESCE(u.is_active, TRUE) = TRUE
         AND UPPER(COALESCE(u.role::text, '')) = le.role

      UNION

      -- Delegated managers with explicit store permissions.
      SELECT usp.user_id
        FROM user_store_permissions usp
        JOIN users mu ON mu.id = usp.user_id
       WHERE usp.store_id = le.store_id
         AND le.role = 'MANAGER'
         AND COALESCE(mu.is_admin, FALSE) = FALSE
         AND COALESCE(mu.is_active, TRUE) = TRUE
         AND UPPER(COALESCE(mu.role::text, '')) = 'MANAGER'
    ) AS staff
),
inserted AS (
  INSERT INTO ip_whitelists (
    ip_address,
    description,
    whitelisted_by,
    whitelisted_for,
    org_id,
    role,
    store_id,
    is_active
  )
  SELECT es.ip_address,
         es.description,
         es.whitelisted_by,
         es.user_id,
         es.org_id,
         es.role::role,
         es.store_id,
         TRUE
    FROM eligible_staff es
   WHERE NOT EXISTS (
           SELECT 1
             FROM ip_whitelists existing
            WHERE existing.ip_address = es.ip_address
              AND existing.whitelisted_for = es.user_id
              AND existing.is_active = TRUE
         )
  RETURNING id, whitelisted_for, role, store_id,
            (SELECT legacy_id FROM eligible_staff WHERE eligible_staff.user_id = ip_whitelists.whitelisted_for LIMIT 1) AS source_legacy_id
)
UPDATE ip_whitelists legacy
   SET is_active = FALSE,
       updated_at = NOW()
  WHERE legacy.id IN (
          SELECT DISTINCT source_legacy_id
            FROM inserted
            WHERE source_legacy_id IS NOT NULL
        );

COMMIT;
