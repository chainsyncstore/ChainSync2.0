-- Ensure the requires_password_change column exists for all environments
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS requires_password_change boolean NOT NULL DEFAULT false;
