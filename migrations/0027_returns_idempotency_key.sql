BEGIN;

ALTER TABLE returns ADD COLUMN IF NOT EXISTS idempotency_key varchar(255);

CREATE UNIQUE INDEX IF NOT EXISTS returns_idempotency_unique
  ON returns (idempotency_key);

COMMIT;
