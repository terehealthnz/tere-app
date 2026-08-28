-- Interview slot-picker + reminders (2026-08-28).
--
-- Adds:
--   proposed_slots        jsonb  — ["2026-09-02T10:00:00+12:00", ...]
--                                  populated when interviewer proposes N times
--                                  for the applicant to pick from
--   duration_minutes      int    — default 30, used for the .ics event DTEND
--   reminder_24h_sent_at  ts     — set by _cron-interview-reminders once we've
--                                  sent the T-24h reminder to both sides
--
-- status lifecycle now:
--   proposed  → applicant hasn't picked yet
--   scheduled → applicant picked a slot (existing)
--   instant   → sent as "join now" (existing)
--   in_progress / completed / cancelled / no_show (existing)

ALTER TABLE job_interviews
  ADD COLUMN IF NOT EXISTS proposed_slots       jsonb,
  ADD COLUMN IF NOT EXISTS duration_minutes     integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz;

-- Index for the reminder cron. Only rows we care about (upcoming, un-sent)
-- so the index stays tiny.
CREATE INDEX IF NOT EXISTS idx_job_interviews_reminder_due
  ON job_interviews (scheduled_at)
  WHERE reminder_24h_sent_at IS NULL AND scheduled_at IS NOT NULL;

-- Widen the status check if there's one (defensive — original migration may
-- have used a text column without a CHECK constraint).
DO $$ BEGIN
  ALTER TABLE job_interviews DROP CONSTRAINT IF EXISTS job_interviews_status_check;
  ALTER TABLE job_interviews ADD CONSTRAINT job_interviews_status_check
    CHECK (status IN ('proposed','scheduled','instant','in_progress','completed','cancelled','no_show'));
EXCEPTION WHEN OTHERS THEN
  -- If the constraint didn't exist and add fails for any reason, silently
  -- proceed — the column stays free-text and the app layer enforces values.
  NULL;
END $$;
