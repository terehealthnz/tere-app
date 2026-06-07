-- Add temperature + ambient temp to validation_readings
ALTER TABLE validation_readings
  ADD COLUMN IF NOT EXISTS manual_temperature NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS ambient_temp       NUMERIC(5,1);

-- No schema change needed for consultations.vitals — JSONB accepts any fields,
-- including the new 'temperature' and 'ambientTemp' keys stored by VitalsCapture.
