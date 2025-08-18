-- Add subscription_payments table for provider-managed subscription reconciliation
CREATE TABLE IF NOT EXISTS subscription_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    provider subscription_provider NOT NULL,
    plan_code varchar(128) NOT NULL,
    external_sub_id varchar(255),
    external_invoice_id varchar(255),
    reference varchar(255),
    amount numeric(12,2) NOT NULL,
    currency varchar(8) NOT NULL,
    status varchar(32) NOT NULL,
    event_type varchar(64),
    occurred_at timestamptz DEFAULT now(),
    raw jsonb
);

CREATE INDEX IF NOT EXISTS subscription_payments_org_idx ON subscription_payments(org_id);

