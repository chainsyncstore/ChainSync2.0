-- Add tax_remittances table for tracking tax payments to government
CREATE TABLE IF NOT EXISTS tax_remittances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  amount DECIMAL(14, 2) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'NGN',
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  remitted_at TIMESTAMP WITH TIME ZONE NOT NULL,
  reference VARCHAR(255),
  notes TEXT,
  recorded_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS tax_remittances_store_id_idx ON tax_remittances(store_id);
CREATE INDEX IF NOT EXISTS tax_remittances_period_idx ON tax_remittances(store_id, period_start, period_end);
