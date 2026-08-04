-- Structured patient history — replaces the free-text
--   patients.allergies / patients.current_medications / patients.medical_history
-- fields with proper row-per-item tables. Free-text columns are LEFT INTACT
-- so nothing breaks during the transition — the UI renders both, and a
-- follow-up migration can drop the free-text columns once every row has
-- been reviewed and either structured-out or explicitly kept as a legacy
-- note.
--
-- Provider-only writes (via /api/patient-allergens, /api/patient-medications,
-- /api/patient-conditions). RLS enabled; all access flows through service_role
-- endpoints that call guardProvider.

-- 1. Allergies -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_allergens (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  allergen          text NOT NULL,             -- 'Amoxicillin', 'Penicillin', 'Peanuts'
  allergen_type     text,                       -- 'drug' | 'food' | 'environmental' | 'other'
  reaction          text,                       -- 'Rash', 'Anaphylaxis', 'GI upset'
  reaction_severity text,                       -- 'mild' | 'moderate' | 'severe' | 'life_threatening'
  onset_date        date,                       -- when the allergy was identified
  notes             text,                       -- free-form provider notes
  is_active         boolean NOT NULL DEFAULT true,
  created_by        uuid REFERENCES providers(id) ON DELETE SET NULL,
  created_by_name   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patient_allergens_patient_idx
  ON patient_allergens (patient_id) WHERE is_active = true;

-- Case-insensitive lookup for the prescribing safety cross-check
-- (checkDrugAgainstAllergens in the Prescribe modal).
CREATE INDEX IF NOT EXISTS patient_allergens_allergen_ci_idx
  ON patient_allergens (patient_id, lower(allergen)) WHERE is_active = true;

ALTER TABLE patient_allergens ENABLE ROW LEVEL SECURITY;

-- 2. Current medications ------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_medications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  drug              text NOT NULL,              -- 'Losartan', 'Atorvastatin'
  dose              text,                       -- '50mg', '20mg'
  frequency         text,                       -- 'mane', 'nocte', 'BD', 'TDS PRN'
  route             text,                       -- 'oral', 'topical', 'sc', 'inhaled'
  indication        text,                       -- 'Hypertension', 'Cholesterol'
  started_date      date,
  prescribed_by     text,                       -- 'Dr Bloggs, Nelson GP'
  is_active         boolean NOT NULL DEFAULT true,
  discontinued_date date,                       -- null while active
  discontinued_reason text,
  notes             text,
  created_by        uuid REFERENCES providers(id) ON DELETE SET NULL,
  created_by_name   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patient_medications_patient_idx
  ON patient_medications (patient_id) WHERE is_active = true;

ALTER TABLE patient_medications ENABLE ROW LEVEL SECURITY;

-- 3. Medical conditions --------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_conditions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  condition         text NOT NULL,              -- 'Type 2 Diabetes', 'Hypertension'
  icd10_code        text,                       -- 'E11.9', 'I10' (optional coding)
  status            text NOT NULL DEFAULT 'active',
                    -- 'active' | 'resolved' | 'in_remission' | 'suspected'
  onset_date        date,                       -- when diagnosed
  resolved_date     date,                       -- null if still active
  notes             text,
  created_by        uuid REFERENCES providers(id) ON DELETE SET NULL,
  created_by_name   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_conditions_status_check
    CHECK (status IN ('active','resolved','in_remission','suspected'))
);

CREATE INDEX IF NOT EXISTS patient_conditions_patient_idx
  ON patient_conditions (patient_id, status);

ALTER TABLE patient_conditions ENABLE ROW LEVEL SECURITY;

-- Comments for future maintainers
COMMENT ON TABLE patient_allergens IS
  'Structured allergens per patient. Cross-checked at prescribing time. Prefer this over patients.allergies free-text.';
COMMENT ON TABLE patient_medications IS
  'Structured current medications per patient. Prefer this over patients.current_medications free-text.';
COMMENT ON TABLE patient_conditions IS
  'Structured PMH conditions per patient with ICD-10 coding + resolution tracking. Prefer this over patients.medical_history free-text.';
