-- Phase 3: Incomplete Signup Handling Migration
-- Add fields to handle incomplete signups and allow retry

-- Add incomplete signup fields to users table
ALTER TABLE users 
ADD COLUMN signup_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN signup_started_at TIMESTAMP,
ADD COLUMN signup_completed_at TIMESTAMP,
ADD COLUMN signup_attempts INTEGER DEFAULT 0;

-- Add cleanup for abandoned incomplete signups (older than 24 hours)
-- This will be handled by a scheduled job or manual cleanup
CREATE INDEX idx_users_incomplete_signups ON users(signup_completed, signup_started_at) 
WHERE signup_completed = FALSE;

-- Add constraint to ensure signup_attempts is non-negative
ALTER TABLE users 
ADD CONSTRAINT check_signup_attempts CHECK (signup_attempts >= 0);

-- Create a function to clean up abandoned incomplete signups
CREATE OR REPLACE FUNCTION cleanup_abandoned_signups()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM users 
  WHERE signup_completed = FALSE 
    AND signup_started_at < NOW() - INTERVAL '24 hours';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create a view for incomplete signups for monitoring
CREATE VIEW incomplete_signups AS
SELECT 
  id,
  email,
  firstName,
  lastName,
  companyName,
  signup_started_at,
  signup_attempts,
  EXTRACT(EPOCH FROM (NOW() - signup_started_at))/3600 as hours_since_started
FROM users 
WHERE signup_completed = FALSE 
  AND signup_started_at IS NOT NULL;

