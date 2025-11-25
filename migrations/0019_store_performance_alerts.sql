CREATE TABLE IF NOT EXISTS store_performance_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    timeframe TEXT NOT NULL DEFAULT 'daily',
    comparison_window TEXT NOT NULL DEFAULT 'previous_7_days',
    gross_revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
    transactions_count INTEGER NOT NULL DEFAULT 0,
    average_order_value NUMERIC(14,2) NOT NULL DEFAULT 0,
    baseline_revenue NUMERIC(14,2),
    baseline_transactions NUMERIC(14,2),
    revenue_delta_pct NUMERIC(6,2),
    transactions_delta_pct NUMERIC(6,2),
    refund_ratio NUMERIC(6,2),
    top_product JSONB,
    severity TEXT NOT NULL DEFAULT 'low',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, snapshot_date, timeframe)
);

CREATE INDEX IF NOT EXISTS store_performance_alerts_org_idx
    ON store_performance_alerts (org_id, snapshot_date);

CREATE INDEX IF NOT EXISTS store_performance_alerts_store_idx
    ON store_performance_alerts (store_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS store_performance_alerts_severity_idx
    ON store_performance_alerts (severity);

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS ip_whitelist_enforced BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS profile_update_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    code VARCHAR(10) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_update_otps_user_idx
    ON profile_update_otps (user_id, expires_at DESC);
