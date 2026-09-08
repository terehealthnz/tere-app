-- Paediatric weight capture (ages 2-14) for weight-based dosing.
-- Trigger: intake now asks for weight when DOB puts age 2-14. Value flows
-- to the provider's Prescribe modal and auto-populates the paediatric
-- dose calculator (Aroha 22 kg + paracetamol → 330 mg = 6.6 mL of
-- 250 mg/5 mL suspension).
--
-- Two homes for weight: on the consultation (this-visit reading) AND on
-- the patient (persisted for future visits with a measured_at timestamp
-- so we can prompt for a fresh weight if it's stale).

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS patient_weight_kg  numeric(5,2);

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS weight_kg              numeric(5,2),
  ADD COLUMN IF NOT EXISTS weight_kg_measured_at  timestamptz;

-- No index — weight is only read as part of the patient record or the
-- consultation record, both already keyed by PK.
