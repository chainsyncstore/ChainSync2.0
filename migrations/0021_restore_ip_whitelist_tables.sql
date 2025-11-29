BEGIN;

-- Restore ip_whitelists table
CREATE TABLE IF NOT EXISTS ip_whitelists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    ip_address VARCHAR(45) NOT NULL,
    description VARCHAR(255),
    whitelisted_by UUID NOT NULL,
    whitelisted_for UUID NOT NULL,
    role role NOT NULL,
    store_id UUID,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ip_whitelists_ip_address_idx ON ip_whitelists (ip_address);
CREATE INDEX IF NOT EXISTS ip_whitelists_org_id_idx ON ip_whitelists (org_id);
CREATE INDEX IF NOT EXISTS ip_whitelists_whitelisted_by_idx ON ip_whitelists (whitelisted_by);
CREATE INDEX IF NOT EXISTS ip_whitelists_whitelisted_for_idx ON ip_whitelists (whitelisted_for);
CREATE INDEX IF NOT EXISTS ip_whitelists_store_id_idx ON ip_whitelists (store_id);

-- Restore ip_whitelist_logs table
CREATE TABLE IF NOT EXISTS ip_whitelist_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address VARCHAR(45) NOT NULL,
    user_id UUID,
    username VARCHAR(255),
    action VARCHAR(50) NOT NULL,
    success BOOLEAN NOT NULL,
    reason VARCHAR(255),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ip_whitelist_logs_ip_address_idx ON ip_whitelist_logs (ip_address);
CREATE INDEX IF NOT EXISTS ip_whitelist_logs_user_id_idx ON ip_whitelist_logs (user_id);

COMMIT;
