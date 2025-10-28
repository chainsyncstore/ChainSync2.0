-- Enforce role scoping rules:
-- - ADMIN must be global (store_id IS NULL)
-- - MANAGER and CASHIER must be store-scoped (store_id IS NOT NULL)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_scope_chk'
  ) THEN
    ALTER TABLE user_roles
      ADD CONSTRAINT user_roles_scope_chk
      CHECK ( (role = 'ADMIN' AND store_id IS NULL)
           OR (role IN ('MANAGER','CASHIER') AND store_id IS NOT NULL) );
  END IF;
END $$;

-- Ensure at most one ADMIN row per user (global admin: store_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_admin_unique
  ON user_roles (user_id, role)
  WHERE role = 'ADMIN' AND store_id IS NULL;

-- Optional referential integrity (idempotent creation of FKs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_user_fk'
  ) THEN
    ALTER TABLE user_roles
      ADD CONSTRAINT user_roles_user_fk
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_store_fk'
  ) THEN
    ALTER TABLE user_roles
      ADD CONSTRAINT user_roles_store_fk
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
  END IF;
END $$;
