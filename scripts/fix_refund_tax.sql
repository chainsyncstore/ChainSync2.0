
BEGIN;

-- Update refunds that have 0 tax_amount but a non-zero total
UPDATE transactions t
SET tax_amount = ROUND(
    (t.total - (t.total / (1 + COALESCE(
        -- Priority 1: Use the effective tax rate from the original transaction (if available)
        (
            SELECT (pt.tax_amount / NULLIF(pt.subtotal, 0))
            FROM transactions pt
            WHERE pt.id = t.origin_transaction_id
            AND pt.subtotal > 0
        ),
        -- Priority 2: Use the store's current configured tax rate
        (
            SELECT s.tax_rate
            FROM stores s
            WHERE s.id = t.store_id
        ),
        -- Priority 3: Fallback default (7.5%)
        0.075
    ))))::numeric,
    2
)
WHERE t.kind = 'REFUND'
  AND t.tax_amount = 0
  AND t.total <> 0;

COMMIT;
