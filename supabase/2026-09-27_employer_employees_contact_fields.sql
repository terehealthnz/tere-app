-- Add contact + identity fields to employer_employees so barge/marine
-- companies can pre-populate the full roster in one CSV upload (name, DOB,
-- address, phone, email, NHI).
--
-- Roster fields are for pre-fill + eligibility only. Consent for the
-- employer disclosing these details is captured out-of-band (employer's HR
-- agreement with the worker) and the patient re-confirms at triage before
-- any clinical data is collected. `nhi` here is used to prime the NHI
-- lookup / de-dup check on first booking — it's not authoritative until
-- verified via /api/nhi-lookup.
--
-- Idempotent — safe to re-run.

BEGIN;

ALTER TABLE employer_employees
  ADD COLUMN IF NOT EXISTS email   text,
  ADD COLUMN IF NOT EXISTS phone   text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS nhi     text;

-- Loose format guard on NHI: 7 chars, letters + digits, uppercase. The full
-- Mod-11 check is done in application code (nhiValidator) — this is just
-- to keep obviously malformed values out of the roster.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employer_employees_nhi_format'
  ) THEN
    ALTER TABLE employer_employees
      ADD CONSTRAINT employer_employees_nhi_format
      CHECK (nhi IS NULL OR nhi ~ '^[A-Z0-9]{7}$');
  END IF;
END $$;

COMMIT;
