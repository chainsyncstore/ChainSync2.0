CREATE TABLE IF NOT EXISTS dunning_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    subscription_id uuid NOT NULL,
    attempt integer NOT NULL,
    status varchar(32) NOT NULL,
    reason text,
    sent_at timestamptz DEFAULT now(),
    next_attempt_at timestamptz
);

CREATE INDEX IF NOT EXISTS dunning_events_org_idx ON dunning_events(org_id);
CREATE INDEX IF NOT EXISTS dunning_events_subscription_idx ON dunning_events(subscription_id);
CREATE UNIQUE INDEX IF NOT EXISTS dunning_events_subscription_attempt_unique ON dunning_events(subscription_id, attempt);

