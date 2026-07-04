-- SpO2 calibration portability — small table that any patient device can pull the
-- current calibration slope/intercept from. Latest row (max created_at) is the
-- calibration in force. Mirrors the pattern used for BP model portability
-- (see supabase/2026-07-04_model_weights.sql).
--
-- Run this in Supabase Studio → SQL editor before deploying spo2.js changes.

CREATE TABLE IF NOT EXISTS spo2_calibrations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slope      numeric NOT NULL,
  intercept  numeric NOT NULL,
  n          integer NOT NULL,
  rmse       numeric,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

-- Anyone can read (patient devices need to pull the calibration to apply it).
-- Only authenticated/service-role should insert (via fitSpO2Calibration on the
-- validation dashboard).
ALTER TABLE spo2_calibrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY spo2_calibrations_read ON spo2_calibrations
  FOR SELECT USING (true);

CREATE POLICY spo2_calibrations_insert ON spo2_calibrations
  FOR INSERT WITH CHECK (true);
