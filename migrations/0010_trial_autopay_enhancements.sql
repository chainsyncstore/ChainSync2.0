ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS autopay_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS autopay_provider subscription_provider,
  ADD COLUMN IF NOT EXISTS autopay_reference varchar(255),
  ADD COLUMN IF NOT EXISTS autopay_configured_at timestamptz,
  ADD COLUMN IF NOT EXISTS autopay_last_status varchar(32),
  ADD COLUMN IF NOT EXISTS trial_reminder_7_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_reminder_3_sent_at timestamptz;
