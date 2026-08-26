-- Pen-test #313-C2: webhook event dedup table.
--
-- _acc-webhook.js has no idempotency guard. ACC's retry policy fires the
-- same event up to 3× on transient timeouts; every retry re-runs the
-- UPDATE (overwrites paid_at with the retry timestamp), re-sends the admin
-- decline email, and pollutes the audit trail.
--
-- Same pattern applies to any other webhook we take from a 3rd party
-- (Stripe, Telnyx, LiveKit if added). This table is provider-agnostic —
-- key on (source, event_id) so any webhook can dedup.

CREATE TABLE IF NOT EXISTS processed_webhook_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source       TEXT NOT NULL,           -- 'acc' | 'stripe' | 'telnyx' | ...
  event_id     TEXT NOT NULL,           -- sender's event id (idempotency key)
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata     JSONB                    -- optional: event type, claim/consult id, whatever
);

CREATE UNIQUE INDEX IF NOT EXISTS processed_webhook_events_uniq
  ON processed_webhook_events (source, event_id);

CREATE INDEX IF NOT EXISTS processed_webhook_events_received_at_idx
  ON processed_webhook_events (received_at DESC);

ALTER TABLE processed_webhook_events ENABLE ROW LEVEL SECURITY;

-- Only server-side (service role) writes. No anon/authenticated access.
REVOKE ALL ON processed_webhook_events FROM anon, authenticated;

COMMENT ON TABLE processed_webhook_events IS
  'Webhook idempotency ledger. INSERT on (source, event_id) succeeds once;
   subsequent retries hit the unique constraint and the handler NOOPs. Age
   out rows > 30 days via a scheduled cron if this grows.';
