-- Research & consent data migration
-- Run in Supabase dashboard: https://supabase.com/dashboard/project/xynwqfbnwpkyvovxdone/sql/new

-- ── Consents table (ensure it exists with correct shape) ─────────────────────
CREATE TABLE IF NOT EXISTS consents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid,
  consent_type    text NOT NULL,
  granted         boolean NOT NULL DEFAULT true,
  patient_name    text,
  ip_address      text,
  timestamp       timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

-- Add missing columns if not present
ALTER TABLE consents
  ADD COLUMN IF NOT EXISTS timestamp    timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS patient_name text,
  ADD COLUMN IF NOT EXISTS ip_address   text;

CREATE INDEX IF NOT EXISTS consents_consultation_id_idx ON consents (consultation_id);
CREATE INDEX IF NOT EXISTS consents_type_idx ON consents (consent_type);

-- ── Pre-triage consultation support ─────────────────────────────────────────
-- 'pre_triage' is a valid status — created at TereIntro, upgraded in AITriage
-- No schema change needed; status column is already text

-- ── Research and consent timestamp columns on consultations ─────────────────
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS hdc_consent_at           timestamptz,
  ADD COLUMN IF NOT EXISTS prescribing_consent_at   timestamptz,

-- ── Research demographics ─────────────────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS patient_age_band         text,
  ADD COLUMN IF NOT EXISTS patient_region           text,
  ADD COLUMN IF NOT EXISTS patient_employment_sector text,

-- ── Research clinical ────────────────────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS complaint_category       text,
  ADD COLUMN IF NOT EXISTS consultation_month       text,

-- ── Research outcomes ────────────────────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS prescription_issued      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS prescription_drug_class  text,
  ADD COLUMN IF NOT EXISTS referral_issued          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS referral_type            text,

-- ── Research platform ────────────────────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS device_type              text,
  ADD COLUMN IF NOT EXISTS language_selected        text,
  ADD COLUMN IF NOT EXISTS vitals_completed         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tere_scribe_used         boolean DEFAULT false;

-- Ensure research_consent exists
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS research_consent         boolean DEFAULT false;

-- ── Back-fill consultation_month for existing complete records ────────────────
UPDATE consultations
  SET consultation_month = TO_CHAR(created_at, 'YYYY-MM')
  WHERE consultation_month IS NULL
  AND created_at IS NOT NULL;

-- ── De-identified research export view ───────────────────────────────────────
CREATE OR REPLACE VIEW research_data_export AS
SELECT
  CONCAT('TERE-', LEFT(id::text, 8))                                   AS research_id,
  patient_age_band,
  patient_region,
  patient_employment_sector,
  consultation_type,
  acc_eligible,
  complaint_category,
  work_capacity,
  prescription_issued,
  prescription_drug_class,
  referral_issued,
  referral_type,
  icd10_code,
  acc_read_code,
  consultation_month,
  ROUND(consultation_duration_seconds / 60.0, 1)                       AS duration_minutes,
  device_type,
  language_selected,
  vitals_completed,
  tere_scribe_used
FROM consultations
WHERE research_consent = true
  AND (status = 'complete' OR notes_finalised_at IS NOT NULL);

-- Privacy assertion: this view must NEVER contain PII.
-- Verified: patient_first_name, patient_last_name, patient_dob, patient_phone,
--           patient_email, patient_nhi, patient_address, gp_name, gp_email,
--           provider_display_name are all excluded.
