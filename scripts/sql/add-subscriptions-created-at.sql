-- Add created_at/updated_at columns to subscriptions if missing, and backfill timestamps
DO $$
DECLARE
  created_exists BOOLEAN;
  updated_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'subscriptions'
      AND column_name  = 'created_at'
  ) INTO created_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'subscriptions'
      AND column_name  = 'updated_at'
  ) INTO updated_exists;

  IF NOT created_exists THEN
    ALTER TABLE public.subscriptions
      ADD COLUMN created_at TIMESTAMPTZ;
  END IF;

  IF NOT updated_exists THEN
    ALTER TABLE public.subscriptions
      ADD COLUMN updated_at TIMESTAMPTZ;
  END IF;

  -- Backfill timestamps where null using existing trial_start_date or NOW()
  UPDATE public.subscriptions
     SET created_at = COALESCE(created_at, trial_start_date, NOW()),
         updated_at = COALESCE(updated_at, trial_end_date, created_at, NOW())
   WHERE (created_at IS NULL OR updated_at IS NULL);

  -- Enforce NOT NULL + default moving forward
  IF NOT created_exists THEN
    ALTER TABLE public.subscriptions
      ALTER COLUMN created_at SET DEFAULT NOW(),
      ALTER COLUMN created_at SET NOT NULL;
  END IF;

  IF NOT updated_exists THEN
    ALTER TABLE public.subscriptions
      ALTER COLUMN updated_at SET DEFAULT NOW(),
      ALTER COLUMN updated_at SET NOT NULL;
  END IF;
END $$;
