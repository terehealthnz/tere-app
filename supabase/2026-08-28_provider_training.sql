-- Sandbox training tracking on providers.
--
-- New providers land with patient_access_from = NULL (blocked from real
-- patient queue). They must complete 4 training tasks against practice-mode
-- (is_practice=true) patients:
--   1. take_consult     — join a fake consult end-to-end (mark it in_progress)
--   2. write_rx         — create a fake prescription
--   3. complete_note    — complete a fake consult (status=completed)
--   4. send_referral    — send a fake RHCNZ referral
--
-- The server auto-ticks each key when the corresponding action fires against
-- a practice-mode resource by a provider whose training_completed_at is null.
-- Once all four keys have timestamps, training_completed_at is set and admin
-- gets notified to flip patient_access_from.
--
-- training_tasks jsonb shape:
--   {
--     "take_consult":   "2026-08-28T10:00:00Z" | null,
--     "write_rx":       "2026-08-28T10:12:00Z" | null,
--     "complete_note":  "2026-08-28T10:30:00Z" | null,
--     "send_referral":  null
--   }

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS training_tasks jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS training_completed_at timestamptz;

-- Partial index for the "who is currently training" query.
CREATE INDEX IF NOT EXISTS providers_training_incomplete_idx
  ON providers (id)
  WHERE training_completed_at IS NULL AND is_active = true;

COMMENT ON COLUMN providers.training_tasks IS
  'Sandbox training progress: keys take_consult/write_rx/complete_note/send_referral → ISO timestamp when auto-ticked, or missing/null if not done.';
COMMENT ON COLUMN providers.training_completed_at IS
  'Timestamp all 4 training tasks were done. Admin should flip patient_access_from after this to unlock real patients.';
