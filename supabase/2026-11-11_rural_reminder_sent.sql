-- Reminder-sent-at column for the PHO rural GP SMS reminder cron.
-- Null = not yet sent; non-null = sent at this time (also our dedup
-- guard so the cron can't double-send on a restart).

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS consultations_reminder_window_idx
  ON consultations (scheduled_for)
  WHERE booking_type = 'scheduled' AND reminder_sent_at IS NULL;
