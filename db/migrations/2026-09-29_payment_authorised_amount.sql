-- Adds payment_authorised_amount_cents to record the actual hold amount
-- Windcave placed on the patient's card. Separate from payment_amount
-- (which is the current intended settle) so:
--   1. The Windcave auth-ceiling guard in /api/consultations PATCH can
--      compare provider changes against the true ceiling, not against
--      the current displayed amount (which drops on ACC conversion).
--   2. If the provider confirms ACC mid-visit and payment_amount drops
--      from $65 to $25, we still know the card is held for $65 so a
--      later revert to private ($65) is safe to capture.
--
-- Filled by /api/windcave-create-session at auth time. Nullable —
-- pre-migration rows keep behaving as before (guard falls back to
-- comparing against payment_amount, which was the pre-2026-09-29
-- behaviour anyway).

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS payment_authorised_amount_cents INTEGER;

COMMENT ON COLUMN consultations.payment_authorised_amount_cents IS
  'Actual Windcave auth ceiling in cents. Windcave will accept captures up to this amount. Set once at /api/windcave-create-session; never changes after.';
