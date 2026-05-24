-- Add must_change_password flag to providers table
-- Run in Supabase SQL editor

ALTER TABLE providers ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

-- Set force-change for all currently active providers so they must set their own password on next login
-- Comment out this line if providers have already set their own passwords
UPDATE providers SET must_change_password = true WHERE is_active = true;
