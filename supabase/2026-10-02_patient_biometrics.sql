-- Add patient sex / weight / height columns to consultations. Collected via a
-- new AI triage step and threaded into VitalsCapture's subject object so
-- predictBP() has varying demographic features per patient (fix for the
-- mean-collapse symptom where the live /vitals BP always read ~121/79
-- because the subject={} empty argument meant all 5 demographic features
-- fell to population-default constants).

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS patient_sex TEXT,
  ADD COLUMN IF NOT EXISTS patient_weight_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS patient_height_cm NUMERIC;

ALTER TABLE consultations
  ADD CONSTRAINT consultations_patient_sex_chk
  CHECK (patient_sex IS NULL OR patient_sex IN ('male','female','other','prefer_not_to_say'));

ALTER TABLE consultations
  ADD CONSTRAINT consultations_patient_weight_kg_chk
  CHECK (patient_weight_kg IS NULL OR (patient_weight_kg > 20 AND patient_weight_kg < 400));

ALTER TABLE consultations
  ADD CONSTRAINT consultations_patient_height_cm_chk
  CHECK (patient_height_cm IS NULL OR (patient_height_cm > 50 AND patient_height_cm < 250));
