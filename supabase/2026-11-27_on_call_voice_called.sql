-- Atomic claim marker for the ARC overnight wake-up phone call. Mirror of
-- on_call_sms_sent_at (supabase/2026-10-25_on_call_sms_dedup.sql) but for
-- the Telnyx voice-call path. Separate column so a consult can have its
-- SMS fired independently of its wake-up call being fired, and so the
-- 2-min cron sweep can re-dial even after the one-shot SMS has been sent.

ALTER TABLE consultations ADD COLUMN IF NOT EXISTS on_call_voice_called_at timestamptz;
