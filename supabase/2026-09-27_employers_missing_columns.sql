-- Add columns the _employers.js PATCH/POST allowlist already writes to but
-- that were never in the original schema (supabase-employer-migration.sql).
--
-- Symptom: clicking Deactivate on an employer row in Admin returned 500.
-- Server sets patch.updated_at on every PATCH and the column didn't exist,
-- so Postgres rejected the update. Same for the Edit modal's contact_name /
-- contact_phone / notes fields.
--
-- Idempotent — safe to re-run.

BEGIN;

ALTER TABLE employers
  ADD COLUMN IF NOT EXISTS updated_at    timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS contact_name  text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS notes         text;

-- Backfill updated_at for existing rows so downstream sorts/filters have a
-- non-null value.
UPDATE employers SET updated_at = COALESCE(updated_at, created_at, now())
  WHERE updated_at IS NULL;

COMMIT;
