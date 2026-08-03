-- Encounter action tracking + patient presence.
--
-- Powers the new EncounterActionBar (Call / No Answer / Complete Encounter)
-- and the LiveKit-vs-phone auto-routing based on patient online status.
--
-- Run in Supabase Studio → SQL editor. Idempotent.

-- Provider action counters + timestamps
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS call_attempts        integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at      timestamptz,
  ADD COLUMN IF NOT EXISTS no_answer_count      integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS encounter_completed_at timestamptz;

-- Patient presence — updated by /api/patient-heartbeat every ~15s while the
-- patient is on the waiting-room or call screen. The Call button reads this
-- to decide whether to try LiveKit first (fresh <30s) or fall back straight
-- to a phone bridge.
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- Index for the queue-view "which patients are online right now" query.
CREATE INDEX IF NOT EXISTS consultations_last_seen_at_idx
  ON consultations (last_seen_at DESC)
  WHERE last_seen_at IS NOT NULL;
