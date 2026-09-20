-- Extend the existing `employers` table with URL-based access (slug flow)
-- and roll back the parallel `employer_plans` table added earlier today.
--
-- Context: earlier migration `2026-09-19_employer_plans.sql` created a
-- separate table + `consultations.employer_plan_id` FK for a slug-based
-- B2B access flow. Post-application review found the existing `employers`
-- table (task #71 fraud-vector fix) + `_employers.js` endpoint + the
-- server-side employer verification in `_create-consultation.js` already
-- cover 80% of what we need. The existing infrastructure had no rows
-- yet (nothing to preserve), so unifying on it is the cleaner path.
--
-- This migration:
--   1. Drops the now-redundant `employer_plans` table (and its trigger).
--   2. Drops `consultations.employer_plan_id` (never populated).
--   3. Adds `slug` + `usage_cap_month` to the existing `employers` table.
--
-- After this migration the `employers` table supports BOTH:
--   - Allowlist access (existing pattern): admin adds employer rows +
--     employee rows to `employer_employees`; client sends employer_id;
--     server verifies via `_create-consultation.js` fraud check.
--   - URL access (new pattern): admin creates employer with a slug;
--     `/work/[slug]` route validates slug; consult created with
--     employer_id from the slug lookup, employer_paid=true, status
--     jumps straight to `waiting` (skip payment).
--
-- Slug design: non-guessable, 8-32 lowercase alphanumeric chars, unique.
-- Enforced by CHECK constraint. Generated server-side on employer create.
-- The URL is the credential; no separate employee allowlist needed for
-- the slug flow. Optional `usage_cap_month` provides a soft cap in case
-- a slug leaks.

BEGIN;

-- 1. Roll back the parallel table + its consultations FK.
DROP TRIGGER IF EXISTS employer_plans_updated_at ON employer_plans;
DROP FUNCTION IF EXISTS employer_plans_touch_updated_at();

ALTER TABLE consultations
  DROP COLUMN IF EXISTS employer_plan_id;

DROP INDEX IF EXISTS consultations_employer_plan_created_idx;
DROP INDEX IF EXISTS employer_plans_active_idx;

DROP TABLE IF EXISTS employer_plans;

-- 2. Extend the existing employers table with slug-URL access.
ALTER TABLE employers
  ADD COLUMN IF NOT EXISTS slug            text,
  ADD COLUMN IF NOT EXISTS usage_cap_month integer;

-- Unique index on slug (partial: only where slug is set, so employers
-- using the legacy allowlist flow don't need a slug and can leave it NULL).
CREATE UNIQUE INDEX IF NOT EXISTS employers_slug_unique_idx
  ON employers (slug)
  WHERE slug IS NOT NULL;

-- Format guard: slug must be 8-32 lowercase alphanumeric chars if set.
-- Uses a partial CHECK via a constraint on the format; NULL is allowed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'employers_slug_format'
  ) THEN
    ALTER TABLE employers
      ADD CONSTRAINT employers_slug_format
      CHECK (slug IS NULL OR slug ~ '^[a-z0-9]{8,32}$');
  END IF;
END $$;

-- Index for monthly usage counts (enforce usage_cap_month, admin billing
-- report). Reuses the existing employer_id column on consultations.
CREATE INDEX IF NOT EXISTS consultations_employer_id_created_idx
  ON consultations (employer_id, created_at DESC)
  WHERE employer_id IS NOT NULL;

COMMIT;
