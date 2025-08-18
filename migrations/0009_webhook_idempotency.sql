-- Idempotency structures: unique constraints for payments and a webhook events table
ALTER TABLE subscription_payments
    ADD CONSTRAINT subscription_payments_provider_invoice_unique UNIQUE (provider, external_invoice_id);

ALTER TABLE subscription_payments
    ADD CONSTRAINT subscription_payments_provider_reference_unique UNIQUE (provider, reference);

CREATE TABLE IF NOT EXISTS webhook_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider subscription_provider NOT NULL,
    event_id varchar(255) NOT NULL,
    received_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_provider_event_unique
    ON webhook_events (provider, event_id);

