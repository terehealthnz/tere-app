-- supabase-no-show-migration.sql
--
-- Two-attempt no-show flow for video/phone consults.
--
-- Behaviour (see api/_initiate-call.js, api/_ring-timeout.js, api/_mark-no-show.js):
--   1. Provider clicks Start   → status=in_progress, ring_started_at=now,
--                                join_attempts += 1
--   2. 90s ring window          → if patient hasn't joined, provider (or auto
--                                timeout) calls /api/ring-timeout →
--                                status=cooldown, cooldown_until = now + 5min,
--                                mid_cooldown_reminder_sent_at = null
--   3. During cooldown          → queue shows locked row with countdown; at ~2min
--                                in, provider dashboard polls and calls
--                                /api/ring-timeout?remind=true which fires the
--                                mid-cooldown SMS and stamps
--                                mid_cooldown_reminder_sent_at
--   4. Cooldown ends            → row becomes clickable, provider clicks Start
--                                again → attempt 2 of 2
--   5. If 2nd ring times out    → /api/mark-no-show cancels PI hold, sets
--                                status=no_show, emails patient "no charge"
--
-- All timing decisions live client-side; the DB just carries the audit trail.
--
-- Run once against Supabase.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS join_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS join_attempt_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ring_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS patient_joined_at timestamptz,
  ADD COLUMN IF NOT EXISTS cooldown_until timestamptz,
  ADD COLUMN IF NOT EXISTS mid_cooldown_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS no_show_at timestamptz;

-- Index the cooldown_until so the provider queue can efficiently pick up rows
-- whose cooldown has elapsed and needs the mid-cooldown reminder.
CREATE INDEX IF NOT EXISTS idx_consultations_cooldown_until
  ON consultations (cooldown_until)
  WHERE cooldown_until IS NOT NULL;
