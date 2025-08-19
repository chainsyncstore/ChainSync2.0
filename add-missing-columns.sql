-- Add missing columns to users table
-- This script adds the columns that the code expects but are missing from the database

-- Add 2FA and security fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS requires_2fa BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(255);

-- Add password hash field (if not exists)
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Add admin field
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Add organization field
ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id UUID;

-- Add last login field
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;

-- Add missing fields for signup functionality
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS tier VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS location VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_failed_login TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_completed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_id UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS store_id UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add missing fields to stores table
ALTER TABLE stores ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,4) DEFAULT 0.085;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_store_id ON users(store_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_signup_completed ON users(signup_completed, signup_started_at);

-- Update existing users to have default values
UPDATE users SET 
    username = email,
    first_name = 'User',
    last_name = 'Name',
    phone = '+1234567890',
    company_name = 'Company',
    tier = 'basic',
    location = 'international',
    is_active = TRUE,
    requires_2fa = FALSE,
    is_admin = FALSE,
    signup_completed = TRUE,
    signup_attempts = 1
WHERE username IS NULL;

-- Set email as NOT NULL if it's not already
-- ALTER TABLE users ALTER COLUMN email SET NOT NULL;

-- Add constraints
ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS users_email_unique UNIQUE (email);
ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS users_username_unique UNIQUE (username);

-- Verify the changes
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;
