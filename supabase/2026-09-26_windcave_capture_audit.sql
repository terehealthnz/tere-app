-- 2026-09-26_windcave_capture_audit.sql
--
-- Audit columns for the Windcave auth-then-capture flow. When the provider
-- clicks Finalise notes, /api/capture-consult fires the matching Complete
-- against the auth. These columns record whether/when/how it settled so we
-- can tell at a glance which auths never captured (e.g. Windcave outage,
-- rejected complete, provider abandoned the encounter).
--
-- Idempotency: the endpoint checks payment_captured_at first and no-ops
-- if it's already set. Bookkeeping only — Windcave itself will reject a
-- duplicate Complete even if we somehow race.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS payment_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_captured_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS payment_captured_txn_id TEXT;

-- Quick lookup for "which consults finalised but never captured?" report.
CREATE INDEX IF NOT EXISTS idx_consult_capture_gap
  ON consultations (notes_finalised, payment_captured_at)
  WHERE notes_finalised = TRUE
    AND payment_captured_at IS NULL
    AND payment_intent_id IS NOT NULL
    AND (is_practice IS NOT TRUE);
