-- Password-gated $0.10 test-mode payments.
--
-- Lets ops run live payment/refund tests against production Windcave without
-- burning real consult fees. Payment amount is server-authoritative — the
-- server validates PAYMENT_TEST_PASSWORD in _windcave-create-session before
-- overriding amountCents to 10 and stamping this flag. Downstream
-- earnings / ACC / payroll reports MUST filter on payment_test_mode = false.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS payment_test_mode boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_consultations_payment_test_mode
  ON consultations(payment_test_mode) WHERE payment_test_mode = true;
