-- Add home address column to patients table.
--
-- Captured in triage (see AITriage.jsx 'address' step) and shown to the
-- provider so they can post physical mail (referrals, med certs) and so
-- ACC/insurance forms have a legal address on file. Consultations table
-- already has patient_address (added 2026-08-17_rhcnz_referral_fields);
-- this migration mirrors it on the patient row so returning-patient
-- flows pre-fill from prior visits.
--
-- Idempotent — safe to re-run.

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS address text;

COMMENT ON COLUMN public.patients.address IS
  'Home address (street + suburb + city + postcode as free text). Captured in triage. Used for referral / med-cert postal delivery, ACC forms, and insurance receipts.';
