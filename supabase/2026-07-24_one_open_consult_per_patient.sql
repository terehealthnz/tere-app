-- Prevent a patient from having more than one open consultation at a time.
--
-- Motivation: without this, a patient can pay N times and sit in the queue N
-- times to be seen sooner. Providers may accept duplicates before noticing,
-- collect fees for both, and fragment the clinical record.
--
-- Enforcement: partial unique index on (patient_id) where status is any
-- non-terminal value. NULL patient_id rows (early anon triage before patient
-- registration) are unaffected — Postgres treats NULLs as distinct in a
-- unique constraint, so multiple anon-in-flight consults don't collide.
--
-- Prerequisite: pre-existing duplicate open consults must be closed first
-- or the CREATE INDEX will fail. Step 1 handles that (test data only —
-- confirmed with Patrick 2026-07-24, Tere is pre-launch and there are no
-- real patients waiting for care).

BEGIN;

-- Step 1: close every currently-open consult (all test data, pre-launch).
UPDATE consultations
SET status = 'cancelled'
WHERE status NOT IN ('complete', 'cancelled');

-- Step 2: enforce the invariant going forward.
CREATE UNIQUE INDEX IF NOT EXISTS consultations_one_open_per_patient_idx
  ON consultations(patient_id)
  WHERE status NOT IN ('complete', 'cancelled');

COMMIT;
