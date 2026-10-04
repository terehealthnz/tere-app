-- 2026-10-04 — Dual-ROI Pulse Transit Time (PTT) data capture on validation_readings
-- Based on Qiu et al., ICMI '25 (DOI 10.1145/3716553.3750789). During a
-- /vitals-validate scan the patient holds their palm up next to their face;
-- we measure the time delay between pulse arrival at forehead vs palm. 1/PTT
-- linearly correlates with systolic BP via the Moens-Korteweg equation. Phase 1
-- captures the raw data only — regression against cuff SBP will be fitted
-- client-side on the dashboard once we have 20-30 paired readings.
--
-- Rollback: DROP COLUMN palm_ptt_ms, palm_ptt_std_ms, palm_ptt_order,
--   palm_ptt_beats, palm_detect_rate FROM validation_readings;

ALTER TABLE validation_readings
  ADD COLUMN IF NOT EXISTS palm_ptt_ms       numeric,
  ADD COLUMN IF NOT EXISTS palm_ptt_std_ms   numeric,
  ADD COLUMN IF NOT EXISTS palm_ptt_order    text,
  ADD COLUMN IF NOT EXISTS palm_ptt_beats    integer,
  ADD COLUMN IF NOT EXISTS palm_detect_rate  numeric;

COMMENT ON COLUMN validation_readings.palm_ptt_ms IS
  'Mean absolute pulse-transit-time delay (ms) between forehead green pulse and palm green pulse, from beat-matched peak detection over the 15 sec scan. Null if palm was not visible for enough frames.';
COMMENT ON COLUMN validation_readings.palm_ptt_std_ms IS
  'Std dev of the per-beat PTT delays (ms). Low = consistent timing, high = unreliable beat matching.';
COMMENT ON COLUMN validation_readings.palm_ptt_order IS
  'Direction of pulse arrival: face_first (expected, shorter arterial path), palm_first (vascular compliance mismatch), or mixed.';
COMMENT ON COLUMN validation_readings.palm_ptt_beats IS
  'Number of beat pairs successfully matched between forehead and palm within ±200 ms window.';
COMMENT ON COLUMN validation_readings.palm_detect_rate IS
  'Fraction of scan frames in which a palm was detected (0.0-1.0). <0.3 = patient did not consistently show palm.';
