-- Prescriptions and radiology referrals tracking
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/xynwqfbnwpkyvovxdone/sql

-- 1. Prescriptions table
CREATE TABLE IF NOT EXISTS prescriptions (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  consultation_id     uuid        REFERENCES consultations(id) ON DELETE SET NULL,
  provider_id         uuid        REFERENCES providers(id) ON DELETE SET NULL,
  provider_name       text,
  prescriber_number   text,
  patient_name        text        NOT NULL,
  patient_nhi         text,
  patient_dob         text,
  patient_email       text,
  drug                text        NOT NULL,
  dose                text,
  directions          text,
  quantity            text,
  repeats             integer     DEFAULT 0,
  pharmacy_name       text,
  pharmacy_hpi_id     text,
  pharmacy_email      text,
  pharmacy_phone      text,
  pharmacy_address    text,
  prescription_number text,
  delivery_status     text        DEFAULT 'sent',
  delivery_error      text,
  created_at          timestamptz DEFAULT now()
);

-- 2. Radiology referrals table
CREATE TABLE IF NOT EXISTS radiology_referrals (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  consultation_id     uuid        REFERENCES consultations(id) ON DELETE SET NULL,
  provider_id         uuid        REFERENCES providers(id) ON DELETE SET NULL,
  provider_name       text,
  provider_cpn        text,
  patient_name        text        NOT NULL,
  patient_nhi         text,
  patient_dob         text,
  patient_email       text,
  investigation       text        NOT NULL,
  body_part           text,
  clinical_indication text,
  urgency             text,
  history             text,
  acc_claim_number    text,
  facility_name       text,
  facility_hpi_id     text,
  facility_email      text,
  facility_phone      text,
  facility_address    text,
  referral_number     text,
  referral_status     text        DEFAULT 'sent',
  result_received_at  timestamptz,
  result_notes        text,
  delivery_status     text        DEFAULT 'sent',
  delivery_error      text,
  created_at          timestamptz DEFAULT now()
);

-- 3. Add prescriber_number to providers (for prescription PDFs)
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS prescriber_number text,
  ADD COLUMN IF NOT EXISTS cpn               text;

CREATE INDEX IF NOT EXISTS prescriptions_provider_idx      ON prescriptions (provider_id, created_at);
CREATE INDEX IF NOT EXISTS prescriptions_consult_idx       ON prescriptions (consultation_id);
CREATE INDEX IF NOT EXISTS radiology_referrals_provider_idx ON radiology_referrals (provider_id, created_at);
CREATE INDEX IF NOT EXISTS radiology_referrals_status_idx  ON radiology_referrals (referral_status);
