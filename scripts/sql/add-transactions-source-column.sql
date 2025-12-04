-- ============================================================================
-- ADD MISSING COLUMNS TO TRANSACTIONS TABLE
-- ============================================================================
-- The schema defines columns that are missing from the database.
-- This script adds all of them.
-- ============================================================================

-- Add source column (required, default 'pos')
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS source VARCHAR(64) NOT NULL DEFAULT 'pos';

-- Add import_batch_id column (optional, for import tracking)
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS import_batch_id UUID;

-- Add origin_transaction_id column (optional, for refunds/returns)
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS origin_transaction_id UUID;

-- Add completed_at column (optional, timestamp)
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

-- Verify columns were added
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'transactions' 
  AND column_name IN ('source', 'import_batch_id', 'origin_transaction_id', 'completed_at')
ORDER BY column_name;
