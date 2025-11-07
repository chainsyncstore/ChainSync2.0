-- Add subscription_id column to users and establish FK to subscriptions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name = 'subscription_id'
  ) THEN
    ALTER TABLE users
      ADD COLUMN subscription_id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.constraint_column_usage
    WHERE table_name = 'users'
      AND column_name = 'subscription_id'
      AND constraint_name = 'users_subscription_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_subscription_id_fkey
      FOREIGN KEY (subscription_id)
      REFERENCES subscriptions(id)
      ON DELETE SET NULL;
  END IF;
END $$;
