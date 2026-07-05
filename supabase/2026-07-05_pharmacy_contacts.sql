-- Fax-based prescription delivery: capture fax + crowd-sourced dispensary contact
-- details against the stable Medsafe register id (see build_pharmacy_list.py).
-- Run in Supabase Studio → SQL editor, each statement on its own click if the
-- editor complains about multi-statement batches (previous migrations have).

-- 1. Consultation-level fax destination for this specific prescription
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS pharmacy_fax text;

-- 1b. Prescription-level fields so the audit trail records how the script went out
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS pharmacy_id text;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS pharmacy_fax text;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS delivery_channel text;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS fax_provider_id text;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS fax_status text;

-- 2. Crowd-sourced contact directory keyed by Medsafe register slug so contact
--    details entered by one provider are available to the next.
CREATE TABLE IF NOT EXISTS pharmacy_contacts (
  pharmacy_id       text PRIMARY KEY,
  premises_name     text,
  fax               text,
  dispensary_email  text,
  phone             text,
  hpi_id            text,
  contributed_by    uuid,
  verified_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT NOW(),
  updated_at        timestamptz NOT NULL DEFAULT NOW()
);
