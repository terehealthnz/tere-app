-- Multi-provider migration
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/xynwqfbnwpkyvovxdone/sql

-- 1. Providers table
CREATE TABLE IF NOT EXISTS providers (
  id                   uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name           text        NOT NULL,
  last_name            text        NOT NULL,
  credential           text        NOT NULL DEFAULT 'M.D.',
  specialty            text,
  email                text,
  color                text        DEFAULT '#0B6E76',
  is_active            boolean     DEFAULT true,
  is_admin             boolean     DEFAULT false,
  is_provider          boolean     DEFAULT true,
  is_available         boolean     DEFAULT false,
  availability_message text,
  pin                  text        NOT NULL,
  created_at           timestamptz DEFAULT now()
);

-- 2. Seed providers (skip if already exist by name)
INSERT INTO providers (first_name, last_name, credential, specialty, color, is_active, is_admin, is_provider, pin)
SELECT 'Patrick', 'Herling', 'M.D.', 'Emergency Medicine', '#0B6E76', true, true, true, 'tere2026'
WHERE NOT EXISTS (SELECT 1 FROM providers WHERE first_name = 'Patrick' AND last_name = 'Herling');

INSERT INTO providers (first_name, last_name, credential, specialty, color, is_active, is_admin, is_provider, pin)
SELECT 'Rachel', 'Thomas', 'M.D.', NULL, '#7C3AED', true, false, true, 'rachel2026'
WHERE NOT EXISTS (SELECT 1 FROM providers WHERE first_name = 'Rachel' AND last_name = 'Thomas');

INSERT INTO providers (first_name, last_name, credential, specialty, color, is_active, is_admin, is_provider, pin)
SELECT 'Justin', 'Thomas', '', NULL, '#374151', true, true, false, 'justin2026'
WHERE NOT EXISTS (SELECT 1 FROM providers WHERE first_name = 'Justin' AND last_name = 'Thomas');

-- 3. Add provider columns to consultations
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS provider_id           uuid REFERENCES providers(id),
  ADD COLUMN IF NOT EXISTS provider_display_name text;
