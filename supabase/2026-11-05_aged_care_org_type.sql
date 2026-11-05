-- Aged residential care (ARC / rest home) support — Step 1 of the ARC
-- feature build. Extends the existing employer plumbing with an org_type
-- discriminator + ARC-specific fields rather than forking a parallel
-- `facilities` table.
--
-- Why this shape:
--   - 95% of the plumbing (roster CSV upload, /work/[slug] intake,
--     server-side employer_paid verification, admin management UI) applies
--     unchanged. Reusing it keeps one code path instead of two.
--   - ARC pricing differs: employer_paid flat $X/consult vs ARC per-consult
--     at public rates ($65 eval / $25 ACC), billed monthly. Handled in the
--     pricing layer via a new fee_tier='resident' value, not the DB.
--   - EPOA (Enduring Power of Attorney) is universal in ARC — captured
--     per-resident on the roster CSV so it surfaces at consent + prescribe
--     time without the facility nurse having to look it up mid-consult.
--   - "Calling on behalf of" is the common ARC pattern (nurse holding the
--     phone for a dementia resident), captured per-consultation not
--     per-roster because the caller can change by shift.
--
-- Idempotent — safe to re-run.

BEGIN;

-- 1. Org type on the facility/employer record.
-- Default 'employer' preserves behaviour for every existing row.
ALTER TABLE employers
  ADD COLUMN IF NOT EXISTS org_type text NOT NULL DEFAULT 'employer';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employers_org_type_check'
  ) THEN
    ALTER TABLE employers
      ADD CONSTRAINT employers_org_type_check
      CHECK (org_type IN ('employer', 'aged_care'));
  END IF;
END $$;

-- Billing contact distinct from the operational contact. ARC facilities
-- often have accounts in Christchurch while the home itself is in rural
-- Marlborough — monthly invoices need to go to the right inbox.
ALTER TABLE employers
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS billing_contact_name text;

-- 2. EPOA fields on the roster. NULL for employer rows, populated for ARC
-- residents. We capture name + phone as the bare minimum for a facility
-- nurse to reach the EPOA before a prescribing decision; email is
-- optional (many EPOAs are older and don't check email).
ALTER TABLE employer_employees
  ADD COLUMN IF NOT EXISTS epoa_name  text,
  ADD COLUMN IF NOT EXISTS epoa_phone text,
  ADD COLUMN IF NOT EXISTS epoa_email text,
  ADD COLUMN IF NOT EXISTS room_number text;

-- 3. "Calling on behalf of" captured per-consultation. Who held the phone
-- is a clinical and medico-legal fact — a prescribing decision made on
-- info relayed by an RN differs from one made from the patient's own
-- mouth, and the chart should reflect that.
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS calling_on_behalf_name text,
  ADD COLUMN IF NOT EXISTS calling_on_behalf_role text;

-- Keep the role tight so we can filter / audit on it cleanly.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'consultations_calling_on_behalf_role_check'
  ) THEN
    ALTER TABLE consultations
      ADD CONSTRAINT consultations_calling_on_behalf_role_check
      CHECK (
        calling_on_behalf_role IS NULL
        OR calling_on_behalf_role IN ('rn', 'hca', 'family', 'other')
      );
  END IF;
END $$;

-- Index for admin's per-facility tally graph and the monthly invoice
-- cron, both of which scan WHERE employer_id = X AND status = 'complete'
-- AND completed_at BETWEEN month-start AND month-end.
CREATE INDEX IF NOT EXISTS idx_consultations_employer_id_completed
  ON consultations (employer_id, completed_at)
  WHERE status = 'complete';

COMMENT ON COLUMN employers.org_type IS
  'Discriminator between B2B employer (flat rate) and aged residential care (per-consult monthly invoice). Default employer preserves existing rows.';
COMMENT ON COLUMN consultations.calling_on_behalf_name IS
  'For ARC consults: name of the staff member / family holding the phone. NULL for direct patient consults.';

COMMIT;
