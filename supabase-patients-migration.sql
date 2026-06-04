-- Patient profile system migration
-- Run in Supabase dashboard: https://supabase.com/dashboard/project/xynwqfbnwpkyvovxdone/sql/new

-- ── 1. Patients master table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
  id                          uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Identity
  first_name                  text NOT NULL,
  last_name                   text NOT NULL,
  date_of_birth               date NOT NULL,
  nhi                         text,

  -- Contact
  phone                       text,
  email                       text,
  preferred_language          text DEFAULT 'en',

  -- Healthcare
  pharmacy_name               text,
  pharmacy_address            text,
  gp_name                     text,
  gp_clinic                   text,
  gp_email                    text,

  -- Clinical (updated after each consultation)
  medical_history             text,
  current_medications         text,
  allergies                   text,

  -- Research
  research_consent            boolean DEFAULT false,
  research_consent_updated_at timestamptz,

  -- ACC
  acc_employer                text,
  acc_employer_address        text,

  -- Meta
  first_consultation_at       timestamptz,
  last_consultation_at        timestamptz,
  total_consultations         integer DEFAULT 0,
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now()
);

-- One patient per name + DOB combination (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS patients_identity_idx
  ON patients(LOWER(first_name), LOWER(last_name), date_of_birth);

CREATE INDEX IF NOT EXISTS patients_email_idx  ON patients(email);
CREATE INDEX IF NOT EXISTS patients_phone_idx  ON patients(phone);
CREATE INDEX IF NOT EXISTS patients_nhi_idx    ON patients(nhi);
CREATE INDEX IF NOT EXISTS patients_last_seen_idx ON patients(last_consultation_at DESC);

-- ── 2. RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

-- Service role (backend API) has full access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'patients' AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON patients FOR ALL USING (true);
  END IF;
END$$;

-- ── 3. Link consultations to patients ────────────────────────────────────────
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS patient_id uuid REFERENCES patients(id);

CREATE INDEX IF NOT EXISTS consultations_patient_id_idx
  ON consultations(patient_id);

-- ── 4. Updated-at trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_patients_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patients_updated_at ON patients;
CREATE TRIGGER patients_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION update_patients_updated_at();

-- ── 5. Back-fill patient records from existing consultations ─────────────────
INSERT INTO patients (
  first_name, last_name, date_of_birth,
  phone, email,
  pharmacy_name, gp_name, gp_email, gp_clinic,
  medical_history, current_medications, allergies,
  research_consent,
  first_consultation_at, last_consultation_at, total_consultations
)
SELECT DISTINCT ON (LOWER(patient_first_name), LOWER(patient_last_name), patient_dob)
  patient_first_name,
  patient_last_name,
  patient_dob::date,
  patient_phone,
  patient_email,
  pharmacy,
  gp_name,
  gp_email,
  gp_clinic,
  medical_history,
  medications,
  patient_allergies,
  COALESCE(research_consent, false),
  MIN(created_at) OVER (
    PARTITION BY LOWER(patient_first_name), LOWER(patient_last_name), patient_dob
  ),
  MAX(created_at) OVER (
    PARTITION BY LOWER(patient_first_name), LOWER(patient_last_name), patient_dob
  ),
  COUNT(*) OVER (
    PARTITION BY LOWER(patient_first_name), LOWER(patient_last_name), patient_dob
  )::integer
FROM consultations
WHERE patient_first_name IS NOT NULL
  AND patient_last_name  IS NOT NULL
  AND patient_dob        IS NOT NULL
ORDER BY
  LOWER(patient_first_name),
  LOWER(patient_last_name),
  patient_dob,
  created_at DESC
ON CONFLICT DO NOTHING;

-- ── 6. Link existing consultations to patient records ────────────────────────
UPDATE consultations c
SET patient_id = p.id
FROM patients p
WHERE LOWER(c.patient_first_name) = LOWER(p.first_name)
  AND LOWER(c.patient_last_name)  = LOWER(p.last_name)
  AND c.patient_dob::date         = p.date_of_birth
  AND c.patient_id IS NULL;
