-- Add SWAP_CHARGE and SWAP_REFUND to transaction_kind enum for product swap feature
ALTER TYPE transaction_kind ADD VALUE IF NOT EXISTS 'SWAP_CHARGE';
ALTER TYPE transaction_kind ADD VALUE IF NOT EXISTS 'SWAP_REFUND';
