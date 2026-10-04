-- 2026-10-03 — ME-rPPG DL comparison track on validation_readings
-- Adds a parallel HR estimate from the ME-rPPG model (arxiv 2504.01774,
-- Health-HCI-Group/ME-rPPG-demo, Apache-2.0) that runs in-browser alongside
-- the classical pipeline during /vitals-validate scans. Classical baseline
-- stays in tere_hr; this column records the DL prediction so we can score
-- DL-vs-baseline on paired manual_hr ground truth without disrupting any
-- existing dashboard or export that already reads tere_hr.
--
-- Rollback: DROP COLUMN me_rppg_hr, me_rppg_confidence, me_rppg_mean_err FROM validation_readings;

ALTER TABLE validation_readings
  ADD COLUMN IF NOT EXISTS me_rppg_hr          integer,
  ADD COLUMN IF NOT EXISTS me_rppg_confidence  text,
  ADD COLUMN IF NOT EXISTS me_rppg_mean_err    numeric;

COMMENT ON COLUMN validation_readings.me_rppg_hr IS
  'HR (bpm) estimated by ME-rPPG DL model (arxiv 2504.01774). Null if the DL track did not warm up (needs ~10s of face frames) or failed.';
COMMENT ON COLUMN validation_readings.me_rppg_confidence IS
  'ME-rPPG self-reported confidence: high / medium / low. Based on Kalman-smoothed HR mean error over the scan.';
COMMENT ON COLUMN validation_readings.me_rppg_mean_err IS
  'Raw Kalman-smoothed HR mean error ratio from ME-rPPG — <0.025 is high confidence, <0.05 medium.';
