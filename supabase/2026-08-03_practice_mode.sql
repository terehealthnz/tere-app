-- Practice mode groundwork.
--
-- Purpose: let new hires walk through pre-seeded fake patients without any
-- risk of touching real patient data. Also gives Tere a safe channel to
-- test new features against realistic-shaped data before pushing to a full
-- staging environment.
--
-- Design:
--   1. is_practice boolean on the top-level PHI-carrying tables. Real rows
--      default false; seeded practice rows are flagged true.
--   2. Every provider queue / analytics query MUST filter is_practice=false
--      (or ={the user's mode}). Migration below only adds the column; the
--      app-side filter changes come in follow-up commits.
--   3. Practice rows are visible to all providers who toggle "Practice mode"
--      on. No RLS complexity — the app-side filter is the security boundary.
--   4. Delete cascade nothing: a provider clicking "reset practice" runs a
--      DELETE ... WHERE is_practice = true. Safe because real rows are
--      always false.
--
-- Safe to run repeatedly. All ADD COLUMN calls use IF NOT EXISTS.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS is_practice boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS consultations_is_practice_idx
  ON consultations (is_practice)
  WHERE is_practice = true;

-- patients table carries the shared demographic + medical history. Practice
-- patients should be similarly flagged so the patient-lookup path doesn't
-- accidentally return a fake NHI as a real one.
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS is_practice boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS patients_is_practice_idx
  ON patients (is_practice)
  WHERE is_practice = true;

-- Notes: prescriptions, radiology_referrals, acc_claims, messages inherit
-- the practice flag via their consultation_id / patient_id FK — the app can
-- infer them by JOIN rather than duplicating the column. Only add the flag
-- to those tables if we later find query patterns that need the filter
-- WITHOUT a JOIN.

-- Convenience view: real-only consultations. Any query that wants to be
-- absolutely certain it's not touching practice data can select from here
-- instead of consultations. Not a security boundary — the RLS layer still
-- allows both — but a clear escape hatch for reporting / analytics code.
CREATE OR REPLACE VIEW consultations_real AS
  SELECT * FROM consultations WHERE is_practice = false;

COMMENT ON COLUMN consultations.is_practice IS
  'Practice-mode fake consult. Real queries must filter is_practice=false. '
  'True rows are safe to bulk-delete via "reset practice" without touching real data.';

COMMENT ON COLUMN patients.is_practice IS
  'Practice-mode fake patient. See is_practice on consultations for the design rationale.';
