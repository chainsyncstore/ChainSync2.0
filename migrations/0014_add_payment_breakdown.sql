ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_breakdown jsonb;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS wallet_reference varchar(128);
