-- Creates the cleanup_abandoned_signups() helper referenced by server/jobs/cleanup.ts
-- so scheduled maintenance can delete stalled, incomplete signups directly inside Postgres.

CREATE OR REPLACE FUNCTION cleanup_abandoned_signups()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  cutoff TIMESTAMPTZ := NOW() - INTERVAL '1 hour';
  deleted_count INTEGER := 0;
  rec RECORD;
BEGIN
  FOR rec IN (
    SELECT id, org_id
    FROM users
    WHERE created_at < cutoff
      AND COALESCE(signup_completed, false) = false
      AND (signup_completed_at IS NULL OR signup_completed_at < cutoff)
      AND COALESCE(is_active, false) = false
  ) LOOP
    IF rec.org_id IS NOT NULL THEN
      DELETE FROM user_roles WHERE org_id = rec.org_id;
      DELETE FROM stores WHERE org_id = rec.org_id;
      DELETE FROM subscriptions WHERE org_id = rec.org_id;
      DELETE FROM organizations WHERE id = rec.org_id;
    END IF;

    DELETE FROM users WHERE id = rec.id;
    deleted_count := deleted_count + 1;
  END LOOP;

  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_abandoned_signups()
  IS 'Deletes users (and related org data) whose signup never completed within the last hour.';
