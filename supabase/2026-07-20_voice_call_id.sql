-- Voice provider migration: Twilio → Telnyx (2026-07-20).
--
-- Stores the Telnyx call_control_id for the outbound-to-patient leg. This is
-- the identifier the Telnyx webhook (_telnyx-voice.js) uses to correlate
-- events back to a consultation row.
--
-- We deliberately keep the twilio_call_sid + twilio_call_status columns
-- populated by _make-call.js for now so the existing ConsultView.jsx /
-- ProviderConsult.jsx polling code keeps working without a coordinated
-- frontend release. Drop them in a follow-up migration once the frontend
-- has been repointed at voice_call_id and the twilio_call_status naming is
-- refactored (candidate: 2026-07-XX_drop_twilio_columns.sql).
--
-- Run in Supabase Studio → SQL editor before deploying the api/*.js changes.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS voice_call_id text;

CREATE INDEX IF NOT EXISTS idx_consultations_voice_call_id
  ON consultations(voice_call_id);
