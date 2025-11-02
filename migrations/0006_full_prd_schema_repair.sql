BEGIN;

-- Ensure pgcrypto is available for UUID defaults
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Core enums needed by the production schema
DO $$
BEGIN
  CREATE TYPE sale_status AS ENUM ('COMPLETED', 'RETURNED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE subscription_provider AS ENUM ('PAYSTACK', 'FLW');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- Normalize subscription_status enum values to expected uppercase set
DO $$
DECLARE
  has_subscription_status boolean;
  needs_reset boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'subscription_status'
  ) INTO has_subscription_status;

  IF NOT has_subscription_status THEN
    CREATE TYPE subscription_status AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED');
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'subscription_status'
      AND e.enumlabel NOT IN ('ACTIVE', 'PAST_DUE', 'CANCELLED')
  )
  OR EXISTS (
    SELECT 1
    FROM (VALUES ('ACTIVE'), ('PAST_DUE'), ('CANCELLED')) AS expected(label)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'subscription_status'
        AND e.enumlabel = expected.label
    )
  ) INTO needs_reset;

  IF needs_reset THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscriptions'
    ) THEN
      -- No dependent table, drop and recreate
      DROP TYPE subscription_status;
      CREATE TYPE subscription_status AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED');
    ELSE
      CREATE TYPE subscription_status_new AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED');
      EXECUTE 'ALTER TABLE subscriptions ALTER COLUMN status DROP DEFAULT';
      EXECUTE '
        ALTER TABLE subscriptions
        ALTER COLUMN status TYPE subscription_status_new
        USING upper(status::text)::subscription_status_new
      ';
      EXECUTE 'DROP TYPE subscription_status';
      EXECUTE 'ALTER TYPE subscription_status_new RENAME TO subscription_status';
    END IF;
  END IF;
END
$$;

-- Recreate critical org-scoped tables if they are missing
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  currency varchar(8) NOT NULL DEFAULT 'NGN',
  is_active boolean NOT NULL DEFAULT false,
  locked_until timestamp with time zone,
  billing_email varchar(255),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ip_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  role role NOT NULL,
  cidr_or_ip varchar(64) NOT NULL,
  label varchar(255),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  points integer NOT NULL DEFAULT 0,
  tier varchar(64)
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loyalty_account_id uuid NOT NULL,
  points integer NOT NULL,
  reason varchar(255) NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  store_id uuid,
  product_id uuid,
  old_price numeric(12, 2) NOT NULL,
  new_price numeric(12, 2) NOT NULL,
  initiated_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity integer NOT NULL,
  unit_price numeric(12, 2) NOT NULL,
  line_discount numeric(12, 2) NOT NULL DEFAULT '0',
  line_total numeric(12, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL,
  reason text,
  processed_by uuid NOT NULL,
  occurred_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  product_id uuid NOT NULL,
  current_qty integer NOT NULL,
  reorder_level integer NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  resolved boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider subscription_provider NOT NULL,
  event_id varchar(255) NOT NULL,
  received_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dunning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  attempt integer NOT NULL,
  status varchar(32) NOT NULL,
  reason text,
  sent_at timestamp with time zone DEFAULT now(),
  next_attempt_at timestamp with time zone
);


-- Add missing columns to existing tables
ALTER TABLE stores ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE customers ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS name varchar(255);
ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS loyalty_account_id uuid;
ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS points integer;
ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS reason varchar(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price numeric(12, 2) DEFAULT '0';
ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price numeric(12, 2) DEFAULT '0';
ALTER TABLE products ADD COLUMN IF NOT EXISTS vat_rate numeric(5, 2) DEFAULT '0';
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS reorder_level integer DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider subscription_provider;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_code varchar(128);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS external_customer_id varchar(255);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS external_sub_id varchar(255);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS started_at timestamp with time zone;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_period_end timestamp with time zone;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_event_raw jsonb;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS plan_code varchar(128);
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS external_sub_id varchar(255);
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS external_invoice_id varchar(255);
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS reference varchar(255);
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS event_type varchar(64);
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS occurred_at timestamp with time zone;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS raw jsonb;

-- Ensure provider column uses enum type
DO $$
DECLARE
  provider_is_enum boolean;
BEGIN
  SELECT
    data_type = 'USER-DEFINED'
    AND udt_name = 'subscription_provider'
  INTO provider_is_enum
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'subscription_payments'
    AND column_name = 'provider';

  IF provider_is_enum IS DISTINCT FROM TRUE THEN
    UPDATE subscription_payments
    SET provider = upper(provider)
    WHERE provider IS NOT NULL;

    ALTER TABLE subscription_payments
      ALTER COLUMN provider DROP DEFAULT;

    ALTER TABLE subscription_payments
      ALTER COLUMN provider TYPE subscription_provider
      USING provider::text::subscription_provider;
  END IF;
END
$$;

-- Ensure sales columns align with expected types
ALTER TABLE sales
  ALTER COLUMN status DROP DEFAULT;
ALTER TABLE sales
  ALTER COLUMN payment_method TYPE text;
ALTER TABLE sales
  ALTER COLUMN status TYPE sale_status USING upper(status)::sale_status;
ALTER TABLE sales
  ALTER COLUMN occurred_at TYPE timestamp with time zone USING occurred_at AT TIME ZONE 'UTC';
ALTER TABLE sales
  ALTER COLUMN status SET DEFAULT 'COMPLETED';

-- Normalize timestamp columns to timestamptz where required
ALTER TABLE stores
  ALTER COLUMN created_at TYPE timestamp with time zone USING created_at AT TIME ZONE 'UTC';
ALTER TABLE customers
  ALTER COLUMN created_at TYPE timestamp with time zone USING created_at AT TIME ZONE 'UTC';
ALTER TABLE loyalty_transactions
  ALTER COLUMN created_at TYPE timestamp with time zone USING created_at AT TIME ZONE 'UTC';
ALTER TABLE products
  ALTER COLUMN created_at TYPE timestamp with time zone USING created_at AT TIME ZONE 'UTC';
ALTER TABLE subscriptions
  ALTER COLUMN updated_at TYPE timestamp with time zone USING updated_at AT TIME ZONE 'UTC';

-- Seed legacy organization and wire existing records to it
DO $$
DECLARE
  legacy_org_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM organizations) THEN
    SELECT id INTO legacy_org_id FROM organizations ORDER BY created_at LIMIT 1;
  ELSE
    INSERT INTO organizations (name, currency, is_active)
    VALUES ('Legacy Organization', 'NGN', true)
    RETURNING id INTO legacy_org_id;
  END IF;

  UPDATE organizations
  SET is_active = true
  WHERE id = legacy_org_id;

  UPDATE stores
  SET org_id = legacy_org_id
  WHERE org_id IS NULL;

  UPDATE users
  SET org_id = legacy_org_id
  WHERE org_id IS NULL;

  UPDATE products
  SET org_id = legacy_org_id
  WHERE org_id IS NULL;

  UPDATE customers
  SET org_id = legacy_org_id
  WHERE org_id IS NULL;

  UPDATE subscriptions
  SET org_id = legacy_org_id
  WHERE org_id IS NULL;

  UPDATE subscription_payments
  SET org_id = legacy_org_id
  WHERE org_id IS NULL;
END
$$;

-- Reinstate NOT NULL and default constraints where safe
ALTER TABLE stores ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE products ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE inventory ALTER COLUMN reorder_level SET NOT NULL;
ALTER TABLE subscriptions ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE subscription_payments ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE subscriptions ALTER COLUMN provider SET NOT NULL;
ALTER TABLE subscriptions ALTER COLUMN plan_code SET NOT NULL;
ALTER TABLE subscription_payments ALTER COLUMN plan_code SET NOT NULL;
ALTER TABLE subscription_payments ALTER COLUMN provider SET NOT NULL;

-- Key indexes / constraints for updated tables
CREATE INDEX IF NOT EXISTS stores_org_idx ON stores (org_id);
CREATE UNIQUE INDEX IF NOT EXISTS products_org_sku_unique ON products (org_id, sku);
CREATE INDEX IF NOT EXISTS products_org_idx ON products (org_id);
CREATE INDEX IF NOT EXISTS inventory_product_idx ON inventory (product_id);
CREATE INDEX IF NOT EXISTS inventory_store_idx ON inventory (store_id);
CREATE INDEX IF NOT EXISTS customers_org_idx ON customers (org_id);
CREATE UNIQUE INDEX IF NOT EXISTS customers_org_phone_unique ON customers (org_id, phone);
CREATE INDEX IF NOT EXISTS price_changes_created_idx ON price_changes (created_at);
CREATE INDEX IF NOT EXISTS subscriptions_org_idx ON subscriptions (org_id);
CREATE INDEX IF NOT EXISTS subscription_payments_org_idx ON subscription_payments (org_id);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_payments_provider_invoice_unique ON subscription_payments (provider, external_invoice_id);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_payments_provider_reference_unique ON subscription_payments (provider, reference);

COMMIT;
