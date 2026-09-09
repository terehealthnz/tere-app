-- Chime SMA outbound-dial audit columns on consultations.
--
-- Set by api/_chime-dial.js after a successful
-- CreateSipMediaApplicationCall. Cleared by cron or manually if we want to
-- allow a retry; not part of RLS scope (audit-only, provider-owned row).
--
-- chime_pstn_call_id   — Chime-assigned TransactionId for the outbound leg.
--                        Matches CloudWatch logs for lambda/chime-sma.
-- chime_pstn_dialed_at — server timestamp of the CreateSipMediaApplicationCall
--                        (not the answer time — that's only in CloudWatch).

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS chime_pstn_call_id   TEXT,
  ADD COLUMN IF NOT EXISTS chime_pstn_dialed_at TIMESTAMPTZ;

COMMENT ON COLUMN consultations.chime_pstn_call_id   IS 'Chime SMA TransactionId for the outbound PSTN dial (audit).';
COMMENT ON COLUMN consultations.chime_pstn_dialed_at IS 'Server timestamp when /api/chime-dial placed the outbound call.';
