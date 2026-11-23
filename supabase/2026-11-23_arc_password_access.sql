-- ARC Enliven build v1 — password-gated /arc/[slug] entry for Kōwhainui Home.
--
-- Extends the existing employers table (supabase/2026-11-05_aged_care_org_type.sql
-- added org_type='aged_care' + the /work/[slug] slug column from
-- 2026-09-19_employer_slug_url_access.sql) with the two new fields the
-- Enliven MOU flow needs:
--
--   1. access_password_hash — bcrypt hash of a shared facility password.
--      Why a password instead of an Excel roster: ARC respite turns over too
--      fast (sometimes multiple residents per week) to keep a roster upload
--      in sync. The nurse enters the resident's details on the fly;
--      authorisation is the shared facility password, not roster membership.
--
--   2. billing_cadence — 'monthly_cumulative' for ARC, NULL for legacy
--      per-consult employer billing. Drives the invoice-aggregation cron
--      (future migration).
--
-- Also seeds the Kōwhainui Home row (if not already present) with:
--   slug='kowhainui', password='Enliven' (bcrypt-hashed below), org_type
--   ='aged_care', billing_cadence='monthly_cumulative'.
--
-- Known v1 gap (deferred to v2): server-side enforcement that someone who
-- knows the slug can't skip /arc/[slug] and go straight to /work/kowhainui.
-- v1 treats the password as a UX gate; audit-log + invoice reconciliation
-- catch anomalies. v2 adds token-signed access via /api/arc-access.
--
-- Idempotent — safe to re-run.

BEGIN;

ALTER TABLE employers
  ADD COLUMN IF NOT EXISTS access_password_hash text,
  ADD COLUMN IF NOT EXISTS billing_cadence      text;

-- billing_cadence allowed values. Null means "no special billing";
-- existing per-consult employer rows stay NULL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employers_billing_cadence_check'
  ) THEN
    ALTER TABLE employers
      ADD CONSTRAINT employers_billing_cadence_check
      CHECK (billing_cadence IS NULL OR billing_cadence IN ('monthly_cumulative'));
  END IF;
END $$;

COMMENT ON COLUMN employers.access_password_hash IS
  'bcrypt hash of the shared /arc/[slug] facility password (ARC flow only). Legacy /work/[slug] employer rows leave NULL.';
COMMENT ON COLUMN employers.billing_cadence IS
  'monthly_cumulative for ARC facilities invoiced monthly in aggregate; NULL for per-consult employer billing.';

-- Seed Kōwhainui Home (Enliven / Presbyterian Support Central). Password
-- below is the bcrypt hash of the plaintext 'Enliven'. Generated with
-- bcrypt cost 10. Replace via admin UI (future) if the password is ever
-- rotated.
--
-- bcrypt('Enliven', 10) was generated locally with bcryptjs; a fresh hash
-- is written in the INSERT below. Each run of bcrypt produces a different
-- hash — verify match by running bcrypt.compareSync('Enliven', <hash>) in
-- Node, not by string compare.
--
-- Idempotent upsert via DO block. The partial unique index on employers.slug
-- (WHERE slug IS NOT NULL from 2026-09-19_employer_slug_url_access.sql) makes
-- the ON CONFLICT (slug) ... WHERE ... syntax brittle across Postgres versions
-- in the Supabase SQL editor. Explicit IF EXISTS check sidesteps that.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM employers WHERE slug = 'kowhainui') THEN
    UPDATE employers SET
      company_name         = 'Kōwhainui Home (Enliven, Presbyterian Support Central)',
      org_type             = 'aged_care',
      access_password_hash = '$2b$10$Eu0bqVUi5AklODGs1dCuQOkIvgoGKtQ8u4tv0MML6a2aCFRnMhzL2',
      billing_cadence      = 'monthly_cumulative',
      is_active            = true
    WHERE slug = 'kowhainui';
  ELSE
    INSERT INTO employers (
      slug, company_name, org_type, is_active,
      access_password_hash, billing_cadence,
      usage_cap_month, require_employee_match
    ) VALUES (
      'kowhainui',
      'Kōwhainui Home (Enliven, Presbyterian Support Central)',
      'aged_care',
      true,
      '$2b$10$Eu0bqVUi5AklODGs1dCuQOkIvgoGKtQ8u4tv0MML6a2aCFRnMhzL2',
      'monthly_cumulative',
      NULL,  -- no usage cap; ARC residents consult as clinically needed
      false  -- no roster-match required; password is the gate
    );
  END IF;
END $$;

COMMIT;
