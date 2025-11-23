-- billing_schema_patch.sql
-- Ensures billing tables/columns (users.subscription_id, subscriptions, payments, dunning) exist
BEGIN;

-------------------------
-- Enum prerequisites  --
-------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE subscription_status AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'SUSPENDED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_provider') THEN
    CREATE TYPE subscription_provider AS ENUM ('PAYSTACK', 'FLW');
  END IF;
END$$;

-------------------------
-- Organizations table --
-------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  currency varchar(8) NOT NULL DEFAULT 'NGN',
  is_active boolean NOT NULL DEFAULT false,
  locked_until timestamptz,
  billing_email varchar(255),
  loyalty_earn_rate numeric(10,4) NOT NULL DEFAULT 1.0000,
  loyalty_redeem_value numeric(10,4) NOT NULL DEFAULT 0.0100,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS currency varchar(8) NOT NULL DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS billing_email varchar(255),
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

-------------------------
-- Subscriptions table --
-------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid,
  tier varchar(50) NOT NULL,
  plan_code varchar(128) NOT NULL,
  provider subscription_provider NOT NULL DEFAULT 'PAYSTACK',
  status subscription_status NOT NULL DEFAULT 'TRIAL',
  upfront_fee_paid numeric(10,2) NOT NULL DEFAULT 0,
  upfront_fee_currency varchar(3) NOT NULL DEFAULT 'NGN',
  monthly_amount numeric(10,2) NOT NULL DEFAULT 0,
  monthly_currency varchar(3) NOT NULL DEFAULT 'NGN',
  trial_start_date timestamptz NOT NULL DEFAULT now(),
  trial_end_date timestamptz NOT NULL,
  next_billing_date timestamptz,
  upfront_fee_credited boolean NOT NULL DEFAULT false,
  autopay_enabled boolean NOT NULL DEFAULT false,
  autopay_provider subscription_provider,
  autopay_reference varchar(255),
  autopay_configured_at timestamptz,
  autopay_last_status varchar(32),
  trial_reminder_7_sent_at timestamptz,
  trial_reminder_3_sent_at timestamptz,
  external_customer_id varchar(255),
  external_sub_id varchar(255),
  started_at timestamptz,
  current_period_end timestamptz,
  last_event_raw jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS plan_code varchar(128) NOT NULL DEFAULT tier,
  ADD COLUMN IF NOT EXISTS provider subscription_provider NOT NULL DEFAULT 'PAYSTACK',
  ADD COLUMN IF NOT EXISTS status subscription_status NOT NULL DEFAULT 'TRIAL',
  ADD COLUMN IF NOT EXISTS upfront_fee_paid numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upfront_fee_currency varchar(3) NOT NULL DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS monthly_amount numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_currency varchar(3) NOT NULL DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS trial_start_date timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS trial_end_date timestamptz NOT NULL DEFAULT now() + interval '14 days',
  ADD COLUMN IF NOT EXISTS next_billing_date timestamptz,
  ADD COLUMN IF NOT EXISTS upfront_fee_credited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS autopay_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS autopay_provider subscription_provider,
  ADD COLUMN IF NOT EXISTS autopay_reference varchar(255),
  ADD COLUMN IF NOT EXISTS autopay_configured_at timestamptz,
  ADD COLUMN IF NOT EXISTS autopay_last_status varchar(32),
  ADD COLUMN IF NOT EXISTS trial_reminder_7_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_reminder_3_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS external_customer_id varchar(255),
  ADD COLUMN IF NOT EXISTS external_sub_id varchar(255),
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS last_event_raw jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS subscriptions_org_idx ON subscriptions(org_id);
CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(status);
CREATE INDEX IF NOT EXISTS subscriptions_trial_end_idx ON subscriptions(trial_end_date);

-------------------------
-- Users table columns --
-------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS org_id uuid,
  ADD COLUMN IF NOT EXISTS subscription_id uuid,
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_2fa boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'subscription_id'
  ) THEN
    ALTER TABLE public.users ADD COLUMN subscription_id uuid;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_org_fk'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_org_fk
        FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE SET NULL;
  END IF;
END$$;

DO $$
DECLARE
  subscription_column_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'subscription_id'
  ) INTO subscription_column_exists;

  IF NOT subscription_column_exists THEN
    RAISE NOTICE 'Skipping users_subscription_fk: column subscription_id missing on users table';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_subscription_fk'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_subscription_fk
        FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS users_org_idx ON public.users(org_id);

DO $$
DECLARE
  subscription_column_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'subscription_id'
  ) INTO subscription_column_exists;

  IF subscription_column_exists THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS users_subscription_idx ON public.users(subscription_id)';
  ELSE
    RAISE NOTICE 'Skipping users_subscription_idx: column subscription_id missing on users table';
  END IF;
END$$;

-------------------------------
-- Subscription payments log --
-------------------------------
CREATE TABLE IF NOT EXISTS subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  payment_reference varchar(255),
  plan_code varchar(128),
  external_sub_id varchar(255),
  external_invoice_id varchar(255),
  reference varchar(255),
  amount numeric(10,2) NOT NULL,
  currency varchar(3) NOT NULL,
  payment_type varchar(50) NOT NULL,
  status varchar(50) NOT NULL,
  provider varchar(50) NOT NULL,
  event_type varchar(64),
  raw jsonb,
  metadata jsonb,
  occurred_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_payments_subscription_idx ON subscription_payments(subscription_id);
CREATE INDEX IF NOT EXISTS subscription_payments_org_idx ON subscription_payments(org_id);
CREATE INDEX IF NOT EXISTS subscription_payments_status_idx ON subscription_payments(status);

-----------------------
-- Dunning events    --
-----------------------
CREATE TABLE IF NOT EXISTS dunning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  attempt integer,
  status varchar(32),
  sent_at timestamptz,
  next_attempt_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dunning_events_subscription_idx ON dunning_events(subscription_id);
CREATE INDEX IF NOT EXISTS dunning_events_org_idx ON dunning_events(org_id);

COMMIT;