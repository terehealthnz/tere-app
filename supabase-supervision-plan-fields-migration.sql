-- supabase-supervision-plan-fields-migration.sql
--
-- Follow-up to supabase-mcnz-supervision-migration.sql. Adds the RMO
-- identifiers that appear on the MCNZ-facing supervision plan PDF:
-- registration number, scope of practice held, and PGY level at start.
-- These are captured during onboarding in AddProviderModal so the plan
-- PDF can be auto-generated at hire time.
--
-- Run once against Supabase.

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS mcnz_registration_number text,
  ADD COLUMN IF NOT EXISTS scope_of_practice text,
  ADD COLUMN IF NOT EXISTS pgy_level int,
  -- Where the auto-generated plan PDF was uploaded, so Admin can re-fetch
  -- the link without regenerating.
  ADD COLUMN IF NOT EXISTS supervision_plan_url text;
