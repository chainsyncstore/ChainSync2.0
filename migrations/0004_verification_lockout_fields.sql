-- Phase 2: Verification and Lockout Fields Migration
-- Add email verification, phone verification, and account lockout functionality

-- Add verification and lockout fields to users table
ALTER TABLE users 
ADD COLUMN email_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN phone_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN failed_login_attempts INTEGER DEFAULT 0,
ADD COLUMN locked_until TIMESTAMP,
ADD COLUMN last_failed_login TIMESTAMP,
ADD COLUMN verification_token VARCHAR(255),
ADD COLUMN verification_token_expires TIMESTAMP;

-- Create email verification tokens table
CREATE TABLE email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  used_at TIMESTAMP,
  is_used BOOLEAN DEFAULT FALSE
);

-- Create phone verification OTP table
CREATE TABLE phone_verification_otp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone VARCHAR(50) NOT NULL,
  otp_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  created_at TIMESTAMP DEFAULT NOW(),
  verified_at TIMESTAMP,
  is_verified BOOLEAN DEFAULT FALSE
);

-- Create account lockout logs table
CREATE TABLE account_lockout_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  username VARCHAR(255) NOT NULL,
  ip_address INET NOT NULL,
  action VARCHAR(50) NOT NULL,
  success BOOLEAN NOT NULL,
  reason TEXT,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create session management table for JWT tokens
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR(255) NOT NULL UNIQUE,
  refresh_token VARCHAR(255) NOT NULL UNIQUE,
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  refresh_expires_at TIMESTAMP NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_users_email_verified ON users(email_verified);
CREATE INDEX idx_users_phone_verified ON users(phone_verified);
CREATE INDEX idx_users_locked_until ON users(locked_until);
CREATE INDEX idx_users_failed_login_attempts ON users(failed_login_attempts);

CREATE INDEX idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);
CREATE INDEX idx_email_verification_tokens_token ON email_verification_tokens(token);
CREATE INDEX idx_email_verification_tokens_expires_at ON email_verification_tokens(expires_at);
CREATE INDEX idx_email_verification_tokens_unused ON email_verification_tokens(is_used) WHERE is_used = FALSE;

CREATE INDEX idx_phone_verification_otp_user_id ON phone_verification_otp(user_id);
CREATE INDEX idx_phone_verification_otp_phone ON phone_verification_otp(phone);
CREATE INDEX idx_phone_verification_otp_expires_at ON phone_verification_otp(expires_at);
CREATE INDEX idx_phone_verification_otp_unverified ON phone_verification_otp(is_verified) WHERE is_verified = FALSE;

CREATE INDEX idx_account_lockout_logs_user_id ON account_lockout_logs(user_id);
CREATE INDEX idx_account_lockout_logs_ip_address ON account_lockout_logs(ip_address);
CREATE INDEX idx_account_lockout_logs_created_at ON account_lockout_logs(created_at);
CREATE INDEX idx_account_lockout_logs_action ON account_lockout_logs(action);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_session_token ON user_sessions(session_token);
CREATE INDEX idx_user_sessions_refresh_token ON user_sessions(refresh_token);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX idx_user_sessions_active ON user_sessions(is_active) WHERE is_active = TRUE;

-- Add constraints
ALTER TABLE users 
ADD CONSTRAINT check_failed_login_attempts CHECK (failed_login_attempts >= 0),
ADD CONSTRAINT check_verification_token_expires CHECK (verification_token_expires > created_at);

ALTER TABLE email_verification_tokens
ADD CONSTRAINT check_expires_at CHECK (expires_at > created_at);

ALTER TABLE phone_verification_otp
ADD CONSTRAINT check_expires_at CHECK (expires_at > created_at),
ADD CONSTRAINT check_attempts CHECK (attempts >= 0 AND attempts <= max_attempts);

ALTER TABLE user_sessions
ADD CONSTRAINT check_expires_at CHECK (expires_at > created_at),
ADD CONSTRAINT check_refresh_expires_at CHECK (refresh_expires_at > created_at);

-- Create function to clean up expired tokens and sessions
CREATE OR REPLACE FUNCTION cleanup_expired_auth_data()
RETURNS void AS $$
BEGIN
  -- Clean up expired email verification tokens
  DELETE FROM email_verification_tokens 
  WHERE expires_at < NOW() AND is_used = FALSE;
  
  -- Clean up expired phone verification OTP
  DELETE FROM phone_verification_otp 
  WHERE expires_at < NOW() AND is_verified = FALSE;
  
  -- Clean up expired sessions
  DELETE FROM user_sessions 
  WHERE expires_at < NOW() OR refresh_expires_at < NOW();
  
  -- Clean up old lockout logs (keep last 30 days)
  DELETE FROM account_lockout_logs 
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically clean up expired data
CREATE OR REPLACE FUNCTION trigger_cleanup_expired_auth_data()
RETURNS trigger AS $$
BEGIN
  -- Clean up every 1000 operations to avoid performance impact
  IF (SELECT COUNT(*) FROM email_verification_tokens WHERE expires_at < NOW()) > 1000 THEN
    PERFORM cleanup_expired_auth_data();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on email_verification_tokens table
CREATE TRIGGER trigger_cleanup_expired_auth_data
  AFTER INSERT ON email_verification_tokens
  FOR EACH ROW
  EXECUTE FUNCTION trigger_cleanup_expired_auth_data();

-- Create view for user verification status
CREATE VIEW user_verification_status AS
SELECT 
  u.id,
  u.username,
  u.email,
  u.phone,
  u.email_verified,
  u.phone_verified,
  u.failed_login_attempts,
  u.locked_until,
  u.is_active,
  CASE 
    WHEN u.locked_until > NOW() THEN 'locked'
    WHEN u.failed_login_attempts >= 5 THEN 'suspended'
    WHEN u.email_verified = FALSE THEN 'unverified'
    ELSE 'active'
  END as account_status
FROM users u;

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT SELECT ON user_verification_status TO your_app_user;
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO your_app_user;
