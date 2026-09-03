-- Add patient_address to consultations (HOTFIX).
--
-- AITriage.jsx has been sending patient_address to /api/create-consultation
-- for weeks; the column was assumed to exist per the 2026-08-24_patients_address.sql
-- comment ("Consultations table already has patient_address") but that
-- assumption was incorrect — the 2026-08-17_rhcnz_referral_fields.sql
-- migration only added patient_address to `radiology_referrals`, not to
-- `consultations`.
--
-- Result: /api/create-consultation returned 500 whenever AITriage submitted
-- a payload containing patient_address (which it always does). Caught by
-- E2E smoke 2026-09-03 after the day's clinical-safety migrations.
--
-- Idempotent — safe to re-run.

ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS patient_address text;

COMMENT ON COLUMN public.consultations.patient_address IS
  'Home address (free text) captured at triage. Duplicated on the patient
   row via 2026-08-24_patients_address.sql for returning-patient prefill.
   Used by referral / med-cert postal delivery, ACC forms, insurance
   receipts.';
