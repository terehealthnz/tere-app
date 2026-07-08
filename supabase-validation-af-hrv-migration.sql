-- Add HRV, AF screening, and SpO2 columns to validation_readings
ALTER TABLE validation_readings
  ADD COLUMN IF NOT EXISTS hrv_sdnn       NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS hrv_rmssd      NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS hrv_pnn50      NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS af_score       NUMERIC(5,3),
  ADD COLUMN IF NOT EXISTS af_likelihood  TEXT,
  ADD COLUMN IF NOT EXISTS af_confirmed   BOOLEAN,
  ADD COLUMN IF NOT EXISTS af_confirmed_by TEXT,
  ADD COLUMN IF NOT EXISTS manual_spo2    SMALLINT,
  ADD COLUMN IF NOT EXISTS tere_spo2      SMALLINT,
  ADD COLUMN IF NOT EXISTS spo2_error     SMALLINT;
