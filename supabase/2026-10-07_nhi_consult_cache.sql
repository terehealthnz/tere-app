-- 2026-10-07  NHI consult cache
-- Stores the HNZ-authoritative Patient snapshot alongside each consult so the
-- clinician UI can show (a) a stale banner when the cached copy is older than
-- STALE_THRESHOLD, (b) a mismatch banner when stored demographics drift from
-- HNZ, and (c) a deceased block on prescribe/referral.
--
-- Addresses Noel Babu's 2026-10-07 compliance review feedback on IN-3589:
--   NHI-GET-8  — show clinician when NHI record changed since cached
--   Clinician  — deceased check before prescribe/referral; mismatch flag

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS patient_nhi_data         jsonb,
  ADD COLUMN IF NOT EXISTS patient_nhi_fetched_at   timestamptz;

COMMENT ON COLUMN consultations.patient_nhi_data IS
  'HNZ NHI Patient snapshot at last refresh: {name, dob, gender, deceased, deceasedDateTime, address_parts, source_nhi}. Null if NHI never fetched for this consult. Compared against patient_* fields on the row to drive the mismatch banner.';

COMMENT ON COLUMN consultations.patient_nhi_fetched_at IS
  'Wall-clock time of the last successful NHI refresh for this consult. UI considers the cache stale after 24h and auto-refreshes on consult open.';
